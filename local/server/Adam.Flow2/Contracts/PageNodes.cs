using System.Text.Json;

namespace Adam.Flow2.Contracts;

/// <summary>Canonical browser UI contracts, specialized independently for each graph instance.</summary>
public static class PageNodes
{
    public static NodeDefinition Definition(FlowNode node) => NodeDescriptions.Describe(DefinitionCore(node));
    private static NodeDefinition DefinitionCore(FlowNode node)
    {
        if(node.Type is "Frontend.UI.Input" or "Frontend.UI.Table" or "Frontend.UI.EditTable")return InputDefinition(node);
        if(node.Type is not ("Frontend.UI.ShowPage" or "Frontend.UI.ShowDialog") || node.TypeVersion!=1 ||
           node.Environment!="browser" || node.Ui?.DataType is not {Kind:"object",Fields:not null} data || !TransportContracts.IsTransportable(data))
            throw new InvalidOperationException("Ansicht benötigt einen transportierbaren Record-Vertrag.");
        static TypeRef Optional(TypeRef type)=>new("optional",Inner:type);
        var text=new TypeRef("string");var boolean=new TypeRef("scalar",Name:"core.Bool");
        var inputs=new Dictionary<string,TypeRef>{{"page",new("pageConfig")},{"data",data.Fields.Count==0?Optional(data):data}};
        if(node.Type=="Frontend.UI.ShowDialog")inputs["dialogOptions"]=Optional(new("object",Fields:new()
        { {"fullscreen",Optional(boolean)}, {"size",Optional(text)}, {"allowCancel",Optional(boolean)}, {"cancelLabel",Optional(text)} }));
        return new(node.Type,1,["browser"],inputs,new(){{"action",text},{"cancelled",boolean},{"data",Optional(data)}},
            Control:new(true,true,false),NodeId:node.Id,Ui:node.Ui);
    }
    private static NodeDefinition InputDefinition(FlowNode node)
    {
        if(node.TypeVersion!=1||node.Environment!="browser"||node.Ui?.DataType is not {Kind:"object",Fields:not null} data||!TransportContracts.IsTransportable(data))
            throw new InvalidOperationException("Eingabe benötigt einen transportierbaren Record-Vertrag.");
        static TypeRef Optional(TypeRef type)=>new("optional",Inner:type);
        var text=new TypeRef("string");var boolean=new TypeRef("scalar",Name:"core.Bool");
        var options=new TypeRef("object",Fields:new(){{"fullscreen",Optional(boolean)},{"size",Optional(text)},{"allowCancel",Optional(boolean)},{"cancelLabel",Optional(text)}});
        var config=new Dictionary<string,ConfigField>
        {
            {"display",new("string",JsonSerializer.SerializeToElement("page"),Options:["page","dialog"])},
            {"allowCancel",new("boolean",JsonSerializer.SerializeToElement(true))},
            {"dialogSize",new("string",JsonSerializer.SerializeToElement("large"),Options:["small","medium","large"])},
            {"fullscreen",new("boolean",JsonSerializer.SerializeToElement(false))}
        };
        var inputs=new Dictionary<string,TypeRef>{{"title",text},{"subtitle",Optional(text)},{"htmlContent",Optional(text)},{"icon",Optional(text)},{"dialogOptions",Optional(options)}};
        var outputs=new Dictionary<string,TypeRef>{{"action",text},{"cancelled",boolean}};
        if(node.Type=="Frontend.UI.Input")
        {
            inputs["data"]=Optional(data);outputs["data"]=Optional(data);
            var integer=new TypeRef("scalar",Name:"core.Integer");
            var choice=new TypeRef("object",Fields:new(){{"value",text},{"label",text}});
            var field=new TypeRef("object",Fields:new(){{"field",text},{"label",Optional(text)},{"helpText",Optional(text)},{"required",Optional(boolean)},
                {"min",Optional(text)},{"max",Optional(text)},{"minLength",Optional(integer)},{"maxLength",Optional(integer)},{"editor",Optional(text)},{"options",Optional(new("array",Items:choice))}});
            inputs["fields"]=Optional(new("array",Items:field));config["fields"]=new("string",JsonSerializer.SerializeToElement("[]"));
        }
        else
        {
            var integer=new TypeRef("scalar",Name:"core.Integer");
            var rows=new TypeRef("array",Items:data);var indices=new TypeRef("array",Items:integer);
            var column=new TypeRef("object",Fields:new(){{"field",text},{"label",Optional(text)},{"readonly",Optional(boolean)},{"required",Optional(boolean)},{"width",Optional(integer)}});
            var button=new TypeRef("object",Fields:new(){{"id",text},{"label",text},{"icon",Optional(text)},{"disabled",Optional(boolean)},{"visible",Optional(boolean)}});
            inputs["rows"]=rows;inputs["columns"]=Optional(new("array",Items:column));inputs["buttons"]=new("array",Items:button);outputs["rows"]=Optional(rows);
            config["columns"]=new("string",JsonSerializer.SerializeToElement("[]"));config["pageSize"]=new("number",JsonSerializer.SerializeToElement(25));
            if(node.Type=="Frontend.UI.Table")
            {
                inputs["selectedIndices"]=Optional(indices);outputs["selectedIndices"]=Optional(indices);outputs["selectedRows"]=Optional(rows);
                config["selection"]=new("string",JsonSerializer.SerializeToElement("none"),Options:["none","single","multiple"]);
                config["required"]=new("boolean",JsonSerializer.SerializeToElement(false));
            }
        }
        // Match the optional config overrides in the browser's specialized step contracts.
        foreach(var (key,field) in config)
            if(!inputs.ContainsKey(key))inputs[key]=Optional(field.Type switch
            {
                "boolean"=>boolean,
                "number"=>new TypeRef("scalar",Name:"core.Integer"),
                _=>text
            });
        return new(node.Type,1,["browser"],inputs,outputs,Config:config,Control:new(true,true,false),NodeId:node.Id,Ui:node.Ui);
    }
    public static NodeCatalog BrowserCatalog(FlowDocument flow,NodeCatalog catalog)
    {
        var generated=flow.Nodes.Where(n=>n.Ui is not null).Select(Definition).ToArray();
        return new(1,[..catalog.Nodes.Where(n=>!generated.Any(g=>g.Type==n.Type&&g.NodeId==n.NodeId)),..generated]);
    }
}
