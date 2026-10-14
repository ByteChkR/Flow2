using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using Flow.Api;
using Flow.Contracts;
using Flow.Nodes.Server;
using Microsoft.AspNetCore.Mvc.Testing;

namespace Flow.Tests;

public class OrchestratorTests
{
    private sealed class Clock : TimeProvider {public DateTimeOffset Now=DateTimeOffset.UtcNow;public override DateTimeOffset GetUtcNow()=>Now;}
    private static T Read<T>(string name)=>JsonSerializer.Deserialize<T>(File.ReadAllText(Path.Combine(AppContext.BaseDirectory,$"examples/v1/{name}.json")),ContractSchemas.JsonOptions)!;
    private static FlowDocument Flow()=>Read<FlowDocument>("contact.flow");
    private static NodeCatalog Browser()=>new(1,Read<NodeCatalog>("catalog").Nodes.Where(node=>node.Environments.Contains("browser")).Select(node=>node with{Environments=["browser"]}).ToArray());
    private static string Session(Orchestrator service,string owner="owner")=>service.CreateSession(owner,Browser(),DemoCodecs.Definitions("browser"));
    private static Dictionary<string,string> Input(string value="contact-1")=>new(){{"0",DemoCodecs.Create(Read<TypeDocument>("types")).Encode(DemoCodecs.String,value)}};
    private static BrowserResult Result(BrowserWork work,Dictionary<string,string> wires)=>new(work.Segment!.Id,work.AttemptId!,wires);

