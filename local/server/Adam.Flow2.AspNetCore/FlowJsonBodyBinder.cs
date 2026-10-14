using Microsoft.AspNetCore.Mvc.ModelBinding;
using Newtonsoft.Json;
using Newtonsoft.Json.Linq;

namespace Adam.Flow2.AspNetCore;

/// <summary>Keep exact scalar strings intact despite Adam's MVC Newtonsoft date parsing defaults.</summary>
public sealed class FlowJsonBodyBinder : IModelBinder
{
    public async Task BindModelAsync(ModelBindingContext context)
    {
        using var reader=new StreamReader(context.HttpContext.Request.Body,leaveOpen:true);
        using var json=new JsonTextReader(reader){DateParseHandling=DateParseHandling.None,FloatParseHandling=FloatParseHandling.Decimal};
        try
        {
            var body=await JObject.LoadAsync(json,context.HttpContext.RequestAborted);
            if(await json.ReadAsync(context.HttpContext.RequestAborted))throw new JsonReaderException("Unexpected content after request body.");
            context.Result=ModelBindingResult.Success(body);
        }
        catch(Exception error) when(error is JsonException or FormatException or OverflowException)
        {
            context.ModelState.TryAddModelError(context.ModelName,"Invalid Flow2 JSON request.");
        }
    }
}
