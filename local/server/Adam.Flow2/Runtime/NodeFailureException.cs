namespace Adam.Flow2.Runtime;
public interface INodeFailure {string Code {get;}}
public sealed class NodeFailureException(string code,string message):Exception(message),INodeFailure
{
 public string Code {get;}=code;
 public static string? FindCode(Exception error){for(Exception? current=error;current is not null;current=current.InnerException)if(current is INodeFailure failure)return failure.Code;return null;}
}