    [Fact] public void Backend_executes_without_a_session()
    {
        using var service=new Orchestrator(new Clock());var state=service.Start(Read<FlowDocument>("backend.flow"),null,null);
        Assert.Equal("completed",state.State);Assert.Equal(new[]{"segment-0"},state.CompletedSegments);
    }
    [Theory][InlineData(false)][InlineData(true)] public void Interactive_requires_binding_even_when_first_segment_is_server(bool serverFirst)
    {
        using var service=new Orchestrator(new Clock());var flow=serverFirst?Read<FlowDocument>("backend.flow") with{Mode="interactive"}:Flow();
        var error=Assert.Throws<ProtocolException>(()=>service.Start(flow,null,null));Assert.Equal("session_required",error.Code);
        var session=Session(service);
        Assert.Equal(403,Assert.Throws<ProtocolException>(()=>service.Start(flow,session,"other")).Status);
    }
    [Fact] public void Browser_server_browser_completes_with_a_typed_result()
    {
        using var service=new Orchestrator(new Clock());var session=Session(service);var state=service.Start(Flow(),session,"owner");
        Assert.Equal("waiting_for_browser",state.State);
        var first=service.Next(state.ExecutionId,session,"owner");Assert.Empty(first.Wires!);
        state=service.Result(state.ExecutionId,session,"owner",Result(first,Input()));
        Assert.Equal(new[]{"segment-0","segment-1"},state.CompletedSegments);
        var last=service.Next(state.ExecutionId,session,"owner");
        Assert.Contains("Ada Lovelace",last.Wires!["3"]);
        state=service.Result(state.ExecutionId,session,"owner",Result(last,new()));
        Assert.Equal("completed",state.State);Assert.Equal(3,state.CompletedSegments.Length);
        Assert.Equal(new[]{"get","inspect","project"},state.Events.Where(trace=>trace.Kind=="node" && trace.Status=="completed").Select(trace=>trace.NodeId));
        Assert.All(state.Events.Where(trace=>trace.Kind=="node" && trace.Status=="completed"),trace=>Assert.True(trace.DurationMs>=0));
        Assert.Equal(2,state.Events.Count(trace=>trace.Kind=="boundary"));
        Assert.Equal(state.Events.Length,state.Events.Select(trace=>trace.Id).Distinct().Count());
        Assert.Equal("completed",state.Events.Last().Status);
    }
    [Fact] public void Another_browser_cannot_poll_or_submit_even_with_the_session_id()
    {
        using var service=new Orchestrator(new Clock());var session=Session(service);var state=service.Start(Flow(),session,"owner");
        var work=service.Next(state.ExecutionId,session,"owner");
        Assert.Equal(403,Assert.Throws<ProtocolException>(()=>service.Next(state.ExecutionId,session,"other")).Status);
        Assert.Equal(403,Assert.Throws<ProtocolException>(()=>service.Result(state.ExecutionId,session,"other",Result(work,Input()))).Status);
        Assert.Empty(service.Next(state.ExecutionId,session,"owner").Execution.CompletedSegments);
    }
    [Fact] public void Stale_attempts_and_duplicate_results_do_not_advance_execution()
    {
        using var service=new Orchestrator(new Clock());var session=Session(service);var state=service.Start(Flow(),session,"owner");var work=service.Next(state.ExecutionId,session,"owner");
        Assert.Equal(409,Assert.Throws<ProtocolException>(()=>service.Result(state.ExecutionId,session,"owner",Result(work,Input()) with{AttemptId="fake"})).Status);
        service.Result(state.ExecutionId,session,"owner",Result(work,Input()));
        Assert.Equal(409,Assert.Throws<ProtocolException>(()=>service.Result(state.ExecutionId,session,"owner",Result(work,Input()))).Status);
    }
    [Fact] public void Tampered_payload_fails_before_server_nodes()
    {
        using var service=new Orchestrator(new Clock());var session=Session(service);var state=service.Start(Flow(),session,"owner");var work=service.Next(state.ExecutionId,session,"owner");
        state=service.Result(state.ExecutionId,session,"owner",Result(work,new(){{"0","{}"}}));
        Assert.Equal("failed",state.State);Assert.Equal("invalid_result",state.Error!.Code);Assert.Equal("get",state.Error.NodeId);Assert.Empty(state.CompletedSegments);
    }
    [Fact] public void Browser_failure_is_terminal_and_attributed()
    {
        using var service=new Orchestrator(new Clock());var session=Session(service);var state=service.Start(Flow(),session,"owner");var work=service.Next(state.ExecutionId,session,"owner");
        state=service.Result(state.ExecutionId,session,"owner",Result(work,new()) with{Error=new("failed","UI callback failed","input")});
        Assert.Equal("failed",state.State);Assert.Equal("input",state.Error!.NodeId);
    }
    [Fact] public void Node_failure_keeps_execution_and_node_ids()
    {
        using var service=new Orchestrator(new Clock());var session=Session(service);var state=service.Start(Flow(),session,"owner");var work=service.Next(state.ExecutionId,session,"owner");
        var failed=service.Result(state.ExecutionId,session,"owner",Result(work,Input("missing")));
        Assert.Equal(state.ExecutionId,failed.ExecutionId);Assert.Equal("failed",failed.State);Assert.Equal("get",failed.Error!.NodeId);
        Assert.Contains(failed.Events,trace=>trace.Kind=="node" && trace.NodeId=="get" && trace.Status=="failed");
        Assert.DoesNotContain(failed.Events,trace=>trace.Kind=="node" && trace.NodeId=="project");
    }
    [Fact] public void Lease_expiry_is_processed_without_a_client_poll()
    {
        var clock=new Clock();using var service=new Orchestrator(clock);var session=Session(service);var state=service.Start(Flow(),session,"owner");
        clock.Now+=TimeSpan.FromSeconds(31);service.Sweep();
        var failed=service.Next(state.ExecutionId,session,"owner").Execution;
        Assert.Equal("failed",failed.State);Assert.Equal("session_lost",failed.Error!.Code);
        Assert.Throws<ProtocolException>(()=>service.Start(Flow(),session,"owner"));
    }
    [Fact] public void Repeated_polling_cannot_keep_a_hung_segment_alive()
    {
        var clock=new Clock();using var service=new Orchestrator(clock);var session=Session(service);var state=service.Start(Flow(),session,"owner");
        clock.Now+=TimeSpan.FromSeconds(20);service.Next(state.ExecutionId,session,"owner");
        clock.Now+=TimeSpan.FromSeconds(11);service.Sweep();
        Assert.Equal("browser_timeout",service.Next(state.ExecutionId,session,"owner").Execution.Error!.Code);
    }
    [Fact] public void Closing_a_session_fails_its_waiting_execution()
    {
        using var service=new Orchestrator(new Clock());var session=Session(service);var state=service.Start(Flow(),session,"owner");
        Assert.Throws<ProtocolException>(()=>service.CloseSession(session,"other"));service.CloseSession(session,"owner");
        Assert.Equal("session_lost",service.Next(state.ExecutionId,session,"owner").Execution.Error!.Code);
    }
    [Fact] public async Task Http_cookie_binding_rejects_a_second_browser_and_completes_for_owner()
    {
        await using var app=new WebApplicationFactory<Program>();using var owner=app.CreateClient();using var other=app.CreateClient();
        var rejected=await owner.PostAsJsonAsync("/api/executions",new{flow=Flow()},ContractSchemas.JsonOptions);Assert.Equal(HttpStatusCode.Conflict,rejected.StatusCode);
        var created=await owner.PostAsJsonAsync("/api/sessions",new{browserCatalog=Browser(),browserCodecs=DemoCodecs.Definitions("browser")},ContractSchemas.JsonOptions);
        Assert.Equal(HttpStatusCode.Created,created.StatusCode);Assert.Contains("httponly",string.Join("",created.Headers.GetValues("Set-Cookie")).ToLowerInvariant());
        var session=(await created.Content.ReadFromJsonAsync<JsonElement>()).GetProperty("sessionId").GetString()!;
        owner.DefaultRequestHeaders.Add("X-Flow-Session",session);other.DefaultRequestHeaders.Add("X-Flow-Session",session);
        var start=await owner.PostAsJsonAsync("/api/executions",new{flow=Flow(),sessionId=session},ContractSchemas.JsonOptions);
        Assert.Equal(HttpStatusCode.Created,start.StatusCode);var state=(await start.Content.ReadFromJsonAsync<ExecutionSnapshot>(ContractSchemas.JsonOptions))!;
        var work=(await owner.GetFromJsonAsync<BrowserWork>($"/api/executions/{state.ExecutionId}/next",ContractSchemas.JsonOptions))!;
        var stolen=await other.PostAsJsonAsync($"/api/executions/{state.ExecutionId}/result",Result(work,Input()),ContractSchemas.JsonOptions);Assert.Equal(HttpStatusCode.Forbidden,stolen.StatusCode);
        var accepted=await owner.PostAsJsonAsync($"/api/executions/{state.ExecutionId}/result",Result(work,Input()),ContractSchemas.JsonOptions);Assert.Equal(HttpStatusCode.OK,accepted.StatusCode);
        work=(await owner.GetFromJsonAsync<BrowserWork>($"/api/executions/{state.ExecutionId}/next",ContractSchemas.JsonOptions))!;
        var completed=await owner.PostAsJsonAsync($"/api/executions/{state.ExecutionId}/result",Result(work,new()),ContractSchemas.JsonOptions);
        Assert.Equal("completed",(await completed.Content.ReadFromJsonAsync<ExecutionSnapshot>(ContractSchemas.JsonOptions))!.State);
    }

