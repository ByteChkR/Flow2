using System.Text.Json;
using Adam.Flow2.Contracts;
using Adam.Flow2.Runtime;

if(args.Length==2&&args[0]=="--write-format-fixture"){FormattingCases.WriteFixture(args[1]);return;}
if(args.Length==2&&args[0]=="--write-numeric-fixtures"){NumericCases.Write(args[1]);return;}

if(args.Length==2&&args[0]=="--write-scalar-node-catalog"){ScalarNodeCases.WriteCatalog(args[1]);return;}

var checks=0;
void Check(bool valid,string message){if(!valid)throw new Exception(message);checks++;}
var codecs=new CodecRegistry(new(1,[]),"server");
codecs.RegisterScalars();
foreach(var fixture in JsonDocument.Parse(File.ReadAllText(Path.Combine(AppContext.BaseDirectory,"Fixtures/scalar-values.json"))).RootElement.EnumerateArray())
{
    var name=fixture.GetProperty("name").GetString()!;var input=fixture.GetProperty("input");
    if(fixture.TryGetProperty("invalid",out _))
    {
        try{ScalarValues.Parse(name,input);throw new Exception($"Invalid scalar accepted: {fixture}");}catch(FormatException){Check(true,$"{name} invalid value rejected");}
    }
    else
    {
        Check(TransportContracts.Equivalent(ScalarValues.Parse(name,input),fixture.GetProperty("canonical")),$"{name} canonical parse");
        Check(ScalarValues.IsValue(name,input)==fixture.GetProperty("wire").GetBoolean(),$"{name} strict wire representation");
        var canonical=fixture.GetProperty("canonical");
        var reference=new CodecReference(name,1);
        var type=new TypeRef("scalar",Name:name);
        var native=FlowValues.Decode(type,canonical);
        Check(TransportContracts.Equivalent(FlowValues.Encode(type,codecs.Decode(reference,codecs.Encode(reference,native),type)),canonical),$"{name} native codec round-trip");
    }
}

ConditionalInputCases.Run(Check);
ScalarNodeCases.Run(Check);
TextCases.Run(Check);
TextCases.Run(Check,"regex-cases.json");
TextCases.Run(Check,"json-cases.json");
TextCases.Run(Check,"temporal-cases.json");
GeneralValueCases.Run(Check);
InlineInputCases.Run(Check);
HybridCases.Run(Check);
FormattingCases.Run(Check);
await GraphControlCases.Run(Check);

