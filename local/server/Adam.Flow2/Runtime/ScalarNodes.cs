using System.Text.Json;
using Adam.Flow2.Contracts;

namespace Adam.Flow2.Runtime;

/// <summary>General scalar nodes, independent of Adam domain services.</summary>
public static class ScalarNodes
{
    public static void Register(NodeRegistry nodes)
    {
        var map = new NodeTypeMap();
        PortType Port<T>() => map.Resolve(typeof(T));
        void Add(string id, string label, string category, Dictionary<string,PortType> inputs, PortType output,
            Func<IReadOnlyDictionary<string,object>,IReadOnlyDictionary<string,JsonElement>,object> execute,
            Dictionary<string,ConfigField>? config = null, string? flowPort = null)
        {
            var definition = new NodeDefinition(id,1,inputs,flowPort == "output" ? new Dictionary<string,PortType>() : new Dictionary<string,PortType> {{"value",output}},
                new(Label:label,Category:category),config,flowPort == "output" ? new(true,false,false) : null,flowPort);
            nodes.Register(new(definition, _ => throw new InvalidOperationException("Configured execution required."),
                ExecuteConfigured:(values,configuration) => new Dictionary<string,object>{{"value",execute(values,configuration)}}));
        }
        Add("Standard.Values.Constant.Decimal","Constant Decimal","Values",[],Port<decimal>(),(_,c)=>FlowValues.Decode(new("scalar",Name:"core.Decimal"),c.TryGetValue("value",out var v)?v:JsonSerializer.SerializeToElement("0")),
            new() {{"value",new("scalar",JsonSerializer.SerializeToElement("0"),"Value",Scalar:"core.Decimal")}});
        Add("Standard.Values.Constant.Bool","Constant bool","Values",[],Port<bool>(),(_,c)=>FlowValues.Decode(new("scalar",Name:"core.Bool"),c.TryGetValue("value",out var v)?v:JsonSerializer.SerializeToElement(false)),
            new() {{"value",new("scalar",JsonSerializer.SerializeToElement(false),"Value",Scalar:"core.Bool")}});
        Add("Standard.Values.Constant.Integer","Constant integer","Values",[],Port<int>(),(_,c)=>FlowValues.Decode(new("scalar",Name:"core.Integer"),c.TryGetValue("value",out var v)?v:JsonSerializer.SerializeToElement(0)),
            new() {{"value",new("scalar",JsonSerializer.SerializeToElement(0),"Value",Scalar:"core.Integer")}});
        Add("Standard.Values.Constant.Guid","Constant guid","Values",[],Port<Guid>(),(_,c)=>FlowValues.Decode(new("scalar",Name:"core.Guid"),c.TryGetValue("value",out var v)?v:JsonSerializer.SerializeToElement("00000000-0000-0000-0000-000000000000")),
            new() {{"value",new("scalar",JsonSerializer.SerializeToElement("00000000-0000-0000-0000-000000000000"),"Value",Scalar:"core.Guid")}});
        Add("Standard.Values.Constant.TimeSpan","Constant timespan","Values",[],Port<TimeSpan>(),(_,c)=>FlowValues.Decode(new("scalar",Name:"core.TimeSpan"),c.TryGetValue("value",out var v)?v:JsonSerializer.SerializeToElement("0")),
            new() {{"value",new("scalar",JsonSerializer.SerializeToElement("0"),"Value",Scalar:"core.TimeSpan")}});
        Add("Standard.Math.Decimal.Add","Add (decimal)","Math",new() {{"left",Port<decimal>()},{"right",Port<decimal>()}},Port<decimal>(),(v,_)=>DecimalMath.Add((decimal)v["left"],(decimal)v["right"]));
        Add("Standard.Math.Decimal.Subtract","Subtract (decimal)","Math",new() {{"left",Port<decimal>()},{"right",Port<decimal>()}},Port<decimal>(),(v,_)=>DecimalMath.Subtract((decimal)v["left"],(decimal)v["right"]));
        Add("Standard.Math.Decimal.Multiply","Multiply (decimal)","Math",new() {{"left",Port<decimal>()},{"right",Port<decimal>()}},Port<decimal>(),(v,_)=>DecimalMath.Multiply((decimal)v["left"],(decimal)v["right"]));
        Add("Standard.Math.Decimal.Divide","Divide (decimal)","Math",new() {{"left",Port<decimal>()},{"right",Port<decimal>()}},Port<decimal>(),(v,_)=>DecimalMath.Divide((decimal)v["left"],(decimal)v["right"]));
        Add("Standard.Math.Integer.Add","Add (integer)","Math",new() {{"left",Port<int>()},{"right",Port<int>()}},Port<int>(),(v,_)=>IntegerMath.Add((int)v["left"],(int)v["right"]));
        Add("Standard.Math.Integer.Subtract","Subtract (integer)","Math",new() {{"left",Port<int>()},{"right",Port<int>()}},Port<int>(),(v,_)=>IntegerMath.Subtract((int)v["left"],(int)v["right"]));
        Add("Standard.Math.Integer.Multiply","Multiply (integer)","Math",new() {{"left",Port<int>()},{"right",Port<int>()}},Port<int>(),(v,_)=>IntegerMath.Multiply((int)v["left"],(int)v["right"]));
        Add("Standard.Math.Integer.Divide","Divide (integer)","Math",new() {{"left",Port<int>()},{"right",Port<int>()}},Port<int>(),(v,_)=>IntegerMath.Divide((int)v["left"],(int)v["right"]));
        Add("Standard.Math.Decimal.Round","Round (decimal)","Math",new() {{"value",Port<decimal>()},{"digits",Port<int>()}},Port<decimal>(),(v,c)=>DecimalMath.Round((decimal)v["value"],(int)v["digits"],c.TryGetValue("mode",out var mode)?mode.GetString()!:"toEven"),new() {{"mode",new("string",JsonSerializer.SerializeToElement("toEven"),"Rounding",Options:["toEven","awayFromZero"])}});
        Add("Standard.Logic.And","And","Logic",new() {{"left",Port<bool>()},{"right",Port<bool>()}},Port<bool>(),(v,_)=>(bool)v["left"] && (bool)v["right"]);
        Add("Standard.Logic.Or","Or","Logic",new() {{"left",Port<bool>()},{"right",Port<bool>()}},Port<bool>(),(v,_)=>(bool)v["left"] || (bool)v["right"]);
        Add("Standard.Logic.Xor","Xor","Logic",new() {{"left",Port<bool>()},{"right",Port<bool>()}},Port<bool>(),(v,_)=>(bool)v["left"] != (bool)v["right"]);
        Add("Standard.Logic.Not","Not","Logic",new() {{"value",Port<bool>()}},Port<bool>(),(v,_)=>!(bool)v["value"]);
        Add("Standard.Compare.Bool.Equals","equals (bool)","Compare",new() {{"left",Port<bool>()},{"right",Port<bool>()}},Port<bool>(),(v,_)=>(Equals(v["left"],v["right"])?0:1)==0);
        Add("Standard.Compare.Bool.NotEquals","notEquals (bool)","Compare",new() {{"left",Port<bool>()},{"right",Port<bool>()}},Port<bool>(),(v,_)=>(Equals(v["left"],v["right"])?0:1)!=0);
        Add("Standard.Compare.Integer.Equals","equals (integer)","Compare",new() {{"left",Port<int>()},{"right",Port<int>()}},Port<bool>(),(v,_)=>IntegerMath.Compare((int)v["left"],(int)v["right"])==0);
        Add("Standard.Compare.Integer.NotEquals","notEquals (integer)","Compare",new() {{"left",Port<int>()},{"right",Port<int>()}},Port<bool>(),(v,_)=>IntegerMath.Compare((int)v["left"],(int)v["right"])!=0);
        Add("Standard.Compare.Integer.GreaterThan","greaterThan (integer)","Compare",new() {{"left",Port<int>()},{"right",Port<int>()}},Port<bool>(),(v,_)=>IntegerMath.Compare((int)v["left"],(int)v["right"])>0);
        Add("Standard.Compare.Integer.GreaterOrEqual","greaterOrEqual (integer)","Compare",new() {{"left",Port<int>()},{"right",Port<int>()}},Port<bool>(),(v,_)=>IntegerMath.Compare((int)v["left"],(int)v["right"])>=0);
        Add("Standard.Compare.Integer.LessThan","lessThan (integer)","Compare",new() {{"left",Port<int>()},{"right",Port<int>()}},Port<bool>(),(v,_)=>IntegerMath.Compare((int)v["left"],(int)v["right"])<0);
        Add("Standard.Compare.Integer.LessOrEqual","lessOrEqual (integer)","Compare",new() {{"left",Port<int>()},{"right",Port<int>()}},Port<bool>(),(v,_)=>IntegerMath.Compare((int)v["left"],(int)v["right"])<=0);
        Add("Standard.Compare.Guid.Equals","equals (guid)","Compare",new() {{"left",Port<Guid>()},{"right",Port<Guid>()}},Port<bool>(),(v,_)=>(Equals(v["left"],v["right"])?0:1)==0);
        Add("Standard.Compare.Guid.NotEquals","notEquals (guid)","Compare",new() {{"left",Port<Guid>()},{"right",Port<Guid>()}},Port<bool>(),(v,_)=>(Equals(v["left"],v["right"])?0:1)!=0);
        Add("Standard.Compare.TimeSpan.Equals","equals (timespan)","Compare",new() {{"left",Port<TimeSpan>()},{"right",Port<TimeSpan>()}},Port<bool>(),(v,_)=>TimeSpanMath.Compare((TimeSpan)v["left"],(TimeSpan)v["right"])==0);
        Add("Standard.Compare.TimeSpan.NotEquals","notEquals (timespan)","Compare",new() {{"left",Port<TimeSpan>()},{"right",Port<TimeSpan>()}},Port<bool>(),(v,_)=>TimeSpanMath.Compare((TimeSpan)v["left"],(TimeSpan)v["right"])!=0);
        Add("Standard.Compare.TimeSpan.GreaterThan","greaterThan (timespan)","Compare",new() {{"left",Port<TimeSpan>()},{"right",Port<TimeSpan>()}},Port<bool>(),(v,_)=>TimeSpanMath.Compare((TimeSpan)v["left"],(TimeSpan)v["right"])>0);
        Add("Standard.Compare.TimeSpan.GreaterOrEqual","greaterOrEqual (timespan)","Compare",new() {{"left",Port<TimeSpan>()},{"right",Port<TimeSpan>()}},Port<bool>(),(v,_)=>TimeSpanMath.Compare((TimeSpan)v["left"],(TimeSpan)v["right"])>=0);
        Add("Standard.Compare.TimeSpan.LessThan","lessThan (timespan)","Compare",new() {{"left",Port<TimeSpan>()},{"right",Port<TimeSpan>()}},Port<bool>(),(v,_)=>TimeSpanMath.Compare((TimeSpan)v["left"],(TimeSpan)v["right"])<0);
        Add("Standard.Compare.TimeSpan.LessOrEqual","lessOrEqual (timespan)","Compare",new() {{"left",Port<TimeSpan>()},{"right",Port<TimeSpan>()}},Port<bool>(),(v,_)=>TimeSpanMath.Compare((TimeSpan)v["left"],(TimeSpan)v["right"])<=0);
        Add("Standard.Compare.DateTimeOffset.Equals","equals (datetimeoffset)","Compare",new() {{"left",Port<DateTimeOffset>()},{"right",Port<DateTimeOffset>()}},Port<bool>(),(v,_)=>DateTimeOffsetMath.Compare((DateTimeOffset)v["left"],(DateTimeOffset)v["right"])==0);
        Add("Standard.Compare.DateTimeOffset.NotEquals","notEquals (datetimeoffset)","Compare",new() {{"left",Port<DateTimeOffset>()},{"right",Port<DateTimeOffset>()}},Port<bool>(),(v,_)=>DateTimeOffsetMath.Compare((DateTimeOffset)v["left"],(DateTimeOffset)v["right"])!=0);
        Add("Standard.Compare.DateTimeOffset.GreaterThan","greaterThan (datetimeoffset)","Compare",new() {{"left",Port<DateTimeOffset>()},{"right",Port<DateTimeOffset>()}},Port<bool>(),(v,_)=>DateTimeOffsetMath.Compare((DateTimeOffset)v["left"],(DateTimeOffset)v["right"])>0);
        Add("Standard.Compare.DateTimeOffset.GreaterOrEqual","greaterOrEqual (datetimeoffset)","Compare",new() {{"left",Port<DateTimeOffset>()},{"right",Port<DateTimeOffset>()}},Port<bool>(),(v,_)=>DateTimeOffsetMath.Compare((DateTimeOffset)v["left"],(DateTimeOffset)v["right"])>=0);
        Add("Standard.Compare.DateTimeOffset.LessThan","lessThan (datetimeoffset)","Compare",new() {{"left",Port<DateTimeOffset>()},{"right",Port<DateTimeOffset>()}},Port<bool>(),(v,_)=>DateTimeOffsetMath.Compare((DateTimeOffset)v["left"],(DateTimeOffset)v["right"])<0);
        Add("Standard.Compare.DateTimeOffset.LessOrEqual","lessOrEqual (datetimeoffset)","Compare",new() {{"left",Port<DateTimeOffset>()},{"right",Port<DateTimeOffset>()}},Port<bool>(),(v,_)=>DateTimeOffsetMath.Compare((DateTimeOffset)v["left"],(DateTimeOffset)v["right"])<=0);
        Add("Standard.Compare.Decimal.Equals","equals (decimal)","Compare",new() {{"left",Port<decimal>()},{"right",Port<decimal>()}},Port<bool>(),(v,_)=>DecimalMath.Compare((decimal)v["left"],(decimal)v["right"])==0);
        Add("Standard.Compare.Decimal.NotEquals","notEquals (decimal)","Compare",new() {{"left",Port<decimal>()},{"right",Port<decimal>()}},Port<bool>(),(v,_)=>DecimalMath.Compare((decimal)v["left"],(decimal)v["right"])!=0);
        Add("Standard.Compare.Decimal.GreaterThan","greaterThan (decimal)","Compare",new() {{"left",Port<decimal>()},{"right",Port<decimal>()}},Port<bool>(),(v,_)=>DecimalMath.Compare((decimal)v["left"],(decimal)v["right"])>0);
        Add("Standard.Compare.Decimal.GreaterOrEqual","greaterOrEqual (decimal)","Compare",new() {{"left",Port<decimal>()},{"right",Port<decimal>()}},Port<bool>(),(v,_)=>DecimalMath.Compare((decimal)v["left"],(decimal)v["right"])>=0);
        Add("Standard.Compare.Decimal.LessThan","lessThan (decimal)","Compare",new() {{"left",Port<decimal>()},{"right",Port<decimal>()}},Port<bool>(),(v,_)=>DecimalMath.Compare((decimal)v["left"],(decimal)v["right"])<0);
        Add("Standard.Compare.Decimal.LessOrEqual","lessOrEqual (decimal)","Compare",new() {{"left",Port<decimal>()},{"right",Port<decimal>()}},Port<bool>(),(v,_)=>DecimalMath.Compare((decimal)v["left"],(decimal)v["right"])<=0);
        Add("Standard.Compare.String.Equals","equals (string)","Compare",new() {{"left",Port<string>()},{"right",Port<string>()}},Port<bool>(),(v,_)=>(Equals(v["left"],v["right"])?0:1)==0);
        Add("Standard.Compare.String.NotEquals","notEquals (string)","Compare",new() {{"left",Port<string>()},{"right",Port<string>()}},Port<bool>(),(v,_)=>(Equals(v["left"],v["right"])?0:1)!=0);
        Add("Standard.Text.Join","String Join","Text",new() {{"items",Port<string[]>()},{"separator",Port<string>()}},Port<string>(),(v,_)=>string.Join((string)v["separator"],((System.Collections.IEnumerable)v["items"]).Cast<string>()));
        Add("Standard.Text.Concat","concat","Text",new() {{"left",Port<string>()},{"right",Port<string>()}},Port<string>(),(v,_)=>((string)v["left"])+((string)v["right"]));
        Add("Standard.Text.Contains","contains","Text",new() {{"left",Port<string>()},{"right",Port<string>()}},Port<bool>(),(v,_)=>((string)v["left"]).Contains(((string)v["right"]),StringComparison.Ordinal));
        Add("Standard.Text.StartsWith","startsWith","Text",new() {{"left",Port<string>()},{"right",Port<string>()}},Port<bool>(),(v,_)=>((string)v["left"]).StartsWith(((string)v["right"]),StringComparison.Ordinal));
        Add("Standard.Text.EndsWith","endsWith","Text",new() {{"left",Port<string>()},{"right",Port<string>()}},Port<bool>(),(v,_)=>((string)v["left"]).EndsWith(((string)v["right"]),StringComparison.Ordinal));
        Add("Standard.Text.Replace","Replace","Text",new() {{"value",Port<string>()},{"search",Port<string>()},{"replacement",Port<string>()}},Port<string>(),(v,_)=>((string)v["value"]).Replace((string)v["search"],(string)v["replacement"],StringComparison.Ordinal));
        Add("Standard.Text.Trim","Trim","Text",new() {{"value",Port<string>()}},Port<string>(),(v,_)=>((string)v["value"]).Trim("\u0009\u000a\u000b\u000c\u000d\u0020\u00a0\u1680\u2000\u2001\u2002\u2003\u2004\u2005\u2006\u2007\u2008\u2009\u200a\u2028\u2029\u202f\u205f\u3000\ufeff".ToCharArray()));
        Add("Standard.Date.AddDuration","Add Duration","Date",new() {{"value",Port<DateTimeOffset>()},{"duration",Port<TimeSpan>()}},Port<DateTimeOffset>(),(v,_)=>DateTimeOffsetMath.Add((DateTimeOffset)v["value"],(TimeSpan)v["duration"]));
        Add("Standard.Date.Difference","Date Difference","Date",new() {{"left",Port<DateTimeOffset>()},{"right",Port<DateTimeOffset>()}},Port<TimeSpan>(),(v,_)=>((DateTimeOffset)v["left"])-((DateTimeOffset)v["right"]));
        Add("Standard.Convert.Bool.Parse","Parse (bool)","Convert",new() {{"value",Port<string>()}},Port<bool>(),(v,_)=>ParseText("core.Bool",(string)v["value"]));
        Add("Standard.Convert.Bool.ToString","To String (bool)","Convert",new() {{"value",Port<bool>()}},Port<string>(),(v,_)=>ScalarText(FlowValues.Encode(new("scalar",Name:"core.Bool"),v["value"])));
        Add("Standard.Convert.Integer.Parse","Parse (integer)","Convert",new() {{"value",Port<string>()}},Port<int>(),(v,_)=>ParseText("core.Integer",(string)v["value"]));
        Add("Standard.Convert.Integer.ToString","To String (integer)","Convert",new() {{"value",Port<int>()}},Port<string>(),(v,_)=>ScalarText(FlowValues.Encode(new("scalar",Name:"core.Integer"),v["value"])));
        Add("Standard.Convert.Decimal.Parse","Parse (decimal)","Convert",new() {{"value",Port<string>()}},Port<decimal>(),(v,_)=>ParseText("core.Decimal",(string)v["value"]));
        Add("Standard.Convert.Decimal.ToString","To String (decimal)","Convert",new() {{"value",Port<decimal>()}},Port<string>(),(v,_)=>ScalarText(FlowValues.Encode(new("scalar",Name:"core.Decimal"),v["value"])));
        Add("Standard.Convert.Guid.Parse","Parse (guid)","Convert",new() {{"value",Port<string>()}},Port<Guid>(),(v,_)=>ParseText("core.Guid",(string)v["value"]));
        Add("Standard.Convert.Guid.ToString","To String (guid)","Convert",new() {{"value",Port<Guid>()}},Port<string>(),(v,_)=>ScalarText(FlowValues.Encode(new("scalar",Name:"core.Guid"),v["value"])));
        Add("Standard.Convert.TimeSpan.Parse","Parse (timespan)","Convert",new() {{"value",Port<string>()}},Port<TimeSpan>(),(v,_)=>ParseText("core.TimeSpan",(string)v["value"]));
        Add("Standard.Convert.TimeSpan.ToString","To String (timespan)","Convert",new() {{"value",Port<TimeSpan>()}},Port<string>(),(v,_)=>ScalarText(FlowValues.Encode(new("scalar",Name:"core.TimeSpan"),v["value"])));
        Add("Standard.Convert.DateTimeOffset.Parse","Parse (datetimeoffset)","Convert",new() {{"value",Port<string>()}},Port<DateTimeOffset>(),(v,_)=>ParseText("core.DateTimeOffset",(string)v["value"]));
        Add("Standard.Convert.DateTimeOffset.ToString","To String (datetimeoffset)","Convert",new() {{"value",Port<DateTimeOffset>()}},Port<string>(),(v,_)=>ScalarText(FlowValues.Encode(new("scalar",Name:"core.DateTimeOffset"),v["value"])));
        Add("Standard.Date.Now","Now (UTC)","Date",[],Port<DateTimeOffset>(),(_,_)=>DateTimeOffset.UtcNow);
        Add("Standard.Date.Today","Today (fixed offset)","Date",[],Port<DateTimeOffset>(),(_,c)=>
        {
            var offset=c.TryGetValue("offsetMinutes",out var configured)?configured.GetInt32():0;
            if(offset is < -840 or > 840)throw new ArgumentOutOfRangeException("offsetMinutes");
            var zone=TimeSpan.FromMinutes(offset);
            var local=DateTimeOffset.UtcNow.ToOffset(zone);
            return new DateTimeOffset(local.Date,zone);
        },new() {{"offsetMinutes",new("scalar",JsonSerializer.SerializeToElement(0),"UTC offset (minutes)",Scalar:"core.Integer")}});
        TextNodes.Register(nodes);
        RegexNodes.Register(nodes);
    }
    public static object ParseText(string scalar,string value)
    {
        var input=scalar switch
        {
            "core.Bool"=>JsonSerializer.SerializeToElement(value switch {"true"=>true,"false"=>false,_=>throw new FormatException("Expected true or false.")}),
            "core.Integer"=>JsonSerializer.SerializeToElement(ParseInteger(value)),
            _=>ScalarValues.Parse(scalar,JsonSerializer.SerializeToElement(value))
        };
        return FlowValues.Decode(new("scalar",Name:scalar),input);
    }
    private static int ParseInteger(string value)
    {
        if(!System.Text.RegularExpressions.Regex.IsMatch(value,@"\A[+-]?[0-9]+\z"))throw new FormatException("Invalid Integer text.");
        return int.Parse(value,System.Globalization.NumberStyles.AllowLeadingSign,System.Globalization.CultureInfo.InvariantCulture);
    }
    private static string ScalarText(JsonElement value) => value.ValueKind==JsonValueKind.String?value.GetString()!:value.GetRawText();
}
