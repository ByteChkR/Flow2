using System.Globalization;
using System.Reflection;
using System.Text.Json;
using System.Text.Json.Nodes;
using Adam.Flow2.Contracts;

static class NumericCases
{
    private static object Evaluate(JsonElement fixture)
    {
        var owner=fixture.GetProperty("type").GetString() switch {"decimal"=>typeof(DecimalMath),"integer"=>typeof(IntegerMath),"duration"=>typeof(TimeSpanMath),"date"=>typeof(DateTimeOffsetMath),_=>throw new Exception("Unknown fixture type")};
        var method=owner.GetMethod(fixture.GetProperty("operation").GetString()!,BindingFlags.Static|BindingFlags.Public|BindingFlags.IgnoreCase)!;
        var args=fixture.GetProperty("args").EnumerateArray().ToArray();
        var values=method.GetParameters().Select((parameter,index)=>parameter.ParameterType==typeof(decimal)
            ?(object)decimal.Parse(ScalarValues.Parse("core.Decimal",args[index]).GetString()!,CultureInfo.InvariantCulture)
            :parameter.ParameterType==typeof(int)?args[index].GetInt32()
            :parameter.ParameterType==typeof(TimeSpan)?TimeSpan.FromTicks(long.Parse(args[index].GetString()!,CultureInfo.InvariantCulture))
            :parameter.ParameterType==typeof(DateTimeOffset)?DateTimeOffset.Parse(args[index].GetString()!,CultureInfo.InvariantCulture):args[index].GetString()!).ToArray();
        var value=method.Invoke(null,values)!;
        return value switch {
            decimal number=>ScalarValues.Parse("core.Decimal",JsonSerializer.SerializeToElement(number.ToString(CultureInfo.InvariantCulture))).GetString()!,
            TimeSpan span=>span.Ticks.ToString(CultureInfo.InvariantCulture),
            DateTimeOffset instant=>instant.ToString("yyyy-MM-dd'T'HH:mm:ss.fffffffzzz",CultureInfo.InvariantCulture),_=>value};
    }
    private static string Error(Exception exception)=>exception.GetBaseException() switch
    {OverflowException=>"overflow",DivideByZeroException=>"divide_by_zero",ArgumentException=>"argument",FormatException=>"format",_=>throw exception};
    public static void Write(string path)
    {
        var fixtures=JsonNode.Parse(File.ReadAllText(path))!.AsArray();
        foreach(var item in fixtures)
        {
            var fixture=item!.AsObject();fixture.Remove("result");fixture.Remove("error");
            try{fixture["result"]=JsonSerializer.SerializeToNode(Evaluate(JsonSerializer.SerializeToElement(fixture)));}
            catch(Exception error){fixture["error"]=Error(error);}
        }
        File.WriteAllText(path,fixtures.ToJsonString(new JsonSerializerOptions{WriteIndented=true})+Environment.NewLine);
    }
    public static void Run(Action<bool,string> check)
    {
        foreach(var fixture in JsonDocument.Parse(File.ReadAllText(Path.Combine(AppContext.BaseDirectory,"Fixtures/numeric-values.json"))).RootElement.EnumerateArray())
        {
            object? value=null;string? error=null;
            try{value=Evaluate(fixture);}catch(Exception cause){error=Error(cause);}
            if(fixture.TryGetProperty("error",out var expected))check(error==expected.GetString(),$"Numeric failure parity: {fixture}");
            else check(error is null&&TransportContracts.Equivalent(JsonSerializer.SerializeToElement(value),fixture.GetProperty("result")),$"Numeric result parity: {fixture}");
        }
    }
}
