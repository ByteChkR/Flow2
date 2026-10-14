using Adam.Flow2.Runtime;
using System.Text.RegularExpressions;
namespace Adam.Flow2.Nodes;

public interface IFlowTextProvider { Task<string> GetText(string name, CancellationToken cancellationToken); }

[FlowNode("Standard.Values.Constant.Catalog",Label="Catalog",Category="Values",Description="Name eines Adam-Katalogs. Im Editor aus den verfügbaren Katalogen auswählen.")]
public sealed class ConstantCatalog:IFlowNode
{
    [FlowConfig("value","",Label="Katalog")] public string ConfiguredValue {get;set;}="";
    [FlowOutput("value")] public string Value {get;private set;}="";
    public void Execute()
    {
        if(string.IsNullOrWhiteSpace(ConfiguredValue))throw new ArgumentException("Katalogname darf nicht leer sein.");
        Value=ConfiguredValue;
    }
}

[FlowNode("Standard.Text.ByName",Label="TextByName",Category="Values/Text",Description="Lädt den benannten Texteintrag über den vom Host bereitgestellten Text-Service.")]
public sealed class TextByName(IFlowTextProvider config):IAsyncFlowNode
{
    [FlowConfig("name","",Label="Texteintrag")] public string Name {get;set;}="";
    [FlowOutput("value")] public string Value {get;private set;}="";
    public async ValueTask ExecuteAsync(CancellationToken cancellationToken)
    {
        if(string.IsNullOrWhiteSpace(Name))throw new ArgumentException("Textname darf nicht leer sein.");
        cancellationToken.ThrowIfCancellationRequested();
        Value=await config.GetText(Name,cancellationToken);
        cancellationToken.ThrowIfCancellationRequested();
    }
}

[FlowNode("Standard.Values.Constant.Image",Label="Constant Image",Category="Values/Image",Description="Normalisiert Base64-Bilddaten oder eine Bild-Data-URL zu einer Data-URL; ungültige Bilddaten führen zu einem Fehler.")]
public sealed class ConstantImage:IFlowNode
{
    [FlowConfig("value","",Label="Base64 / Data-URL")] public string ConfiguredValue {get;set;}="";
    [FlowConfig("mimeType","image/png",Label="MIME-Typ")] public string MimeType {get;set;}="image/png";
    [FlowOutput("value")] public string Value {get;private set;}="";
    public void Execute()=>Value=Normalize(ConfiguredValue,MimeType);
    public static string Normalize(string value,string mimeType)
    {
        if(value.Length==0)return "";
        var match=Regex.Match(value,@"^data:(image/(?:png|jpeg|gif|webp|svg\+xml|avif|bmp));base64,([A-Za-z0-9+/]*={0,2})$");
        var data=match.Success?match.Groups[2].Value:value;
        var mime=match.Success?match.Groups[1].Value:mimeType;
        if(!Regex.IsMatch(mime,@"^image/(png|jpeg|gif|webp|svg\+xml|avif|bmp)$")||data.Length==0||data.Any(char.IsWhiteSpace)||data.Length%4!=0||!Regex.IsMatch(data,@"^[A-Za-z0-9+/]+={0,2}$"))
            throw new ArgumentException("Bild benötigt gültiges Base64 und einen unterstützten image-MIME-Typ.");
        return $"data:{mime};base64,{data}";
    }
}
