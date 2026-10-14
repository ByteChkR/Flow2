using System.Text.Json;
namespace Adam.Flow2.Contracts;

/// <summary>Concrete, serializable specializations for structural and collection values.</summary>
public static class GeneralValueNodes
{
    public static readonly string[] Operations=["dictCreate","dictGet","dictTryGet","dictSet","dictRemove","dictContainsKey","dictKeys","dictValues","ternary","input","output","null","isNull","isMissing","require","hasField","removeField","merge","getProperty","record","withFields","list","count","getItem","addItem","addRange","insertItem","insertRange","setItem","removeAt","removeRange","clear","removeItem","removeAll","tryGetItem","first","last","tryFirst","tryLast","single","trySingle","contains","indexOf","lastIndexOf","isEmpty","skip","take","slice","reverse","chunk","flatten","sort","distinct","union","intersect","except","zip","sum","average","min","max","jsonFrom","jsonTo"];
    public static string NodeType(string id,string operation)=>NodeNames.Value(operation);
    public static NodeDefinition Definition(FlowNode node)
    {
        var b=node.Value!;var t=b.Type;
        void Require(bool test,string message){if(!test)throw new ContractException([new("value_binding","/flow/nodes/"+node.Id,message)]);}
        Require(Operations.Contains(b.Operation)&&node.Type==NodeType(node.Id,b.Operation)&&node.TypeVersion==1&&node.Graph is null&&node.Query is null,"Invalid value specialization.");
        Require(b.Operation is "getProperty" or "removeField"||b.Member is null,"Only GetProperty and RemoveField accept member.");
        Require(b.Operation is "getProperty" or "zip" or "merge"||b.Result is null,"Only GetProperty, Zip and Merge accept result.");
        Require(b.Operation=="withFields"||b.Fields is null,"Only WithFields accepts a field selection.");
        Require(b.Operation=="list"||b.Count is null,"Only ListCreate accepts a count.");
        Dictionary<string,TypeRef> inputs=[],outputs=[];
        Dictionary<string,ConfigField>? config=null;ControlFlow? control=null;string? flowPort=null;
        string label=b.Operation;
        var boolean=new TypeRef("scalar",Name:"core.Bool");
        var integer=new TypeRef("scalar",Name:"core.Integer");
        switch(b.Operation)
        {
            case "dictCreate":case "dictGet":case "dictTryGet":case "dictSet":case "dictRemove":case "dictContainsKey":case "dictKeys":case "dictValues":
                Require(t.Kind!="optional","Dictionary values cannot be absent; use nullable values.");
                var dictionary=new TypeRef("dictionary",Items:t);label="Dictionary "+b.Operation[4..];
                if(b.Operation=="dictCreate"){inputs["entries"]=DictionaryContract.Shape(t);outputs["value"]=dictionary;break;}
                inputs["dictionary"]=dictionary;
                if(b.Operation is "dictGet" or "dictTryGet" or "dictSet" or "dictRemove" or "dictContainsKey")inputs["key"]=new("string");
                if(b.Operation=="dictSet")inputs["item"]=t;
                switch(b.Operation)
                {
                    case "dictGet":outputs["value"]=t;break;
                    case "dictTryGet":outputs["found"]=boolean;outputs["value"]=new("optional",Inner:t);break;
                    case "dictContainsKey":outputs["value"]=boolean;break;
                    case "dictKeys":outputs["value"]=new("array",Items:new("string"));break;
                    case "dictValues":outputs["value"]=new("array",Items:t);break;
                    default:outputs["value"]=dictionary;if(b.Operation=="dictRemove")outputs["removed"]=boolean;break;
                }
                break;
            case "jsonFrom":case "jsonTo":
                Require(t.Kind!="optional"&&JsonValueContract.Supports(t),"JSON conversion requires a scalar, nullable, record or array type.");
                label=b.Operation=="jsonFrom"?"JSON From Value<T>":"JSON To Value<T>";
                inputs["value"]=b.Operation=="jsonFrom"?t:JsonValueContract.Type;
                outputs["value"]=b.Operation=="jsonTo"?t:JsonValueContract.Type;break;
            case "ternary":label="Ternary<T>";inputs["condition"]=boolean;inputs["whenTrue"]=t;inputs["whenFalse"]=t;outputs["value"]=t;break;
            case "input":case "output":
                flowPort=b.Operation;label=b.Operation=="input"?"Flow Input<T>":"Flow Output<T>";
                (b.Operation=="input"?outputs:inputs)["value"]=t;
                if(b.Operation=="output")control=new(true,false,false);
                config=new(){{"name",new("string",JsonSerializer.SerializeToElement(b.Operation),"Name")}};break;
            case "null":case "require":
                Require(t.Kind is not ("optional" or "nullable") && (b.Operation=="null" || t.Kind!="null"),"Choose a present, non-nullable T.");
                label=b.Operation=="null"?"Null<T>":"RequireValue<T>";
                outputs["value"]=b.Operation=="null"&&t.Kind!="null"?new("nullable",Inner:t):t;
                if(b.Operation=="require")inputs["value"]=new("optional",Inner:new("nullable",Inner:t));break;
            case "isNull":
                label="IsNull<T>";Require(t.Kind is "nullable" or "null","IsNull requires a nullable type.");inputs["value"]=t;outputs["value"]=boolean;break;
            case "isMissing":
                label="IsMissing<T>";inputs["value"]=t.Kind=="optional"?t:new("optional",Inner:t);outputs["value"]=boolean;break;
            case "hasField":case "removeField":
                Require(t.Kind=="object","Choose a record type.");inputs["value"]=t;
                if(b.Operation=="hasField"){inputs["name"]=new("string");outputs["value"]=boolean;label="HasField";}
                else{Require(b.Member is not null&&t.Fields!.ContainsKey(b.Member),"Choose an existing field to remove.");outputs["value"]=new("object",Fields:t.Fields!.Where(p=>p.Key!=b.Member).ToDictionary(p=>p.Key,p=>p.Value));outputs["removed"]=boolean;label="RemoveField";}
                break;
            case "merge":
            {
                var right=b.Result??t;Require(t.Kind=="object"&&right.Kind=="object","Merge requires two record types.");
                var mergedFields=new Dictionary<string,TypeRef>(t.Fields!,StringComparer.Ordinal);
                foreach(var (name,next) in right.Fields!)
                {
                    if(!mergedFields.TryGetValue(name,out var prior)){mergedFields[name]=next;continue;}
                    var leftType=prior.Kind=="optional"?prior.Inner!:prior;var rightType=next.Kind=="optional"?next.Inner!:next;
                    Require(TransportContracts.Equivalent(leftType,rightType),"Conflicting record field types: "+name);
                    mergedFields[name]=prior.Kind=="optional"&&next.Kind=="optional"?new("optional",Inner:leftType):leftType;
                }
                Require(mergedFields.Count<=64,"Merged record must have at most 64 mergedFields.");
                inputs["left"]=t;inputs["right"]=right;outputs["value"]=new("object",Fields:mergedFields);label="Merge Records";break;
            }
            case "getProperty":
                label="GetProperty<T>";Require(t.Kind is "object" or "entity"&&!string.IsNullOrEmpty(b.Member),"GetProperty requires a record/entity and member.");
                TypeRef? result=null;
                if(t.Kind=="object")Require(t.Fields!.TryGetValue(b.Member!,out result)&&b.Result is null,"Unknown record member or redundant result type.");
                else {result=b.Result;Require(result is not null,"Entity member needs its registered result type.");}
                inputs["value"]=t;outputs["value"]=result!;break;
            case "record":case "withFields":
                label=b.Operation=="record"?"CreateRecord":"WithFields";
                Require(t.Kind=="object"&&t.Fields is {Count:<=64},"Choose a record with 0–64 named fields.");
                var fields=b.Fields??t.Fields!.Keys.ToArray();
                Require(fields.Distinct(StringComparer.Ordinal).Count()==fields.Length&&fields.All(t.Fields!.ContainsKey),"Unknown or duplicate replacement field.");
                if(b.Operation=="withFields")inputs["value"]=t;
                foreach(var name in fields)inputs["field_"+name]=t.Fields![name];
                outputs["value"]=t;break;
            case "addItem":case "addRange":case "insertItem":case "insertRange":case "setItem":case "removeAt":case "removeRange":case "clear":case "removeItem":case "removeAll":
                Require(t.Kind!="optional","List elements cannot be absent; use nullable elements.");
                var changedList=new TypeRef("array",Items:t);
                label=NodeNames.Value(b.Operation).Split('.').Last()+"<T>";
                inputs["items"]=changedList;outputs["value"]=changedList;
                if(b.Operation is "addItem" or "insertItem" or "setItem" or "removeItem" or "removeAll")inputs["item"]=t;
                if(b.Operation is "addRange" or "insertRange")inputs["additionalItems"]=changedList;
                if(b.Operation is "insertItem" or "insertRange" or "setItem" or "removeAt" or "removeRange")inputs["index"]=integer;
                if(b.Operation=="removeRange")inputs["length"]=integer;
                if(b.Operation=="removeAt")outputs["removedItem"]=t;
                if(b.Operation is "removeItem" or "removeAll")
                {
                    Require(ValueEqualityContract.Supports(t),"Input item: This type does not support value equality.");
                    outputs[b.Operation=="removeItem"?"removed":"removedCount"]=b.Operation=="removeItem"?boolean:integer;
                }
                break;
            case "tryGetItem":case "first":case "last":case "tryFirst":case "tryLast":case "single":case "trySingle":case "contains":case "indexOf":case "lastIndexOf":case "isEmpty":case "skip":case "take":case "slice":case "reverse":case "chunk":case "flatten":
                Require(t.Kind!="optional","List elements cannot be absent; use nullable elements.");
                var selectedList=new TypeRef("array",Items:t);
                label=NodeNames.Value(b.Operation).Split('.').Last()+"<T>";
                inputs["items"]=b.Operation=="flatten"?new("array",Items:selectedList):selectedList;
                outputs["value"]=selectedList;
                if(b.Operation is "first" or "last" or "single")outputs["value"]=t;
                if(b.Operation is "tryGetItem" or "tryFirst" or "tryLast" or "trySingle")
                {
                    outputs["value"]=new("optional",Inner:t);outputs["found"]=boolean;
                    if(b.Operation=="trySingle")outputs["status"]=new("string");
                }
                if(b.Operation is "tryGetItem" or "slice")inputs["index"]=integer;
                if(b.Operation=="slice")inputs["length"]=integer;
                if(b.Operation is "skip" or "take")inputs["count"]=integer;
                if(b.Operation=="chunk"){inputs["size"]=integer;outputs["value"]=new("array",Items:selectedList);}
                if(b.Operation=="isEmpty")outputs["value"]=boolean;
                if(b.Operation is "contains" or "indexOf" or "lastIndexOf")
                {
                    Require(ValueEqualityContract.Supports(t),"Input item: This type does not support value equality.");
                    inputs["item"]=t;outputs["value"]=b.Operation=="contains"?boolean:integer;
                }
                break;
            case "sort":case "distinct":case "union":case "intersect":case "except":case "zip":case "sum":case "average":case "min":case "max":
                Require(t.Kind!="optional","List elements cannot be absent.");
                var advancedList=new TypeRef("array",Items:t);inputs["items"]=advancedList;outputs["value"]=advancedList;
                label=NodeNames.Value(b.Operation).Split('.').Last()+"<T>";
                if(b.Operation is "distinct" or "union" or "intersect" or "except")Require(ValueEqualityContract.Supports(t),"Type does not support equality.");
                if(b.Operation is "union" or "intersect" or "except")inputs["other"]=advancedList;
                if(b.Operation is "sort" or "min" or "max")Require(ValueOrderContract.Supports(t),"Type does not support ordering.");
                if(b.Operation=="sort")inputs["descending"]=new("optional",Inner:boolean);
                if(b.Operation is "min" or "max")outputs["value"]=new("optional",Inner:t);
                if(b.Operation is "sum" or "average")
                {
                    Require(t.Kind=="scalar"&&t.Name is "core.Integer" or "core.Decimal","Choose Integer or Decimal.");
                    outputs["value"]=b.Operation=="sum"?t:new("optional",Inner:new("scalar",Name:"core.Decimal"));
                }
                if(b.Operation=="zip")
                {
                    var right=b.Result??t;Require(right.Kind!="optional","Zip elements cannot be absent.");
                    inputs["other"]=new("array",Items:right);outputs["value"]=new("array",Items:new("object",Fields:new(){{"left",t},{"right",right}}));
                }
                break;
            case "list":case "count":case "getItem":
                Require(t.Kind!="optional","List elements cannot be absent; use nullable elements.");
                var list=new TypeRef("array",Items:t);
                if(b.Operation=="list")
                {
                    label="ListCreate<T>";Require(b.Count is >=0 and <=256,"ListCreate needs a count between 0 and 256.");
                    for(var i=0;i<b.Count;i++)inputs["item_"+i]=t;outputs["value"]=list;
                }
                else {inputs["items"]=list;outputs["value"]=b.Operation=="count"?integer:t;label=b.Operation=="count"?"ListCount<T>":"GetItem<T>";if(b.Operation=="getItem")inputs["index"]=integer;}
                break;
        }
        var environments=inputs.Values.Concat(outputs.Values).All(TransportContracts.IsTransportable)?new[]{"server","browser"}:new[]{"server"};
        Require(node.Environment!="browser"||environments.Contains("browser"),"Native values require backend execution.");
        return new(node.Type,1,environments,inputs,outputs,new(Label:label,Description:b.Operation=="ternary"?"condition ? whenTrue : whenFalse. Beide verbundenen Zweige werden ausgewertet.":null,Category:flowPort is null?"Values/Generic":"Flow/Generic",Inputs:inputs.Keys.ToDictionary(k=>k,k=>new PortMetadata(Label:k.StartsWith("field_")?k[6..]:k))),config,control,flowPort,Value:b,NodeId:node.Id);
    }
    public static ValueNodeBinding Default(string operation)=>new(operation,operation switch
    {"sum" or "average"=>new("scalar",Name:"core.Decimal"),"isNull"=>new("nullable",Inner:new("string")),"record" or "withFields" or "getProperty" or "hasField" or "removeField" or "merge"=>new("object",Fields:new(){{"text",new("string")}}),_=>new("string")},Member:operation is "getProperty" or "removeField"?"text":null,Count:operation=="list"?2:null);
    public static NodeDefinition[] Templates()=>Operations.Select(operation=>
    {
        var definition=Definition(new("template",NodeType("template",operation),1,"server",[],Value:Default(operation)));
        return definition with{Type=NodeNames.Value(operation),Value=null,NodeId=null};
    }).ToArray();
}
