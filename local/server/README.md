# Flow .NET packages

`Adam.Flow2` contains contracts, compiler/runtime, Jint expressions and portable nodes. `Adam.Flow2.AspNetCore` contains the coordinator, HTTP controller base, runtime factory and host interfaces. `Adam.Flow2.EntityFrameworkCore` contains generic EF query/entity nodes and policy interfaces.

Applications supply authentication, trusted owner identity, tenant/service scopes, business nodes, persistence and notifications. `FlowControllerBase` is abstract and has no anonymous production route. The loopback BenchmarkHost is development-only.

Packages are built locally by `npm run build`; no publication is performed. See the root README.
