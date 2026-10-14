using Adam.Flow2.Contracts;
namespace Adam.Flow2.Runtime;
public static class BinaryNodes
{
    public static string Encode(int[] values)
    {
        if(values.Any(value=>value<0||value>255))throw new ArgumentException("Byte values must be between 0 and 255.");
        return Convert.ToBase64String(values.Select(value=>(byte)value).ToArray());
    }
    public static int[] Decode(string value)
    {
        var text=new string(value.Where(c=>c is not (' ' or '\t' or '\r' or '\n')).ToArray());
        var bytes=Convert.FromBase64String(text);
        if(Convert.ToBase64String(bytes)!=text)throw new FormatException("Expected canonical Base64 (not a data URL).");
        return bytes.Select(value=>(int)value).ToArray();
    }
    public static void Register(NodeRegistry nodes)
    {
        var map=new NodeTypeMap();
        nodes.Register(new(new("Standard.Convert.ByteArrayToBase64",1,new Dictionary<string,PortType>{{"value",new("ByteArray",typeof(int[]),new("array",Items:new("scalar",Name:"core.Integer")))}},
            new Dictionary<string,PortType>{{"value",map.Resolve(typeof(string))}},new(Label:"Array to Base64",Category:"Convert",Description:"Kodiert eine Liste von Bytes (0 bis 255) als Base64.")),
            inputs=>new Dictionary<string,object>{{"value",Encode((int[])inputs["value"])}}));
        nodes.Register(new(new("Standard.Convert.Base64ToByteArray",1,new Dictionary<string,PortType>{{"value",map.Resolve(typeof(string))}},
            new Dictionary<string,PortType>{{"value",new("ByteArray",typeof(int[]),new("array",Items:new("scalar",Name:"core.Integer"))) }},
            new(Label:"Base64 to Array",Category:"Convert")),inputs=>new Dictionary<string,object>{{"value",Decode((string)inputs["value"])}}));
    }
}
