using Flow.Contracts;
using System.Text.Json;
using Adam.Flow2.Runtime;
using Flow.Nodes.Server;
using Flow.Runtime.Jint;

namespace Flow.Tests;

public class ServerSegmentTests
{
    [Fact]
    public void Jint_preserves_the_actual_clr_instance_and_exports_only_the_dto()
    {
        var demo = new ContactDemo();
        var result = TestRuntimes.Runner(demo.Registry).Execute(ContactDemo.Plan());
        Assert.Same(demo.Original, demo.Inspected);
        Assert.IsType<Contact>(demo.Inspected);
        Assert.Equal(new ContactDto("contact-1", "Ada Lovelace"),
            result.Value.Deserialize<ContactDto>(JsonSerializerOptions.Web));
        Assert.Equal(["id", "name"], result.Value.EnumerateObject().Select(p => p.Name).ToArray());
        Assert.Contains("invokeNode", result.GeneratedJavaScript);
    }

    [Fact]
    public void Handles_are_execution_local_and_expire_with_the_store()
    {
        var value = new Contact("1", "Ada");
        using var first = new ExecutionValueStore();
        using var second = new ExecutionValueStore();
        var handle = first.Add(value);
        Assert.Same(value, first.Resolve(handle));
        Assert.Throws<InvalidOperationException>(() => second.Resolve(handle));
        Assert.Throws<InvalidOperationException>(() => first.Resolve("forged"));
        first.Dispose();
        Assert.Throws<ObjectDisposedException>(() => first.Resolve(handle));
    }

    [Fact]
    public void Local_entity_cannot_escape_as_a_segment_result()
    {
        var demo = new ContactDemo();
        var plan = ContactDemo.Plan() with { Result = new("get", "contact") };
        var error = Assert.Throws<ContractException>(() => TestRuntimes.Runner(demo.Registry).Execute(plan));
        Assert.Contains(error.Diagnostics, diagnostic => diagnostic.Code == "not_transportable");
        Assert.Null(demo.Inspected);
    }

    [Fact]
    public void Type_mismatch_is_rejected_before_any_node_runs()
    {
        var demo = new ContactDemo();
        var plan = ContactDemo.Plan();
        var steps = plan.Steps.ToArray();
        steps[1] = steps[1] with { Inputs = new Dictionary<string, InputBinding> { ["contact"] = new StringInput("wrong") } };
        Assert.Throws<InvalidOperationException>(() => TestRuntimes.Runner(demo.Registry).Execute(plan with { Steps = steps }));
        Assert.Null(demo.Inspected);
    }

    [Theory]
    [InlineData("unknown", "contact")]
    [InlineData("get", "missing")]
    [InlineData("project", "dto")]
    public void Missing_ports_and_forward_references_are_rejected(string node, string port)
    {
        var demo = new ContactDemo();
        var plan = ContactDemo.Plan();
        var steps = plan.Steps.ToArray();
        steps[1] = steps[1] with { Inputs = new Dictionary<string, InputBinding> { ["contact"] = new OutputInput(node, port) } };
        Assert.Throws<InvalidOperationException>(() => TestRuntimes.Runner(demo.Registry).Execute(plan with { Steps = steps }));
    }

    [Fact]
    public void Unsupported_node_version_is_rejected()
    {
        var plan = ContactDemo.Plan();
        var steps = plan.Steps.ToArray();
        steps[0] = steps[0] with { Version = 99 };
        Assert.Throws<InvalidOperationException>(() => TestRuntimes.Runner(new ContactDemo().Registry).Execute(plan with { Steps = steps }));
    }

    [Fact]
    public void Node_failures_include_execution_and_node_identity()
    {
        var error = Assert.Throws<SegmentExecutionException>(() =>
            TestRuntimes.Runner(new ContactDemo().Registry).Execute(ContactDemo.Plan("missing")));
        Assert.NotEqual(Guid.Empty, error.ExecutionId);
        Assert.Equal("get", error.NodeId);
        Assert.Contains("Contact not found", error.ToString());
    }

    [Fact]
    public void Literal_code_is_data_and_does_not_execute()
    {
        const string literal = "\"); throw new Error('injected'); //\n\\";
        var registry = new NodeRegistry();
        registry.Register(new(new("echo", 1,
            new Dictionary<string, PortType> { ["text"] = ContactDemo.StringType },
            new Dictionary<string, PortType> { ["text"] = ContactDemo.StringType }), inputs => inputs));
        var plan = new ServerPlan([new("echo", "echo", 1,
            new Dictionary<string, InputBinding> { ["text"] = new StringInput(literal) })], new("echo", "text"), DemoCodecs.String);
        Assert.Equal(literal, TestRuntimes.Runner(registry).Execute(plan).Value.GetString());
    }

    [Fact]
    public void Statement_limit_fails_the_execution_in_a_controlled_way()
    {
        var demo = new ContactDemo();
        var error = Assert.Throws<SegmentExecutionException>(() =>
            TestRuntimes.Runner(demo.Registry, maxStatements: 1).Execute(ContactDemo.Plan()));
        Assert.IsType<Jint.Runtime.StatementsCountOverflowException>(error.InnerException);
        Assert.NotEqual(Guid.Empty, error.ExecutionId);
        Assert.Null(demo.Inspected);
    }

    [Fact]
    public void Node_output_is_validated_before_projection()
    {
        var registry = new NodeRegistry();
        registry.Register(new(new("broken", 1, new Dictionary<string, PortType>(),
            new Dictionary<string, PortType> { ["value"] = ContactDemo.StringType }),
            _ => new Dictionary<string, object> { ["value"] = new Contact("1", "Ada") }));
        var plan = new ServerPlan([new("broken", "broken", 1, new Dictionary<string, InputBinding>())], new("broken", "value"), DemoCodecs.String);
        var error = Assert.Throws<SegmentExecutionException>(() => TestRuntimes.Runner(registry).Execute(plan));
        Assert.Equal("broken", error.NodeId);
        Assert.Contains("Expected string", error.ToString());
    }
}
