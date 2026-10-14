using Adam.Flow2.Contracts;
using Adam.Flow2.Runtime;
using Adam.Flow2.Jint;
using System.Text.Json;

static class GeneralValueCases
{
    public static void Run(Action<bool,string> check)
    {
        NativeInterfaces(check);
        ListMutationCases.Run(check);
        ListSelectionCases.Run(check);
        ListSelectionCases.Run(check,"list-advanced-cases.json");
        RecordCases.Run(check);
        RecordCases.Run(check,"dictionary-cases.json");
        DictionaryCases.Run(check);
        var text=new TypeRef("string");
        object? Run(ValueNodeBinding binding,Dictionary<string,object> values)
        {
            var definition=GeneralValueNodes.Definition(new("test",GeneralValueNodes.NodeType("test",binding.Operation),1,"server",[],Value:binding));
            var node=ValueRuntimeNodes.Create(definition);var registry=new NodeRegistry();
            registry.ValidatePorts(node.Definition.Inputs,values);
            var result=node.Execute!(values);
            registry.ValidatePorts(node.Definition.Outputs,result);
            return result.TryGetValue("value",out var value)?value:null;
        }
        foreach(var condition in new[]{true,false})check((string)Run(new("ternary",text),new(){{"condition",condition},{"whenTrue","yes"},{"whenFalse","no"}})! ==(condition?"yes":"no"),"Ternary selects the requested branch");
        check((string)Run(new("ternary",text),new(){{"condition",true},{"whenTrue",""},{"whenFalse","fallback"}})! =="","Ternary preserves empty strings");
        check(Run(new("ternary",new("nullable",Inner:text)),new(){{"condition",true},{"whenTrue",null!},{"whenFalse","fallback"}}) is null,"Ternary preserves selected null");
        var optional=GeneralValueNodes.Definition(new("optional",GeneralValueNodes.NodeType("optional","ternary"),1,"server",[],Value:new("ternary",new("optional",Inner:text))));
        var optionalNode=ValueRuntimeNodes.Create(optional);
        check(!optionalNode.Execute(new Dictionary<string,object>{{"condition",true},{"whenFalse","fallback"}}).ContainsKey("value"),"Ternary preserves absence of an optional branch");
        check((bool)Run(new("isMissing",text),[])!,"missing is distinct from an existing value");
        check(!(bool)Run(new("isMissing",new("nullable",Inner:text)),new(){{"value",null!}})!,"null is present");
        check((bool)Run(new("isNull",new("nullable",Inner:text)),new(){{"value",null!}})!,"null detection");
        check((string)Run(new("require",text),new(){{"value","ok"}})! =="ok","require preserves values");
        foreach(var inputs in new Dictionary<string,object>[] {[],new(){{"value",null!}}})
        {
            try {Run(new("require",text),inputs);throw new Exception("require accepted missing/null");}
            catch(InvalidOperationException){check(true,"require rejects missing/null");}
        }
        var recordType=new TypeRef("object",Fields:new(){{"text",text},{"note",new("optional",Inner:text)}});
        var original=new Dictionary<string,object>{{"text","before"},{"note","old"}};
        var changed=(IReadOnlyDictionary<string,object>)Run(new("withFields",recordType,Fields:["text","note"]),new(){{"value",original},{"field_text","after"}})!;
        check((string)changed["text"]=="after"&&!changed.ContainsKey("note"),"replacement removes absent optional field");
        check((string)original["text"]=="before"&&original.ContainsKey("note"),"WithFields never mutates its input");
        check((string)Run(new("getProperty",recordType,Member:"text"),new(){{"value",original}})! =="before","record property read");
        check(Run(new("null",text),[]) is null,"typed null");
        check((int)Run(new("count",text),new(){{"items",new List<string>()}})! ==0,"empty list count");
        check((string)Run(new("getItem",text),new(){{"items",new List<string>{"a","b"}},{"index",1}})! =="b","zero-based list access");
        foreach(var index in new[]{-1,2})try{Run(new("getItem",text),new(){{"items",new List<string>{"a","b"}},{"index",index}});throw new Exception("bad index accepted");}catch(ArgumentOutOfRangeException){check(true,"invalid index rejected");}
        check(((IEnumerable<object>)Run(new("list",text,Count:0),[])!).Count()==0,"empty list construction");
        foreach(var template in GeneralValueNodes.Templates())check(template.Value is null,"generic templates require specialization");
    }
    sealed class Entity { public string Name {get;set;}="native"; }
    static void NativeInterfaces(Action<bool,string> check)
    {
        var entity=new Entity();var entityType=new TypeRef("entity",Name:"test.Entity@1");
        var types=new TypeDocument(1,[new("test.Entity@1","entity",new(){{"Name",new("string")}})]);
        var ordered=new[]{entity}.AsQueryable().OrderBy(item=>item.Name);
        var grouping=new[]{entity}.GroupBy(item=>item.Name).Single();
        foreach(var (type,value,clr) in new (TypeRef,object,Type)[]{
            (entityType,entity,typeof(Entity)),
            (new("nullable",Inner:entityType),entity,typeof(Entity)),
            (new("optional",Inner:entityType),entity,typeof(Entity)),
            (new("array",Items:entityType),new[]{entity},typeof(Entity[])),
            (new("enumerable",Items:entityType),new[]{entity},typeof(IEnumerable<Entity>)),
            (new("queryable",Items:entityType),ordered,typeof(IQueryable<Entity>)),
            (new("orderedQueryable",Items:entityType),ordered,typeof(IOrderedQueryable<Entity>)),
            (new("grouping",Key:new("string"),Items:entityType),grouping,typeof(IGrouping<string,Entity>)),
            (new("object",Fields:new(){{"entity",entityType}}),new Dictionary<string,object>{{"entity",entity}},typeof(object))})
        {
            var nodes=new NodeRegistry(types);var codecs=new CodecRegistry(types,"server");
            nodes.Register(new(new("test.entity",1,new Dictionary<string,PortType>(),new Dictionary<string,PortType>{{"value",new("entity",typeof(Entity),entityType)}}),_=>new Dictionary<string,object>{{"value",entity}}));
            nodes.Register(new(new("test.start",1,new Dictionary<string,PortType>(),new Dictionary<string,PortType>(),Control:new(false,true,true)),_=>new Dictionary<string,object>()));
            if(type.Kind is "enumerable" or "queryable" or "orderedQueryable" or "grouping")
                nodes.Register(new(new("test.collection",1,new Dictionary<string,PortType>(),new Dictionary<string,PortType>{{"value",new(type.Kind,clr,type)}}),_=>new Dictionary<string,object>{{"value",value}}));
            var flow=new FlowDocument(2,"native-io",1,"backend",[
                new("start","test.start",1,"server",[]),
                new("input",GeneralValueNodes.NodeType("input","input"),1,"server",new(){{"name",JsonSerializer.SerializeToElement("arg")}},Value:new("input",type)),
                new("output",GeneralValueNodes.NodeType("output","output"),1,"server",new(){{"name",JsonSerializer.SerializeToElement("result")}},Value:new("output",type))
            ],[new(new("start","out"),new("output","in"),Kind:"control"),new(new("input","value"),new("output","value"))]);
            using var execution=new CompiledExecution(Guid.NewGuid(),flow,new(1,[]),new(1,"browser",[]),nodes,codecs,allowUnknownInputs:false,nativeInputs:new Dictionary<string,object>{{"arg",value}});
            var results=execution.Plan.Segments.Select(segment=>execution.Execute(segment.Id,new Dictionary<string,string>())).ToArray();
            var result=results.Single(result=>result.NativeOutputs.ContainsKey("result"));
            check(ReferenceEquals(result.NativeOutputs["result"],value),"native generic IO preserves "+type.Kind+" identity");
            check(result.Outputs.Count==0,"native IO never leaks into wire outputs");
            try{GeneralValueNodes.Definition(flow.Nodes[1] with{Environment="browser"});throw new Exception("native browser IO accepted");}catch(ContractException){check(true,"native IO rejects browser placement");}
        }
        var property=new ValueNodeBinding("getProperty",entityType,Member:"Name",Result:new("string"));
        GeneralValueRuntime.Validate(property,types);
        check((string)GeneralValueRuntime.Execute(property,new Dictionary<string,object>{{"value",entity}})["value"]=="native","registered native property read");
        try{GeneralValueRuntime.Validate(property with{Result=new("boolean")},types);throw new Exception("invalid entity field type accepted");}catch(InvalidOperationException){check(true,"entity property type must match registration");}
    }

}
