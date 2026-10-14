using Flow.Nodes.Server;
using Flow.Runtime.Jint;

var demo = new ContactDemo();
var result = new ServerSegmentRunner(demo.Registry, DemoCodecs.Create(demo.Registry.Types), DemoCodecs.Definitions("browser")).Execute(ContactDemo.Plan());
Console.WriteLine($"Execution: {result.ExecutionId}");
Console.WriteLine($"C# reference preserved: {ReferenceEquals(demo.Original, demo.Inspected)}");
Console.WriteLine($"Wire JSON: {result.WireJson}");
Console.WriteLine($"Generated JavaScript:\n{result.GeneratedJavaScript}");
