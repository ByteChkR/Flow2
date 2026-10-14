using System.Collections;
using Adam.Flow2.Contracts;
namespace Adam.Flow2.Runtime;

public static class ListSelectionRuntime
{
    public static IReadOnlyDictionary<string,object> Execute(ValueNodeBinding binding,IReadOnlyDictionary<string,object> inputs,Func<string,object,object,bool>? entityEquals=null)
    {
        Dictionary<string,object> Result(object? value)=>new(){{"value",value!}};
        int Integer(string port,int min)
        {
            var value=(int)inputs[port];
            if(value<min)throw new ArgumentOutOfRangeException(port,$"Input {port}: Expected an integer >= {min}.");
            return value;
        }
        var sequence=((IEnumerable)inputs["items"]).Cast<object?>();
        var operation=binding.Operation;
        if(operation is "contains" or "indexOf" or "lastIndexOf")
        {
            var index=-1;var i=0;
            foreach(var item in sequence)
            {
                if(ValueEquality.Equal(binding.Type,item,inputs["item"],entityEquals))
                {index=i;if(operation!="lastIndexOf")break;}
                i++;
            }
            return Result(operation=="contains"?(object)(index>=0):index);
        }
        // Array contracts have already validated a materialized collection. Reuse indexed
        // containers where possible and preserve the element references in every result.
        var items=inputs["items"] as IList??sequence.ToList();
        switch(operation)
        {
            case "isEmpty":return Result(items.Count==0);
            case "first":case "last":case "single":
                if(items.Count==0||operation=="single"&&items.Count!=1)throw new InvalidOperationException(operation=="single"?"Input items: Expected exactly one element.":"Input items: List must not be empty.");
                return Result(items[operation=="last"?items.Count-1:0]);
            case "tryGetItem":case "tryFirst":case "tryLast":case "trySingle":
                var position=operation=="tryGetItem"?(int)inputs["index"]:operation=="tryLast"?items.Count-1:0;
                var found=position>=0&&position<items.Count&&(operation!="trySingle"||items.Count==1);
                var result=new Dictionary<string,object>{{"found",found}};
                if(found)result["value"]=items[position]!;
                if(operation=="trySingle")result["status"]=items.Count==0?"empty":items.Count==1?"single":"multiple";
                return result;
            case "skip":return Result(sequence.Skip(Integer("count",0)).ToList());
            case "take":return Result(sequence.Take(Integer("count",0)).ToList());
            case "slice":
                var index=Integer("index",0);var length=Integer("length",0);
                if(index>items.Count)throw new ArgumentOutOfRangeException("index","Input index: Index out of range.");
                if(length>items.Count-index)throw new ArgumentOutOfRangeException("length","Input length: Range must fit within the list.");
                return Result(sequence.Skip(index).Take(length).ToList());
            case "reverse":return Result(sequence.Reverse().ToList());
            case "chunk":
                var size=Integer("size",1);var chunks=new List<List<object?>>();
                for(var start=0;start<items.Count;)
                {
                    var count=Math.Min(size,items.Count-start);var chunk=new List<object?>(count);
                    for(var j=0;j<count;j++)chunk.Add(items[start+j]);
                    chunks.Add(chunk);start+=count;
                }
                return Result(chunks);
            case "flatten":return Result(sequence.SelectMany(item=>((IEnumerable)item!).Cast<object?>()).ToList());
            default:throw new InvalidOperationException("Unknown list selection operation.");
        }
    }
}