    [Fact] public void Multiple_environment_switches_share_one_execution_context()
    {
        using var service=new Orchestrator(new Clock());var original=Flow();
        var browser=Browser();browser=new(1,[..browser.Nodes,new("test.gate",1,["browser"],new(){{"value",ContactDemo.DtoType.ContractType}},new(){{"id",new("string")}})]);
        var session=service.CreateSession("owner",browser,DemoCodecs.Definitions("browser"));
        var flow=original with{Nodes=[..original.Nodes.Take(4),new("gate","test.gate",1,"browser",new()),
            original.Nodes[1] with{Id="get2"},original.Nodes[2] with{Id="inspect2"},original.Nodes[3] with{Id="project2"},original.Nodes[4]],
            Connections=[..original.Connections.Take(3),new(new("project","dto"),new("gate","value"),DemoCodecs.Contact),
            new(new("gate","id"),new("get2","id"),DemoCodecs.String),new(new("get2","contact"),new("inspect2","contact")),
            new(new("inspect2","contact"),new("project2","contact")),new(new("project2","dto"),new("display","value"),DemoCodecs.Contact)]};
        var state=service.Start(flow,session,"owner");var first=service.Next(state.ExecutionId,session,"owner");
        service.Result(state.ExecutionId,session,"owner",Result(first,Input()));
        var middle=service.Next(state.ExecutionId,session,"owner");Assert.Equal("segment-2",middle.Segment!.Id);
        service.Result(state.ExecutionId,session,"owner",Result(middle,new(){{"4",Input()["0"]}}));
        var last=service.Next(state.ExecutionId,session,"owner");Assert.Equal("segment-4",last.Segment!.Id);Assert.Contains("Ada Lovelace",last.Wires!["7"]);
        var completed=service.Result(state.ExecutionId,session,"owner",Result(last,new()));Assert.Equal("completed",completed.State);Assert.Equal(5,completed.CompletedSegments.Length);
    }
    [Fact] public async Task Concurrent_duplicate_results_advance_only_once()
    {
        using var service=new Orchestrator(new Clock());var session=Session(service);var state=service.Start(Flow(),session,"owner");var work=service.Next(state.ExecutionId,session,"owner");
        var outcomes=await Task.WhenAll(Enumerable.Range(0,2).Select(_=>Task.Run(()=>{
            try{service.Result(state.ExecutionId,session,"owner",Result(work,Input()));return 200;}
            catch(ProtocolException error){return error.Status;}
        })));
        Assert.Equal(new[]{200,409},outcomes.Order());Assert.Equal(2,service.Next(state.ExecutionId,session,"owner").Execution.CompletedSegments.Length);
    }

    [Fact] public async Task Http_backend_needs_no_session_and_old_unbound_entrypoint_is_absent()
    {
        await using var app=new WebApplicationFactory<Program>();using var client=app.CreateClient();
        var backend=await client.PostAsJsonAsync("/api/executions",new{flow=Read<FlowDocument>("backend.flow")},ContractSchemas.JsonOptions);
        Assert.Equal(HttpStatusCode.Created,backend.StatusCode);
        Assert.Equal("completed",(await backend.Content.ReadFromJsonAsync<ExecutionSnapshot>(ContractSchemas.JsonOptions))!.State);
        var retired=await client.PostAsJsonAsync("/api/demo/compiled",new{flow=Flow()},ContractSchemas.JsonOptions);
        Assert.Equal(HttpStatusCode.NotFound,retired.StatusCode);
    }
}
