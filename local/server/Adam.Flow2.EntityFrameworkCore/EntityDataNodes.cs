using System.Reflection;
using Adam.Flow2.Contracts;
using Adam.Flow2.Runtime;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;

namespace Adam.Flow2.EntityFrameworkCore;

public interface IFlowEntityPolicy<TContext> where TContext : DbContext
{
    void Initialize(TContext context, object entity);
    void Validate(TContext context, object entity);
}

/// <summary>Explicit tracked changes. Only SaveChanges persists; normal context auditing and rights checks remain active.</summary>
public static class EntityDataNodes
{
    private static readonly HashSet<string> ProtectedFields = new(StringComparer.Ordinal)
    { "Id", "MandantId", "ErstelltAm", "ErstelltVonId", "AktualisiertAm", "AktualisiertVonId", "Geloescht" };
    public static string NodeId<TContext,TEntity>(string operation) => "Backend.EF."+char.ToUpperInvariant(operation[0])+operation[1..];
    public static void Register<TContext,TEntity>(NodeRegistry nodes, Func<IServiceProvider> services) where TContext : DbContext where TEntity : class
    {
        var idProperty = typeof(TEntity).GetProperty("Id");
        if(idProperty?.PropertyType != typeof(Guid) || idProperty.GetMethod?.IsPublic != true)return;
        var entityType = new TypeRef("entity", Name: DbContextQueryableSources<TContext>.EntityId(typeof(TEntity)));
        var entityPort = new PortType(typeof(TEntity).Name, typeof(TEntity), entityType);
        var idPort = new PortType("Guid", typeof(Guid), new("scalar", Name:"core.Guid"));
        var declared = nodes.GetEntityDefinition(entityType.Name!).Fields;
        var properties = typeof(TEntity).GetProperties().Where(property => property.SetMethod?.IsPublic == true && !ProtectedFields.Contains(property.Name) && (property.PropertyType.IsValueType || property.PropertyType == typeof(string)) && declared.ContainsKey(property.Name)).ToDictionary(property=>property.Name);
        TContext Context() => services().GetRequiredService<TContext>();
        IFlowEntityPolicy<TContext>? Policy() => services().GetService<IFlowEntityPolicy<TContext>>();
        async Task<TEntity> Get(TContext context, Guid id, CancellationToken token)
        {
            // A predicate query deliberately preserves global filters; Find can return filtered tracked objects.
            var entity = await context.Set<TEntity>().AsTracking().SingleOrDefaultAsync(item => EF.Property<Guid>(item,"Id") == id, token)
                ?? throw new InvalidOperationException($"{typeof(TEntity).Name} {id} was not found or is inaccessible.");
            return entity;
        }
        Add("getById", "GetEntityById", new() { ["id"] = idPort }, new() { ["entity"] = entityPort },
            async (inputs, token) => new() { ["entity"] = await Get(Context(), (Guid)inputs["id"], token) });
        if(typeof(TEntity).GetConstructor(Type.EmptyTypes) is not null && idProperty.SetMethod?.IsPublic == true)
            Add("create", "CreateEntity", [], new() { ["entity"] = entityPort, ["id"] = idPort }, (inputs, token) =>
            {
                var context = Context();var entity = Activator.CreateInstance<TEntity>();var id = Guid.NewGuid();idProperty.SetValue(entity,id);
                Policy()?.Initialize(context,entity);Policy()?.Validate(context,entity);
                context.Set<TEntity>().Add(entity);
                return ValueTask.FromResult(new Dictionary<string,object> { ["entity"] = entity, ["id"] = id });
            });
        var fieldInputs = new Dictionary<string, PortType> { ["entity"] = entityPort };
        foreach(var (name, property) in properties)fieldInputs["field_" + name] = new(property.PropertyType.Name,property.PropertyType,new("optional", Inner:declared[name]));
        Add("setFields", "SetEntityFields", fieldInputs, new() { ["entity"] = entityPort }, async (inputs,token) =>
        {
            var context=Context();var entity=(TEntity)inputs["entity"];
            if(context.Entry(entity).State != EntityState.Added)entity=await Get(context,(Guid)idProperty.GetValue(entity)!,token);
            Policy()?.Validate(context,entity);
            // Validate all mapped properties before applying any change.
            var changes = properties.Where(pair=>inputs.ContainsKey("field_"+pair.Key)).ToArray();
            var metadata=context.Model.FindEntityType(typeof(TEntity)) ?? throw new InvalidOperationException("Entity is not mapped.");
            foreach(var (name,property) in changes)
            {
                var mapped=metadata.FindProperty(name);
                if(mapped is null || mapped.IsPrimaryKey() || mapped.IsConcurrencyToken || mapped.ValueGenerated != Microsoft.EntityFrameworkCore.Metadata.ValueGenerated.Never)
                    throw new InvalidOperationException($"Field {name} cannot be edited by this node.");
            }
            foreach(var (name,property) in changes)property.SetValue(entity,inputs["field_"+name]);
            return new() { ["entity"] = entity };
        });
        Add("delete", "DeleteEntity", new() { ["id"] = idPort }, [], async (inputs,token) =>
        {
            var context=Context();var entity=await Get(context,(Guid)inputs["id"],token);Policy()?.Validate(context,entity);context.Remove(entity);return [];
        });
        void Add(string operation,string label,Dictionary<string,PortType> inputs,Dictionary<string,PortType> outputs,Func<IReadOnlyDictionary<string,object>,CancellationToken,ValueTask<Dictionary<string,object>>> execute)
        {
            nodes.Register(new(new(NodeId<TContext,TEntity>(operation),1,inputs,outputs,new(Label:$"{label}<{typeof(TEntity).Name}>",Category:$"Data/Entities/{typeof(TContext).Name}"),Control:new(true,true,false)),
                _=>throw new InvalidOperationException("Use async entity execution."), ExecuteAsync:async(values,_,token)=>{token.ThrowIfCancellationRequested();return await execute(values,token);}));
        }
    }
    public static void RegisterSave<TContext>(NodeRegistry nodes,Func<IServiceProvider> services) where TContext:DbContext
    {
        nodes.Register(new(new("Backend.EF.SaveChanges",1,new Dictionary<string,PortType>(),
            new Dictionary<string,PortType>{{"count",new("Integer",typeof(int),new("scalar",Name:"core.Integer"))}},
            new(Label:"SaveChanges",Category:$"Data/Entities/{typeof(TContext).Name}"),Control:new(true,true,false)),
            _=>throw new InvalidOperationException("Use async save execution."),ExecuteAsync:async(_,_,token)=>
            {
                var context=services().GetRequiredService<TContext>();
                try
                {
                    var policy=services().GetService<IFlowEntityPolicy<TContext>>();
                    foreach(var entry in context.ChangeTracker.Entries().Where(entry=>entry.State is EntityState.Added or EntityState.Modified or EntityState.Deleted))policy?.Validate(context,entry.Entity);
                    // MacContext may issue more than one SaveChanges for calculations/auditing.
                    // Enclose the whole explicit save boundary, not just the first EF flush.
                    await using var transaction = context.Database.IsRelational() && context.Database.CurrentTransaction is null
                        ? await context.Database.BeginTransactionAsync(token) : null;
                    var count = await context.SaveChangesAsync(token);
                    if(transaction is not null)await transaction.CommitAsync(token);
                    return new Dictionary<string,object>{{"count",count}};
                }
                catch { context.ChangeTracker.Clear();throw; }
            }));
    }
}
