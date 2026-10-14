using Adam.Flow2.Contracts;
using System.Collections;
namespace Adam.Flow2.Runtime;
public static class FormattingNodes
{
    public static void Register(NodeRegistry nodes)
    {
        var map=new NodeTypeMap();var text=map.Resolve(typeof(string));
        foreach(var (name,type) in new (string,Type)[]{("integer",typeof(int)),("decimal",typeof(decimal)),("guid",typeof(Guid)),("timespan",typeof(TimeSpan)),("datetimeoffset",typeof(DateTimeOffset))})
            nodes.Register(new(new($"Standard.Convert.{(name=="datetimeoffset"?"DateTimeOffset":name=="timespan"?"TimeSpan":char.ToUpperInvariant(name[0])+name[1..])}.Format",1,new Dictionary<string,PortType>{{"value",map.Resolve(type)},{"format",text},{"language",text}},new Dictionary<string,PortType>{{"value",text}},new(Label:$"FormatValue ({name})",Category:"Convert")),v=>new Dictionary<string,object>{{"value",ValueFormatting.Format(name,v["value"],(string)v["format"],(string)v["language"])}}));
        nodes.Register(new(new("Standard.Text.Format",1,new Dictionary<string,PortType>{{"template",text},{"arguments",new("array",typeof(object),new("array",Items:new("string")),Dynamic:true)}},new Dictionary<string,PortType>{{"value",text}},new(Label:"Format",Category:"Text")),v=>new Dictionary<string,object>{{"value",ValueFormatting.Text((string)v["template"],((IEnumerable)v["arguments"]).Cast<string>().ToArray())}}));
    }
}
