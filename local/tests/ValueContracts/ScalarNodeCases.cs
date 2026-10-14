using System.Text.Json;
using Adam.Flow2.Contracts;
using Adam.Flow2.Runtime;

static class ScalarNodeCases
{
    public static void Run(Action<bool,string> check)
    {
        var nodes = new NodeRegistry(); ScalarNodes.Register(nodes);
        object Execute(string id, Dictionary<string,object> values, Dictionary<string,JsonElement>? config=null)
        {
            var node=nodes.Resolve(id,1);
            nodes.ValidatePorts(node.Definition.Inputs,values);
            var output=node.ExecuteConfigured!(values,config??[]);
            nodes.ValidatePorts(node.Definition.Outputs,output);
            return output["value"];
        }
        check((decimal)Execute("Standard.Math.Decimal.Add",new(){{"left",0.1m},{"right",0.2m}})==0.3m,"scalar node exact decimal addition");
        check((decimal)Execute("Standard.Math.Decimal.Round",new(){{"value",2.5m},{"digits",0}})==2m,"scalar node midpoint to even");
        check((decimal)Execute("Standard.Math.Decimal.Round",new(){{"value",-2.5m},{"digits",0}},new(){{"mode",JsonSerializer.SerializeToElement("awayFromZero")}})==-3m,"scalar node explicit midpoint mode");
        check((int)Execute("Standard.Math.Integer.Divide",new(){{"left",-7},{"right",2}})==-3,"integer division truncates toward zero");
        try {Execute("Standard.Math.Integer.Add",new(){{"left",int.MaxValue},{"right",1}});throw new Exception("overflow accepted");}catch(OverflowException){check(true,"integer overflow rejected");}
        try {Execute("Standard.Math.Decimal.Divide",new(){{"left",1m},{"right",0m}});throw new Exception("zero divisor accepted");}catch(DivideByZeroException){check(true,"zero division rejected");}
        check((bool)Execute("Standard.Compare.DateTimeOffset.Equals",new(){{"left",DateTimeOffset.Parse("2026-01-01T12:00:00+02:00")},{"right",DateTimeOffset.Parse("2026-01-01T10:00:00Z")}}),"date equality compares instants");
        check((string)Execute("Standard.Text.Join",new(){{"items",new[]{"A","","B"}},{"separator","\n"}})=="A\n\nB","String Join preserves empty strings and separators");
        check((string)Execute("Standard.Text.Join",new(){{"items",Array.Empty<string>()},{"separator",","}})=="","String Join returns empty string for empty list");
        check((string)Execute("Standard.Text.Replace",new(){{"value","a$a"},{"search","a"},{"replacement","$&"}})=="$&$$&","replacement treats dollar signs literally");
        check((bool)Execute("Standard.Logic.Xor",new(){{"left",true},{"right",false}}),"xor node");
        check((TimeSpan)Execute("Standard.Date.Difference",new(){{"left",DateTimeOffset.UnixEpoch.AddTicks(1)},{"right",DateTimeOffset.UnixEpoch}})==TimeSpan.FromTicks(1),"date difference preserves ticks");
        check((DateTimeOffset)Execute("Standard.Date.AddDuration",new(){{"value",DateTimeOffset.UnixEpoch},{"duration",TimeSpan.FromTicks(1)}})==DateTimeOffset.UnixEpoch.AddTicks(1),"date addition preserves ticks");
        check((string)Execute("Standard.Text.Trim",new(){{"value","\ufeff \u00a0hello\u2000"}})=="hello","shared trim whitespace");
        check((int)Execute("Standard.Convert.Integer.Parse",new(){{"value","-2147483648"}})==int.MinValue,"parse exact integer limit");
        check((decimal)Execute("Standard.Convert.Decimal.Parse",new(){{"value","1.2300"}})==1.23m,"parse decimal text");
        check((string)Execute("Standard.Convert.Bool.ToString",new(){{"value",false}})=="false","canonical bool text");
        try {Execute("Standard.Convert.Integer.Parse",new(){{"value"," 1"}});throw new Exception("whitespace accepted");}catch(FormatException){check(true,"strict integer text");}
        var today=(DateTimeOffset)Execute("Standard.Date.Today",[],new(){{"offsetMinutes",JsonSerializer.SerializeToElement(330)}});
        check(today.Offset==TimeSpan.FromMinutes(330)&&today.TimeOfDay==TimeSpan.Zero,"today at explicit offset");
        foreach(var node in nodes.Catalog.Nodes.Where(n=>n.FlowPort is not null))check(node.FlowPort=="input"?node.Outputs.Count==1:node.Inputs.Count==1&&node.Control?.Input==true,"scalar IO contracts");
    }
    public static void WriteCatalog(string path)
    {
        var nodes=new NodeRegistry();ScalarNodes.Register(nodes);
        File.WriteAllText(path,JsonSerializer.Serialize(nodes.Catalog,ContractSchemas.JsonOptions));
    }
}
