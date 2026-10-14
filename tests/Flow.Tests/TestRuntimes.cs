using Adam.Flow2.Runtime;
using Flow.Nodes.Server;
using Flow.Runtime.Jint;

namespace Flow.Tests;

internal static class TestRuntimes
{
    public static ServerSegmentRunner Runner(NodeRegistry nodes, int maxStatements = 10_000) =>
        new(nodes, DemoCodecs.Create(nodes.Types), DemoCodecs.Definitions("browser"), maxStatements);
}
