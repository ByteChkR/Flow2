using System.Collections;
using System.Globalization;
using System.Text.Json;
using System.Text.RegularExpressions;
using Adam.Flow2.Contracts;

namespace Adam.Flow2.Runtime;

public static class JsonValueNodes
{
    // Match JSON.stringify's minimal escaping, including non-BMP property names.
    private static string Quote(string text)
    {
        var result=new System.Text.StringBuilder("\"");
        for(var i=0;i<text.Length;i++)
        {
            var c=text[i];
            switch(c)
            {
                case '"':result.Append("\\\"");break;
                case '\\':result.Append("\\\\");break;
                case '\b':result.Append("\\b");break;
                case '\f':result.Append("\\f");break;
                case '\n':result.Append("\\n");break;
                case '\r':result.Append("\\r");break;
                case '\t':result.Append("\\t");break;
                default:
                    if(c<0x20||char.IsSurrogate(c)&&!(char.IsHighSurrogate(c)&&i+1<text.Length&&char.IsLowSurrogate(text[i+1])))result.Append("\\u").Append(((int)c).ToString("x4",CultureInfo.InvariantCulture));
                    else if(char.IsHighSurrogate(c)){result.Append(c).Append(text[++i]);}
                    else result.Append(c);
                    break;
            }
        }
        return result.Append('"').ToString();
    }
    private static string Compact(JsonElement element)=>element.ValueKind switch {
        JsonValueKind.Object=>"{"+string.Join(",",element.EnumerateObject().Select(p=>Quote(p.Name)+":"+Compact(p.Value)))+"}",
        JsonValueKind.Array=>"["+string.Join(",",element.EnumerateArray().Select(Compact))+"]",
        _=>element.GetRawText()
    };
    public static JsonElement Parse(string text)
    {
        if(text.Length>4*1024*1024)throw new ArgumentException("JSON document exceeds 4,194,304 characters.");
        using var document=JsonDocument.Parse(text,new JsonDocumentOptions { MaxDepth=64 });
        void Check(JsonElement value)
        {
            if(value.ValueKind==JsonValueKind.Object)
            {
                var names=new HashSet<string>(StringComparer.Ordinal);
                foreach(var property in value.EnumerateObject())
                { if(!names.Add(property.Name))throw new ArgumentException("Duplicate JSON field: "+property.Name);Check(property.Value); }
            }
            else if(value.ValueKind==JsonValueKind.Array)foreach(var item in value.EnumerateArray())Check(item);
        }
        Check(document.RootElement);return document.RootElement.Clone();
    }
    public static Dictionary<string,object> Wrap(string text)=>new() { ["json"]=Parse(text).GetRawText() };
    public static JsonElement Unwrap(object value)
    {
        if(!FlowValues.TryField(value,"json",out var text)||text is not string json)throw new ArgumentException("JSON value requires a json string.");
        return Parse(json);
    }
    private static string ExpandNumber(string value)
    {
        var match=Regex.Match(value,@"\A(-?)(\d+)(?:\.(\d+))?(?:[eE]([+-]?\d+))?\z");
        if(!match.Success)throw new FormatException("Expected JSON number.");
        var exponent=match.Groups[4].Success?int.Parse(match.Groups[4].Value,CultureInfo.InvariantCulture):0;
        if(exponent is <-1000 or >1000)throw new FormatException("Number exponent out of range.");
        var digits=match.Groups[2].Value+match.Groups[3].Value;var point=match.Groups[2].Length+exponent;
        return match.Groups[1].Value+(point<=0?"0."+new string('0',-point)+digits:point>=digits.Length?digits+new string('0',point-digits.Length):digits[..point]+"."+digits[point..]);
    }
    public static object? ToValue(TypeRef type,JsonElement json)
    {
        if(type.Kind=="dictionary"){var errors=DictionaryContract.Keys(json);if(errors.Count>0)throw new ContractException(errors);return ToValue(DictionaryContract.Shape(type.Items!),json);}
        if(type.Kind=="optional")return ToValue(type.Inner!,json);
        if(type.Kind=="nullable")return json.ValueKind==JsonValueKind.Null?null:ToValue(type.Inner!,json);
        if(type.Kind=="null")return json.ValueKind==JsonValueKind.Null?null:throw new FormatException("Expected null.");
        if(type.Kind=="object")
        {
            if(json.ValueKind!=JsonValueKind.Object)throw new FormatException("Expected JSON object.");
            if(json.EnumerateObject().Any(p=>!type.Fields!.ContainsKey(p.Name)))throw new FormatException("JSON contains fields outside the target record contract.");
            var result=new Dictionary<string,object>();
            foreach(var (name,field) in type.Fields!)
            {
                if(json.TryGetProperty(name,out var property))result[name]=ToValue(field,property)!;
                else if(field.Kind!="optional")throw new FormatException("Missing JSON field: "+name);
            }
            return result;
        }
        if(type.Kind=="array")
        {
            if(json.ValueKind!=JsonValueKind.Array)throw new FormatException("Expected JSON array.");
            return json.EnumerateArray().Select(item=>ToValue(type.Items!,item)).ToArray();
        }
        if(type.Kind=="scalar")
        {
            if(type.Name is "core.Decimal" or "core.Integer")
            {
                if(json.ValueKind!=JsonValueKind.Number)throw new FormatException("Expected JSON number.");
                var expanded=ExpandNumber(json.GetRawText());
                var exact=ScalarValues.Parse("core.Decimal",JsonSerializer.SerializeToElement(expanded));
                if(type.Name=="core.Decimal")return FlowValues.Decode(type,exact);
                var number=decimal.Parse(exact.GetString()!,CultureInfo.InvariantCulture);
                if(number!=decimal.Truncate(number))throw new FormatException("Expected integer.");
                return checked((int)number);
            }
            return FlowValues.Decode(type,ScalarValues.Parse(type.Name!,json));
        }
        if(type.Kind=="string"&&json.ValueKind==JsonValueKind.String)return json.GetString();
        throw new FormatException("JSON does not match target type.");
    }
    public static string FromValue(TypeRef type,object? value)
    {
        if(type.Kind=="dictionary")return FromValue(DictionaryContract.Shape(type.Items!),value);
        if(type.Kind is "nullable" or "optional")return value is null?"null":FromValue(type.Inner!,value);
        if(type.Kind=="null")return "null";
        if(type.Kind=="array")return "["+string.Join(",",((IEnumerable)value!).Cast<object?>().Select(item=>FromValue(type.Items!,item)))+"]";
        if(type.Kind=="object")
        {
            var fields=new List<string>();
            foreach(var (name,field) in type.Fields!)
                if(FlowValues.TryField(value!,name,out var item))fields.Add(Quote(name)+":"+FromValue(field,item));
                else if(field.Kind!="optional")throw new FormatException("Missing field: "+name);
            return "{"+string.Join(",",fields)+"}";
        }
        if(type.Kind=="scalar"&&type.Name=="core.Decimal")return ScalarValues.Parse("core.Decimal",JsonSerializer.SerializeToElement(((decimal)value!).ToString(CultureInfo.InvariantCulture))).GetString()!;
        var wire=FlowValues.Encode(type,value);
        return wire.ValueKind==JsonValueKind.String?Quote(wire.GetString()!):wire.GetRawText();
    }
    public static void Register(NodeRegistry nodes)
    {
        var text=new NodeTypeMap().Resolve(typeof(string));
        var json=new PortType("JsonDocument",typeof(object),JsonValueContract.Type,Dynamic:true);
        void Add(string operation,string label,Dictionary<string,PortType> inputs,PortType output,Func<IReadOnlyDictionary<string,object>,IReadOnlyDictionary<string,object>> run)
            =>nodes.Register(new(new("Standard.JSON."+char.ToUpperInvariant(operation[0])+operation[1..],1,inputs,new Dictionary<string,PortType>{["value"]=output},new(Label:label,Category:"JSON",Description:"JSON-Dokument als Record mit json-Text. Erhält Zahlenpräzision. Maximal 4.194.304 Zeichen und 64 Ebenen, keine doppelten Feldnamen.")),run));
        Dictionary<string,object> Result(object value)=>new(){["value"]=value};
        Add("parse","JSON Parse",new(){["text"]=text},json,v=>Result(Wrap((string)v["text"])));
        Add("stringify","JSON Stringify",new(){["value"]=json},text,v=>Result(Compact(Unwrap(v["value"]))));
        Add("getField","JSON Get Field",new(){["value"]=json,["name"]=text},json with{ContractType=new("optional",Inner:JsonValueContract.Type)},v=>{
            var document=Unwrap(v["value"]);if(document.ValueKind!=JsonValueKind.Object)throw new FormatException("Expected JSON object.");
            return document.TryGetProperty((string)v["name"],out var field)?Result(Wrap(field.GetRawText())):new Dictionary<string,object>();
        });
        var boolean=new NodeTypeMap().Resolve(typeof(bool));
        var optional=json with{ContractType=new("optional",Inner:JsonValueContract.Type)};
        void Multi(string name,Dictionary<string,PortType> inputs,Dictionary<string,PortType> outputs,Func<IReadOnlyDictionary<string,object>,IReadOnlyDictionary<string,object>> run)
            =>nodes.Register(new(new("Standard.JSON."+name,1,inputs,outputs,new(Label:"JSON "+name,Category:"JSON")),run));
        Multi("TryParse",new(){{"text",text}},new(){{"found",boolean},{"value",optional}},v=>{
            try{return new Dictionary<string,object>{{"found",true},{"value",Wrap((string)v["text"])}};}
            catch(Exception error)when(error is JsonException or ArgumentException or FormatException){return new Dictionary<string,object>{{"found",false}};}
        });
        Add("hasField","JSON Has Field",new(){{"value",json},{"name",text}},boolean,v=>{
            var document=Unwrap(v["value"]);if(document.ValueKind!=JsonValueKind.Object)throw new FormatException("Expected JSON object.");
            return Result(document.TryGetProperty((string)v["name"],out _));
        });
        Multi("RemoveField",new(){{"value",json},{"name",text}},new(){{"value",json},{"removed",boolean}},v=>{
            var document=Unwrap(v["value"]);if(document.ValueKind!=JsonValueKind.Object)throw new FormatException("Expected JSON object.");
            var name=(string)v["name"];var fields=document.EnumerateObject().Where(p=>p.Name!=name).Select(p=>Quote(p.Name)+":"+Compact(p.Value));
            return new Dictionary<string,object>{{"value",Wrap("{"+string.Join(",",fields)+"}")},{"removed",document.TryGetProperty(name,out _)}};
        });
        Multi("GetPath",new(){{"value",json},{"path",text}},new(){{"found",boolean},{"value",optional}},v=>{
            var current=Unwrap(v["value"]);var path=(string)v["path"];
            if(path!=""&&(!path.StartsWith('/')||Regex.IsMatch(path,@"~(?:[^01]|$)")))throw new FormatException("path: Expected /-separated segments with ~0 and ~1 escapes.");
            var segments=path==""?Array.Empty<string>():path[1..].Split('/').Select(s=>s.Replace("~1","/",StringComparison.Ordinal).Replace("~0","~",StringComparison.Ordinal)).ToArray();
            foreach(var segment in segments)
            {
                if(current.ValueKind==JsonValueKind.Object&&current.TryGetProperty(segment,out var field))current=field;
                else if(current.ValueKind==JsonValueKind.Array&&Regex.IsMatch(segment,@"\A(?:0|[1-9][0-9]*)\z")&&int.TryParse(segment,NumberStyles.None,CultureInfo.InvariantCulture,out var index)&&index<current.GetArrayLength())current=current[index];
                else return new Dictionary<string,object>{{"found",false}};
            }
            return new Dictionary<string,object>{{"found",true},{"value",Wrap(current.GetRawText())}};
        });
        Add("setField","JSON Set Field",new(){["value"]=json,["name"]=text,["field"]=json},json,v=>{
            var document=Unwrap(v["value"]);if(document.ValueKind!=JsonValueKind.Object)throw new FormatException("Expected JSON object.");
            var name=(string)v["name"];var field=Unwrap(v["field"]);
            var fields=document.EnumerateObject().Where(p=>p.Name!=name).Select(p=>Quote(p.Name)+":"+Compact(p.Value)).ToList();
            fields.Add(Quote(name)+":"+Compact(field));return Result(Wrap("{"+string.Join(",",fields)+"}"));
        });
    }
}
