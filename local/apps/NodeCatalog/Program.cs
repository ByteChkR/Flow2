using System.Text.Json;
using Adam.Flow2.Contracts;
using Adam.Flow2.Hosting;

// Intentionally emits contract metadata only. Nodes and host services are never executed.
var catalog = new StandardFlowRegistry().Create().Nodes.Catalog;
Console.Out.Write(JsonSerializer.Serialize(catalog, ContractSchemas.JsonOptions));
