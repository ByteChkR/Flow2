using System.Globalization;
using System.Text;
using System.Text.RegularExpressions;
namespace Adam.Flow2.Runtime;

/// <summary>Portable formatting grammar shared with the browser; never uses ambient culture.</summary>
public static class ValueFormatting
{
    public static string Language(string language)=>language switch
    {"de" or "de-DE"=>"de-DE","en" or "en-US"=>"en-US","en-GB"=>"en-GB","fr" or "fr-FR"=>"fr-FR",_=>throw new FormatException("Unsupported language. Use de-DE, en-US, en-GB or fr-FR.")};
    public static string Format(string kind,object value,string format,string language)
    {
        var culture=(CultureInfo)CultureInfo.GetCultureInfo(Language(language)).Clone();
        // Pin numeric conventions rather than inheriting OS/ICU-version-specific patterns.
        var continental=culture.Name is "de-DE" or "fr-FR";
        culture.NumberFormat.NumberDecimalSeparator=culture.NumberFormat.PercentDecimalSeparator=continental?",":".";
        culture.NumberFormat.NumberGroupSeparator=culture.NumberFormat.PercentGroupSeparator=culture.Name=="de-DE"?".":culture.Name=="fr-FR"?"\u202f":",";
        culture.NumberFormat.NumberGroupSizes=culture.NumberFormat.PercentGroupSizes=[3];
        culture.NumberFormat.NumberNegativePattern=1;
        culture.NumberFormat.PercentPositivePattern=culture.NumberFormat.PercentNegativePattern=continental?0:1;
        if(kind is "integer" or "decimal")
        {
            if(format=="G")return (kind=="integer"?((int)value).ToString(CultureInfo.InvariantCulture):((decimal)value).ToString("0.############################",CultureInfo.InvariantCulture)).Replace(".",culture.NumberFormat.NumberDecimalSeparator);
            if(!Regex.IsMatch(format,@"\A[FNP](?:[0-9]|1[0-9]|2[0-8])?\z"))throw new FormatException("Numeric format must be G, F, N or P with 0–28 decimal places.");
            // Decimal formatting scales percentages internally without arithmetic overflow.
            return Convert.ToDecimal(value,CultureInfo.InvariantCulture).ToString(format.Length==1?format+"2":format,culture);
        }
        if(kind=="string"||kind=="bool")
        {
            if(format!="G")throw new FormatException("Text and Bool support G only.");
            return kind=="string"?(string)value:(bool)value?"true":"false";
        }
        if(kind=="guid")
        {
            if(format is not ("D" or "N" or "B" or "P"))throw new FormatException("Guid format must be D, N, B or P.");
            return ((Guid)value).ToString(format);
        }
        if(kind=="timespan")
        {
            if(format is not ("c" or "g" or "G" or "ticks"))throw new FormatException("TimeSpan format must be c, g, G or ticks.");
            return format=="ticks"?((TimeSpan)value).Ticks.ToString(CultureInfo.InvariantCulture):((TimeSpan)value).ToString(format,culture);
        }
        if(kind=="datetimeoffset")
        {
            var date=(DateTimeOffset)value;
            if(format=="O")return date.ToString("yyyy-MM-dd'T'HH:mm:ss.fffffffzzz",CultureInfo.InvariantCulture);
            var day=culture.Name=="de-DE"?"dd.MM.yyyy":culture.Name=="en-US"?"MM/dd/yyyy":"dd/MM/yyyy";
            format=format switch {"d"=>day,"t"=>"HH:mm","T"=>"HH:mm:ss","g"=>day+" HH:mm","G"=>day+" HH:mm:ss",_=>format};
            var output=new StringBuilder();
            for(var i=0;i<format.Length;)
            {
                if(format[i]=='\'')
                {
                    var end=format.IndexOf('\'',i+1);if(end<0)throw new FormatException("Unterminated date literal.");
                    output.Append(format.AsSpan(i+1,end-i-1));i=end+1;continue;
                }
                var match=Regex.Match(format[i..],@"\A(?:yyyy|MM|dd|HH|mm|ss|f{1,7}|zzz)");
                if(match.Success){output.Append(date.ToString(match.Value.Length==1?"%"+match.Value:match.Value,CultureInfo.InvariantCulture));i+=match.Length;continue;}
                if(char.IsLetter(format[i]))throw new FormatException("Unsupported date token; quote literal letters.");
                output.Append(format[i++]);
            }
            if(format.Length==0)throw new FormatException("Format cannot be empty.");
            return output.ToString();
        }
        throw new FormatException("Unsupported value type.");
    }
    public static string Text(string template,IReadOnlyList<string> arguments)
    {
        var output=new StringBuilder();
        for(var i=0;i<template.Length;)
        {
            var c=template[i++];
            if(c is '{' or '}')
            {
                if(i<template.Length&&template[i]==c){output.Append(c);i++;continue;}
                if(c=='}')throw new FormatException("Unmatched closing brace.");
                var end=template.IndexOf('}',i);
                if(end<0||!Regex.IsMatch(template[i..end],@"\A[0-9]+\z")||!int.TryParse(template[i..end],out var index)||index>=arguments.Count)throw new FormatException("Invalid or missing format argument.");
                output.Append(arguments[index]);i=end+1;
            }
            else output.Append(c);
        }
        return output.ToString();
    }
}
