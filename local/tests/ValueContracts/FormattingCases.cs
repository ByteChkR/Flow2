using Adam.Flow2.Runtime;
using System.Text.Json;
using System.Globalization;
static class FormattingCases
{
    static IEnumerable<(string Kind,object Value,string Format,string Language)> Cases()
    {
        foreach(var language in new[]{"de-DE","en-US","en-GB","fr-FR"})
        {
            foreach(var value in new[]{0m,-0.005m,1.225m,1.235m,12345678901234567890.123456789m,decimal.MaxValue,decimal.MinValue,0.0000000000000000000000000001m})
                foreach(var format in new[]{"G","F","F0","F2","F28","N2","P2","P28"})yield return("decimal",value,format,language);
            foreach(var value in new[]{0,int.MinValue,int.MaxValue})foreach(var format in new[]{"G","F2","N0","P2"})yield return("integer",value,format,language);
            foreach(var value in new[]{TimeSpan.Zero,TimeSpan.FromTicks(1),TimeSpan.FromTicks(-1),TimeSpan.MaxValue,TimeSpan.MinValue,TimeSpan.FromHours(25.5)})foreach(var format in new[]{"c","g","G","ticks"})yield return("timespan",value,format,language);
            foreach(var value in new[]{DateTimeOffset.Parse("2026-01-02T12:34:56.1234567+05:30"),DateTimeOffset.MinValue,DateTimeOffset.MaxValue})foreach(var format in new[]{"O","d","t","T","g","G","yyyy-MM-dd'T'HH:mm:ss.fffffffzzz","ss.f"})yield return("datetimeoffset",value,format,language);
            foreach(var format in new[]{"D","N","B","P"})yield return("guid",Guid.Parse("12345678-1234-1234-1234-123456789abc"),format,language);
            yield return("bool",false,"G",language);yield return("string","{text}","G",language);
        }
    }
    public static void WriteFixture(string path)=>File.WriteAllText(path,JsonSerializer.Serialize(Cases().Select(c=>new{kind=c.Kind,value=c.Kind switch{"decimal"=> (object)((decimal)c.Value).ToString(CultureInfo.InvariantCulture),"timespan"=>((TimeSpan)c.Value).Ticks.ToString(CultureInfo.InvariantCulture),"datetimeoffset"=>((DateTimeOffset)c.Value).ToString("yyyy-MM-dd'T'HH:mm:ss.fffffffzzz",CultureInfo.InvariantCulture),"guid"=>c.Value.ToString(),_=>c.Value},format=c.Format,language=c.Language,expected=ValueFormatting.Format(c.Kind,c.Value,c.Format,c.Language)})));
    public static void Run(Action<bool,string> check)
    {
        check(ValueFormatting.Format("decimal",1234.125m,"N2","de-DE")=="1.234,13","format midpoint follows Decimal formatting");
        check(ValueFormatting.Format("datetimeoffset",DateTimeOffset.Parse("2026-01-02T12:34:56.1234567+05:30"),"O","en-US")=="2026-01-02T12:34:56.1234567+05:30","date formatting preserves ticks and offset");
        check(ValueFormatting.Text("{{{1}}} {0} {1}",["a","$&"])=="{$&} a $&","text placeholders are literal and reusable");
        foreach(var template in new[]{"{2}","{", "}","{0:N2}","{-1}"})try{ValueFormatting.Text(template,["a"]);throw new Exception("invalid template accepted");}catch(FormatException){check(true,"invalid text placeholder rejected");}
        foreach(var (format,language) in new[]{("N29","de-DE"),("","en-US"),("F2","xx-YY")})try{ValueFormatting.Format("decimal",1m,format,language);throw new Exception("invalid format accepted");}catch(FormatException){check(true,"invalid format or language rejected");}
        var nodes=new NodeRegistry();FormattingNodes.Register(nodes);
        foreach(var c in Cases().Where(c=>c.Kind is not ("bool" or "string")))
        {
            var node=nodes.Resolve("Standard.Convert."+(c.Kind=="datetimeoffset"?"DateTimeOffset":c.Kind=="timespan"?"TimeSpan":char.ToUpperInvariant(c.Kind[0])+c.Kind[1..])+".Format",1);var inputs=new Dictionary<string,object>{{"value",c.Value},{"format",c.Format},{"language",c.Language}};
            nodes.ValidatePorts(node.Definition.Inputs,inputs);var outputs=node.Execute!(inputs);nodes.ValidatePorts(node.Definition.Outputs,outputs);
            check(outputs["value"] is string,"format node produces typed text");
        }
    }
}