var compositeTypes=new TypeDocument(1,[new("test.Customer@1","entity",[])]);
var compositeCodecs=new CodecRegistry(compositeTypes,"server");
foreach(var fixture in JsonDocument.Parse(File.ReadAllText(Path.Combine(AppContext.BaseDirectory,"Fixtures/composite-values.json"))).RootElement.EnumerateArray())
{
    var type=fixture.GetProperty("type").Deserialize<TypeRef>(ContractSchemas.JsonOptions)!;
    var reference=compositeCodecs.RegisterValue(type);
    Check(reference.TypeId==fixture.GetProperty("typeId").GetString(),"stable shared composite codec identity");
    foreach(var value in fixture.GetProperty("valid").EnumerateArray())
    {
        var envelope=JsonSerializer.Serialize(new WireEnvelope(1,reference.TypeId,1,JsonSerializer.SerializeToElement(new{value})),ContractSchemas.JsonOptions);
        var native=compositeCodecs.Decode(reference,envelope,type);
        var returned=ContractSchemas.Parse<WireEnvelope>("envelope",compositeCodecs.Encode(reference,native));
        Check(TransportContracts.Equivalent(returned.Payload.GetProperty("value"),value),"composite wire values round-trip through native CLR values");
    }
    foreach(var value in fixture.GetProperty("invalid").EnumerateArray())
    {
        var envelope=JsonSerializer.Serialize(new WireEnvelope(1,reference.TypeId,1,JsonSerializer.SerializeToElement(new{value})),ContractSchemas.JsonOptions);
        try{compositeCodecs.Decode(reference,envelope,type);throw new Exception("Invalid composite accepted");}
        catch(ContractException){Check(true,"invalid composite payload rejected before native conversion");}
    }
}
try{ValueCodecs.Definition(new("array",Items:new("entity",Name:"test.Customer@1")));throw new Exception("Entity codec accepted");}
catch(InvalidOperationException){Check(true,"composite codecs reject nested native entities");}
var dtoType=new TypeRef("object",Fields:new(){{"amount",new("scalar",Name:"core.Decimal")},{"at",new("scalar",Name:"core.DateTimeOffset")},{"duration",new("scalar",Name:"core.TimeSpan")}});
var dtoPort=new PortType("dto",typeof(ExactDto),dtoType);
var adapter=new NodeRegistry();
var dto=(ExactDto)adapter.Adapt(dtoPort,new Dictionary<string,object>{{"amount",9007199254740993m},{"at",new DateTimeOffset(2026,12,25,12,34,56,TimeSpan.FromHours(2)).AddTicks(1234567)},{"duration",TimeSpan.MaxValue}});
Check(dto.Amount==9007199254740993m&&dto.At.Offset==TimeSpan.FromHours(2)&&dto.At.Ticks%TimeSpan.TicksPerSecond==1234567&&dto.Duration==TimeSpan.MaxValue,"dynamic record adapter restores typed native DTO without precision loss");
Check(ReferenceEquals(dto,adapter.Adapt(dtoPort,dto)),"already-native DTO adapter preserves identity");
var scalarRegistry=new TypeRegistry(new(1,[]));
var decimalScalar=new TypeRef("scalar",Name:"core.Decimal");
var nullableDecimal=new TypeRef("nullable",Inner:decimalScalar);
Check(!scalarRegistry.IsAssignable(decimalScalar,new("string"))&&!scalarRegistry.IsAssignable(decimalScalar,new("scalar",Name:"core.TimeSpan")),"scalar types are nominal despite string wire representation");
Check(scalarRegistry.IsAssignable(decimalScalar,nullableDecimal)&&!scalarRegistry.IsAssignable(nullableDecimal,decimalScalar),"nullable assignment direction");
Check(scalarRegistry.ValidateValue(nullableDecimal,JsonSerializer.SerializeToElement<object?>(null)).Count==0&&scalarRegistry.ValidateValue(nullableDecimal,default).Count>0,"null and absent are distinct");
var recordType=new TypeRef("array",Items:new("object",Fields:new(){{"amount",decimalScalar},{"comment",new("optional",Inner:new("nullable",Inner:new("string")))}}));
FlowInterfaces.RequireValues([new("rows","rows",recordType)],new Dictionary<string,JsonElement>{{"rows",JsonDocument.Parse("[{\"amount\":\"9007199254740993\"},{\"amount\":\"0.1\",\"comment\":null}]").RootElement}});
Check(true,"recursive list/record flow arguments preserve exact scalars and nullable/optional fields");
var authoring=new NodeRegistry();
authoring.Register<NullableGuidNode>();
authoring.Register<OptionalGuidNode>();
authoring.Register<OptionalTextNode>();
var nullable=authoring.Resolve("test.nullable.guid",1);
Check(nullable.Definition.Inputs["value"].ContractType.Kind=="nullable","nullable CLR properties generate required nullable ports");
var nullResult=nullable.Execute(new Dictionary<string,object>{{"value",null!}});
authoring.ValidatePorts(nullable.Definition.Outputs,nullResult);
Check(nullResult.ContainsKey("value")&&nullResult["value"] is null,"required nullable output preserves explicit null");
try{authoring.ValidatePorts(nullable.Definition.Inputs,new Dictionary<string,object>());throw new Exception("Required null input was optional");}catch(InvalidOperationException){Check(true,"required nullable input cannot be absent");}
foreach(var id in new[]{"test.optional.guid","test.optional.text"})
{
    var node=authoring.Resolve(id,1);
    Check(node.Definition.Inputs["value"].ContractType is {Kind:"optional",Inner.Kind:"nullable"},"FlowOptional<T?> generates separate optional and nullable contracts");
    var absent=node.Execute(new Dictionary<string,object>());
    authoring.ValidatePorts(node.Definition.Outputs,absent);
    Check(!absent.ContainsKey("value"),"FlowOptional preserves missing value");
    var explicitNull=node.Execute(new Dictionary<string,object>{{"value",null!}});
    authoring.ValidatePorts(node.Definition.Outputs,explicitNull);
    Check(explicitNull.ContainsKey("value")&&explicitNull["value"] is null,"FlowOptional preserves present null");
}
authoring.Register<LegacyOptionalGuidNode>();
var legacyOptional=authoring.Resolve("test.optional.legacy",1);
Check(legacyOptional.Definition.Inputs["value"].ContractType is {Kind:"optional",Inner.Kind:"scalar"},"legacy Optional=true keeps absence-only semantics");
Check(!legacyOptional.Execute(new Dictionary<string,object>()).ContainsKey("value"),"legacy optional output null still means absence");
try{authoring.Register<InvalidNullOptionalGuidNode>();throw new Exception("Non-nullable CLR value accepted as nullable");}
catch(InvalidOperationException){Check(true,"nullable optional CLR value requires Nullable<T> inside wrapper");}
NumericCases.Run(Check);
var exactDefaults=new NodeTypeMap();
Check(exactDefaults.Resolve(typeof(decimal)).ContractType==new TypeRef("scalar",Name:"core.Decimal"),"new authored decimals use the exact scalar contract by default");
Check(exactDefaults.Resolve(typeof(bool)).ContractType==new TypeRef("scalar",Name:"core.Bool"),"new authored booleans use the nominal scalar contract by default");
Check(exactDefaults.Resolve(typeof(List<decimal?>)).ContractType is {Kind:"array",Items.Kind:"nullable",Items.Inner.Name:"core.Decimal"},"materialized generic lists infer nullable scalar elements");
authoring.Register<ExactListNode>();
var exactList=authoring.Resolve("test.list.exact",1);
var listValue=new List<decimal>{9007199254740993.1m,0.0000000000000000000000000001m};
var listOutput=exactList.Execute(new Dictionary<string,object>{{"values",listValue},{"enabled",false}});
Check(ReferenceEquals(listOutput["values"],listValue)&&Equals(listOutput["enabled"],false),"class-authored exact lists retain native identity and false values");
authoring.ValidatePorts(exactList.Definition.Outputs,listOutput);
Check(exactList.Definition.Inputs["values"].ContractType is {Kind:"array",Items.Name:"core.Decimal"},"authored lists expose exact element metadata");
authoring.Register<NullableListNode>();
var nullableList=authoring.Resolve("test.list.nullable",1);
Check(nullableList.Definition.Outputs["values"].ContractType is {Kind:"array",Items.Kind:"nullable",Items.Inner.Kind:"string"},"list reference-element nullability is inferred from C# annotations");
authoring.ValidatePorts(nullableList.Definition.Outputs,nullableList.Execute(new Dictionary<string,object>()));
Console.WriteLine($"{checks} scalar, composite and numeric contract checks passed.");

