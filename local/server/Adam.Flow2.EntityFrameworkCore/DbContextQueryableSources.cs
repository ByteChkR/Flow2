using System.Reflection;
using System.ComponentModel.DataAnnotations.Schema;
using Adam.Flow2.Contracts;
using Adam.Flow2.Runtime;

using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;

namespace Adam.Flow2.EntityFrameworkCore;

public interface IFlowQueryableSources
{
    TypeDocument Types { get; }
    void Register(NodeRegistry nodes, Func<IServiceProvider> services);
    RegisteredNode Create(FlowNode node,Func<IServiceProvider> services);
    bool EntitiesEqual(string type,object left,object right,Func<IServiceProvider> services);
    uint EntityHash(string type,object value,Func<IServiceProvider> services)=>0;
}

/// <summary>Metadata discovery never creates a DbContext. Sources obtain the run's scoped context lazily.</summary>
public sealed class DbContextQueryableSources<TContext> : IFlowQueryableSources where TContext : DbContext
{
    private static readonly PropertyInfo[] sets = typeof(TContext).GetProperties(BindingFlags.Instance | BindingFlags.Public)
        .Where(property => property.GetMethod?.IsPublic == true && property.GetIndexParameters().Length == 0 &&
            property.PropertyType.IsGenericType && property.PropertyType.GetGenericTypeDefinition() == typeof(DbSet<>))
        .OrderBy(property => property.Name, StringComparer.Ordinal).ToArray();
    private static readonly IReadOnlyDictionary<string,Type> identityTypes=sets.Select(p=>p.PropertyType.GetGenericArguments()[0]).Distinct().ToDictionary(EntityId);
    public static string EntityId(Type type) => $"ef.{(type.FullName ?? type.Name).Replace('+', '.')}@1";
    public static string NodeId(string collection) => "Backend.EF.Source";
    public static EfNodeBinding Binding(string collection)
    {
        var property=typeof(TContext).GetProperty(collection);
        if(property is null||!property.PropertyType.IsGenericType||property.PropertyType.GetGenericTypeDefinition()!=typeof(DbSet<>))throw new InvalidOperationException("Unregistered DbSet.");
        return new(typeof(TContext).FullName!.Replace('+','.'),EntityId(property.PropertyType.GetGenericArguments()[0]),collection);
    }
    // CLR properties describe expression access; EF translation remains the provider's responsibility.
    // Do not resolve a context here: catalog requests are independent of execution scopes.
    // Context CLR metadata is stable. Build and validate it once per closed context
    // type; never retain a DbContext, execution scope or entity instance here.
    private static readonly Lazy<NodeRegistry> typeMetadata = new(() =>
    {
        var entities = sets.Select(property => property.PropertyType.GetGenericArguments()[0]).ToHashSet();
        var document = new TypeDocument(1, entities.OrderBy(EntityId, StringComparer.Ordinal)
            .Select(type => new EntityDefinition(EntityId(type), "entity", DescribeFields(type, entities))).ToArray());
        return new NodeRegistry(document);
    }, LazyThreadSafetyMode.ExecutionAndPublication);
    public TypeDocument Types => typeMetadata.Value.Types;
    private static Dictionary<string, TypeRef> DescribeFields(Type entity, HashSet<Type> entities)
    {
        var fields = new Dictionary<string, TypeRef>(StringComparer.Ordinal);
        var mappings = new NodeTypeMap();
        var nullability = new NullabilityInfoContext();
        foreach (var property in entity.GetProperties(BindingFlags.Instance | BindingFlags.Public)
            .Where(property => property.GetMethod?.IsPublic == true && property.GetIndexParameters().Length == 0 &&
                property.GetCustomAttribute<NotMappedAttribute>() is null).OrderBy(property => property.Name, StringComparer.Ordinal))
        {
            // Registered entity references remain native EF values; collections are separate query contracts.
            if(entities.Contains(property.PropertyType))
            {
                TypeRef reference=new("entity",Name:EntityId(property.PropertyType));
                if(nullability.Create(property).ReadState!=NullabilityState.NotNull)reference=new("nullable",Inner:reference);
                fields.Add(property.Name,reference);
                continue;
            }
            var valueType = Nullable.GetUnderlyingType(property.PropertyType) ?? property.PropertyType;
            if (valueType != typeof(string) && !valueType.IsValueType) continue;
            TypeRef contract;
            try { contract = mappings.Resolve(property.PropertyType).ContractType; }
            catch (InvalidOperationException) { continue; }
            var expressionType=contract.Kind=="nullable"?contract.Inner!:contract;
            if(expressionType.Kind is not ("scalar" or "string"))continue;
            if (!property.PropertyType.IsValueType && nullability.Create(property).ReadState != NullabilityState.NotNull)
                contract = new("nullable", Inner: contract);
            fields.Add(property.Name, contract);
        }
        return fields;
    }
    public bool EntitiesEqual(string type,object left,object right,Func<IServiceProvider> services)
    {
        if(!identityTypes.TryGetValue(type,out var clr))throw new InvalidOperationException("Unregistered entity identity: "+type);
        if(!clr.IsInstanceOfType(left)||!clr.IsInstanceOfType(right))throw new InvalidOperationException("Entity identity type mismatch.");
        if(ReferenceEquals(left,right))return true;
        var context=services().GetRequiredService<TContext>();
        // Entry() normally performs local change detection, which could visit navigation
        // properties. Identity comparison must only read keys and preserve tracking state.
        var detectChanges=context.ChangeTracker.AutoDetectChangesEnabled;
        context.ChangeTracker.AutoDetectChangesEnabled=false;
        try
        {
            var a=context.Entry(left);var b=context.Entry(right);
            if(a.Metadata!=b.Metadata)return false;
            var key=a.Metadata.FindPrimaryKey()??throw new InvalidOperationException("Entity equality requires a primary key.");
            foreach(var property in key.Properties)
            {
                var x=a.Property(property.Name);var y=b.Property(property.Name);
                var comparer=property.GetKeyValueComparer();
                // Unset and temporary keys never equate distinct new instances.
                if(x.IsTemporary||y.IsTemporary||x.CurrentValue is null||y.CurrentValue is null||
                    x.CurrentValue is string {Length:0}||y.CurrentValue is string {Length:0}||
                    comparer.Equals(x.CurrentValue,property.Sentinel)||comparer.Equals(y.CurrentValue,property.Sentinel)||
                    !comparer.Equals(x.CurrentValue,y.CurrentValue))return false;
            }
            return true;
        }
        finally { context.ChangeTracker.AutoDetectChangesEnabled=detectChanges; }
    }
    public uint EntityHash(string type,object value,Func<IServiceProvider> services)
    {
        if(!identityTypes.TryGetValue(type,out var clr)||!clr.IsInstanceOfType(value))throw new InvalidOperationException("Entity identity type mismatch.");
        var context=services().GetRequiredService<TContext>();
        var detectChanges=context.ChangeTracker.AutoDetectChangesEnabled;context.ChangeTracker.AutoDetectChangesEnabled=false;
        try
        {
            var entry=context.Entry(value);
            var key=entry.Metadata.FindPrimaryKey()??throw new InvalidOperationException("Entity equality requires a primary key.");
            var hash=2166136261u;
            foreach(var property in key.Properties)
            {
                var part=entry.Property(property.Name);var comparer=property.GetKeyValueComparer();
                if(part.IsTemporary||part.CurrentValue is null||part.CurrentValue is string {Length:0}||comparer.Equals(part.CurrentValue,property.Sentinel))
                    return unchecked((uint)System.Runtime.CompilerServices.RuntimeHelpers.GetHashCode(value));
                hash=unchecked((hash^(uint)comparer.GetHashCode(part.CurrentValue))*16777619u);
            }
            return hash;
        }
        finally {context.ChangeTracker.AutoDetectChangesEnabled=detectChanges;}
    }
    private string ContextName => typeof(TContext).FullName!.Replace('+','.');
    private NodeRegistry Implementations(Func<IServiceProvider> services,PropertyInfo? set)
    {
        var registry=typeMetadata.Value.ForkEmptyMetadata();
        EntityDataNodes.RegisterSave<TContext>(registry,services);
        if(set is not null)
        {
            var entity=set.PropertyType.GetGenericArguments()[0];
            GetType().GetMethod(nameof(RegisterSet),BindingFlags.NonPublic|BindingFlags.Instance)!.MakeGenericMethod(entity).Invoke(this,[registry,services,set.Name]);
            typeof(EntityDataNodes).GetMethod(nameof(EntityDataNodes.Register))!.MakeGenericMethod(typeof(TContext),entity).Invoke(null,[registry,services]);
        }
        return registry;
    }
    public RegisteredNode Create(FlowNode node,Func<IServiceProvider> services)
    {
        var binding=node.Ef??throw new InvalidOperationException("EF binding required.");
        if(binding.Context!=ContextName||node.Environment!="server"||node.TypeVersion!=1)throw new InvalidOperationException("Unknown EF context or runtime.");
        var set=sets.FirstOrDefault(p=>EntityId(p.PropertyType.GetGenericArguments()[0])==binding.Entity&&(binding.Collection is null||p.Name==binding.Collection));
        if(node.Type=="Backend.EF.SaveChanges")
        { if(binding.Entity is not null||binding.Collection is not null)throw new InvalidOperationException("SaveChanges only accepts a context."); }
        else if(set is null||(node.Type=="Backend.EF.Source"&&binding.Collection is null))throw new InvalidOperationException("Unregistered EF target.");
        var implementation=Implementations(services,set).Resolve(node.Type,1);
        return implementation with {Definition=implementation.Definition with {NodeId=node.Id,Ef=binding}};
    }
    public void Register(NodeRegistry nodes, Func<IServiceProvider> services)
    {
        var families=new Dictionary<string,List<(RegisteredNode Node,EfNodeBinding Binding)>>();
        foreach(var set in sets)
        {
            var registered=Implementations(services,set);nodes.CopyNativeMappings(registered);
            foreach(var definition in registered.Catalog.Nodes)
            {
                var binding=definition.Type=="Backend.EF.SaveChanges"?new EfNodeBinding(ContextName):new EfNodeBinding(ContextName,EntityId(set.PropertyType.GetGenericArguments()[0]),definition.Type=="Backend.EF.Source"?set.Name:null);
                if(!families.TryGetValue(definition.Type,out var entries))families[definition.Type]=entries=[];
                if(!entries.Any(entry=>entry.Binding==binding))entries.Add((registered.Resolve(definition.Type,1),binding));
            }
        }
        foreach(var (type,entries) in families)
        {
            var first=entries[0];
            nodes.Register(first.Node with {Definition=first.Node.Definition with {Ef=first.Binding,Metadata=first.Node.Definition.Metadata! with {Label=type.Split('.').Last(),EfTargets=entries.Select(e=>e.Binding).ToArray(),EfInputs=type=="Backend.EF.SetFields"?entries.ToDictionary(e=>e.Binding.Entity!,e=>e.Node.Definition.ToContract().Inputs):null}},Execute=_=>throw new InvalidOperationException("EF instance binding required."),ExecuteAsync=null});
        }
        var element=new TypeRef("string");
        foreach(var operation in QueryNodes.Operations)
        {
            var result=operation=="select"?element:operation=="groupBy"?new TypeRef("scalar",Name:"core.Integer"):null;
            var prototype=new FlowNode("prototype",NodeNames.Query(operation),1,"server",[],Query:new(operation,element,result));
            var implementation=new QueryableNodeFactory(nodes).Create(prototype);
            nodes.Register(implementation with {Definition=implementation.Definition with {NodeId=null,Query=null},Execute=_=>throw new InvalidOperationException("Query instance binding required."),ExecuteAsync=null,ValidateConfiguration=null});
        }
    }
    private void RegisterSet<TEntity>(NodeRegistry nodes, Func<IServiceProvider> services, string collection) where TEntity : class
    {
        var queryType = new TypeRef("queryable", Items: new("entity", Name: EntityId(typeof(TEntity))));
        var mappings = new NodeTypeMap().Add<IQueryable<TEntity>>(new($"IQueryable<{typeof(TEntity).Name}>", typeof(IQueryable<TEntity>), queryType));
        var registered = NodeAuthoring.Create(() => new ProvideQueryableNode<TEntity>(() => services().GetRequiredService<TContext>().Set<TEntity>()), mappings);
        nodes.Register(registered with { Definition = registered.Definition with {
            Type = NodeId(collection),
            Metadata = registered.Definition.Metadata! with {Label = collection, Category = $"Data/EF/{typeof(TContext).Name}", Description = $"IQueryable<{typeof(TEntity).Name}> · deferred query from {typeof(TContext).Name}.{collection}"}
        }});
    }
}
