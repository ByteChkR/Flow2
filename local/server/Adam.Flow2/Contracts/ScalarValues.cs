using System.Globalization;
using System.Numerics;
using System.Text.Json;
using System.Text.RegularExpressions;

namespace Adam.Flow2.Contracts;

/// <summary>Canonical scalar wire contracts, shared with the browser fixtures.</summary>
public static class ScalarValues
{
    public static readonly IReadOnlySet<string> Names=new HashSet<string>(StringComparer.Ordinal)
        {"core.Bool","core.Decimal","core.Integer","core.DateTimeOffset","core.TimeSpan","core.Guid"};
    private static readonly BigInteger DecimalMax=BigInteger.Parse("79228162514264337593543950335",CultureInfo.InvariantCulture);
    private static FormatException Invalid(string name)=>new($"Invalid {name} value.");
    private static string Text(JsonElement value,string name)
    {
        if(value.ValueKind!=JsonValueKind.String||value.GetString()!.Length>256)throw Invalid(name);
        return value.GetString()!.Trim();
    }
    public static JsonElement Parse(string name,JsonElement value)
    {
        object result;
        switch(name)
        {
            case "core.Bool":
                if(value.ValueKind is not (JsonValueKind.True or JsonValueKind.False))throw Invalid(name);
                result=value.GetBoolean();break;
            case "core.Integer":
                if(value.ValueKind!=JsonValueKind.Number||!value.TryGetDecimal(out var integer)||integer!=decimal.Truncate(integer)||integer<int.MinValue||integer>int.MaxValue)throw Invalid(name);
                result=(int)integer;break;
            case "core.Decimal":
                var match=Regex.Match(Text(value,name),@"\A([+-]?)(\d+)(?:\.(\d+))?\z",RegexOptions.ECMAScript);
                if(!match.Success)throw Invalid(name);
                var fraction=match.Groups[3].Value.TrimEnd('0');
                var coefficient=BigInteger.Parse(match.Groups[2].Value+fraction,CultureInfo.InvariantCulture);
                if(fraction.Length>28||coefficient>DecimalMax)throw Invalid(name);
                result=(!coefficient.IsZero&&match.Groups[1].Value=="-"?"-":"")+BigInteger.Parse(match.Groups[2].Value,CultureInfo.InvariantCulture).ToString(CultureInfo.InvariantCulture)+(fraction.Length>0?"."+fraction:"");break;
            case "core.TimeSpan":
                var duration=Text(value,name);
                if(!Regex.IsMatch(duration,@"\A[+-]?[0-9]+\z")||!long.TryParse(duration,NumberStyles.AllowLeadingSign,CultureInfo.InvariantCulture,out var ticks))throw Invalid(name);
                result=ticks.ToString(CultureInfo.InvariantCulture);break;
            case "core.Guid":
                if(!Guid.TryParseExact(Text(value,name),"D",out var guid))throw Invalid(name);
                result=guid.ToString("D");break;
            case "core.DateTimeOffset":
                var date=Text(value,name);
                if(!Regex.IsMatch(date,@"\A[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}(?:\.[0-9]{1,7})?(?:Z|[+-][0-9]{2}:[0-9]{2})\z"))throw Invalid(name);
                if(date.EndsWith('Z'))date=date[..^1]+"+00:00";
                if(!DateTimeOffset.TryParseExact(date,["yyyy-MM-dd'T'HH:mm:sszzz","yyyy-MM-dd'T'HH:mm:ss.FFFFFFFzzz"],CultureInfo.InvariantCulture,DateTimeStyles.None,out var instant))throw Invalid(name);
                result=instant.ToString("yyyy-MM-dd'T'HH:mm:ss.fffffffzzz",CultureInfo.InvariantCulture);break;
            default:throw Invalid(name);
        }
        return JsonSerializer.SerializeToElement(result);
    }
    public static bool IsValue(string name,JsonElement value)
    {
        try{return TransportContracts.Equivalent(Parse(name,value),value);}catch(FormatException){return false;}
    }
}
