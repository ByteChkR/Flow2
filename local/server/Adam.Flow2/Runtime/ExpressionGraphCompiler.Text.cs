using System.Linq.Expressions;
using Adam.Flow2.Contracts;


namespace Adam.Flow2.Runtime;

public sealed partial class ExpressionGraphCompiler
{
    private static readonly Dictionary<string,string[]> TextInputs = new(StringComparer.Ordinal)
    {
        ["stringIsNullOrEmpty"]=["value"], ["stringIsNullOrWhiteSpace"]=["value"],
        ["stringContains"]=["value","search"], ["stringStartsWith"]=["value","search"], ["stringEndsWith"]=["value","search"],
        ["coalesce"]=["value","fallback"], ["stringLength"]=["value"],
        ["stringTrim"]=["value"], ["stringToLower"]=["value"], ["stringToUpper"]=["value"],
        ["stringReplace"]=["value","search","replacement"], ["stringSubstring"]=["value","start","length"],
        ["stringConcat"]=["left","right"], ["stringDefaultIfEmpty"]=["value","fallback"], ["stringDefaultIfWhiteSpace"]=["value","fallback"],
        ["stringIndexOf"]=["value","search"], ["stringTrimStart"]=["value"], ["stringTrimEnd"]=["value"], ["stringLike"]=["value","pattern"]
    };

    // Explicit .NET whitespace set: SQLite/PostgreSQL default TRIM sets differ.
    private static readonly char[] TextWhitespace = ['\t','\n','\v','\f','\r',' ','\u0085','\u00a0','\u1680','\u2000','\u2001','\u2002','\u2003','\u2004','\u2005','\u2006','\u2007','\u2008','\u2009','\u200a','\u2028','\u2029','\u202f','\u205f','\u3000'];
    private Typed CompileText(ExpressionNode node, Func<string,Typed> input)
    {
        var id=node.Id;
        if(node.Operation=="coalesce")
        {
            var value=input("value"); var fallback=input("fallback");
            if(value.Type.Kind!="nullable" || !TransportContracts.Equivalent(value.Type.Inner!,fallback.Type) && !TransportContracts.Equivalent(value.Type,fallback.Type))
                throw Error(id,"?? requires Nullable<T> and a fallback of type T or Nullable<T>.");
            return new(Expression.Coalesce(value.Value,fallback.Value),fallback.Type);
        }
        Typed Text(string name,bool nullable=false)
        {
            var value=input(name);
            if(value.Type.Kind!="string" && !(nullable && value.Type.Kind=="nullable" && value.Type.Inner!.Kind=="string"))
                throw Error(id,$"{name}: string{(nullable?" or nullable string":"")} required.");
            return value;
        }
        Expression Integer(string name)
        {
            var value=input(name);
            if(!TransportContracts.Equivalent(value.Type,new("scalar",Name:"core.Integer")))throw Error(id,$"{name}: Integer required.");
            return value.Value;
        }
        Expression Null(Expression value)=>Expression.Equal(value,Expression.Constant(null,typeof(string)));
        Expression Call(Expression owner,string method,params Expression[] args)=>Expression.Call(owner,typeof(string).GetMethod(method,args.Select(a=>a.Type).ToArray())!,args);
        Expression Static(string method,Expression arg)=>Expression.Call(typeof(string).GetMethod(method,[typeof(string)])!,arg);
        Expression WhiteSpace(Expression text)=>Expression.OrElse(Null(text),Expression.Equal(Call(text,nameof(string.Trim),Expression.Constant(TextWhitespace)),Expression.Constant("")));
        Typed Lift(Expression expression,TypeRef type,params Typed[] owners)
        {
            var nullableOwners=owners.Where(owner=>owner.Type.Kind=="nullable").ToArray();
            if(nullableOwners.Length==0)return new(expression,type);
            var nullableType=new TypeRef("nullable",Inner:type);var clr=Resolve(nullableType);
            if(expression.Type!=clr)expression=Expression.Convert(expression,clr);
            var missing=nullableOwners.Select(owner=>Null(owner.Value)).Aggregate(Expression.OrElse);
            return new(Expression.Condition(missing,Expression.Default(clr),expression),nullableType);
        }
        if(node.Operation=="stringConcat")
        {
            var left=Text("left",true);var right=Text("right",true);
            return Lift(Expression.Call(typeof(string).GetMethod(nameof(string.Concat),[typeof(string),typeof(string)])!,left.Value,right.Value),new("string"),left,right);
        }
        var source=Text("value",true);var text=source.Value;
        switch(node.Operation)
        {
            case "stringIsNullOrEmpty":return new(Static(nameof(string.IsNullOrEmpty),text),Bool);
            case "stringIsNullOrWhiteSpace":return new(WhiteSpace(text),Bool);
            case "stringContains":case "stringStartsWith":case "stringEndsWith":case "stringLike":
                var argument=Text(node.Operation=="stringLike"?"pattern":"search").Value;
                var match=node.Operation=="stringLike"
                    ? (QueryExpressionProviders.Like ?? throw new NotSupportedException("A query provider must register the LIKE expression translator."))(text,argument)
                    : Call(text,node.Operation switch{"stringContains"=>nameof(string.Contains),"stringStartsWith"=>nameof(string.StartsWith),_=>nameof(string.EndsWith)},argument);
                return new(Expression.AndAlso(Expression.Not(Null(text)),match),Bool);
            case "stringDefaultIfEmpty":case "stringDefaultIfWhiteSpace":
                var replacement=Text("fallback").Value;
                return new(Expression.Condition((node.Operation=="stringDefaultIfEmpty"?Static(nameof(string.IsNullOrEmpty),text):WhiteSpace(text)),replacement,text),new("string"));
            case "stringLength":return Lift(Expression.Property(text,nameof(string.Length)),new("scalar",Name:"core.Integer"),source);
            case "stringIndexOf":return Lift(Call(text,nameof(string.IndexOf),Text("search").Value),new("scalar",Name:"core.Integer"),source);
            case "stringSubstring":return Lift(Call(text,nameof(string.Substring),Integer("start"),Integer("length")),new("string"),source);
            case "stringReplace":
                var search=Text("search").Value;var replace=Text("replacement").Value;
                return Lift(Expression.Condition(Expression.Equal(search,Expression.Constant("")),text,Call(text,nameof(string.Replace),search,replace)),new("string"),source);
            default:
                var method=node.Operation switch{"stringTrim"=>nameof(string.Trim),"stringTrimStart"=>nameof(string.TrimStart),"stringTrimEnd"=>nameof(string.TrimEnd),"stringToLower"=>nameof(string.ToLower),"stringToUpper"=>nameof(string.ToUpper),_=>throw Error(id,"Unknown text operation.")};
                return Lift(method.StartsWith("Trim",StringComparison.Ordinal)?Call(text,method,Expression.Constant(TextWhitespace)):Call(text,method),new("string"),source);
        }
    }
}