[FlowNode("test.list.exact")]
sealed class ExactListNode:IFlowNode
{
    [FlowInput("values")] public List<decimal> Values {get;set;}=[];
    [FlowInput("enabled")] public bool Enabled {get;set;}
    [FlowOutput("values")] public IReadOnlyList<decimal> Result {get;private set;}=[];
    [FlowOutput("enabled")] public bool ResultEnabled {get;private set;}
    public void Execute(){Result=Values;ResultEnabled=Enabled;}
}
[FlowNode("test.list.nullable")]
sealed class NullableListNode:IFlowNode
{
    [FlowOutput("values")] public IReadOnlyList<string?> Values {get;}=["present",null];
    public void Execute(){}
}

[FlowNode("test.nullable.guid")]
sealed class NullableGuidNode:IFlowNode
{
    [FlowInput("value")] public Guid? Input {get;set;}
    [FlowOutput("value")] public Guid? Output {get;private set;}
    public void Execute()=>Output=Input;
}
[FlowNode("test.optional.guid")]
sealed class OptionalGuidNode:IFlowNode
{
    [FlowInput("value")] public FlowOptional<Guid?> Input {get;set;}
    [FlowOutput("value")] public FlowOptional<Guid?> Output {get;private set;}
    public void Execute()=>Output=Input;
}
[FlowNode("test.optional.text")]
sealed class OptionalTextNode:IFlowNode
{
    [FlowInput("value")] public FlowOptional<string?> Input {get;set;}
    [FlowOutput("value")] public FlowOptional<string?> Output {get;private set;}
    public void Execute()=>Output=Input;
}


[FlowNode("test.optional.legacy")]
sealed class LegacyOptionalGuidNode:IFlowNode
{
    [FlowInput("value",Optional=true)] public Guid? Input {get;set;}
    [FlowOutput("value",Optional=true)] public Guid? Output {get;private set;}
    public void Execute()=>Output=Input;
}
[FlowNode("test.optional.invalid")]
sealed class InvalidNullOptionalGuidNode:IFlowNode
{
    [FlowInput("value",AllowNull=true)] public FlowOptional<Guid> Input {get;set;}
    public void Execute(){}
}

sealed record ExactDto(decimal Amount, DateTimeOffset At, TimeSpan Duration);
