using System.Reflection;
using System.Reflection.Emit;
using System.Text.RegularExpressions;
using System.Text.Json.Serialization;
using Adam.Flow2.Contracts;

namespace Adam.Flow2.Runtime;

/// <summary>Structural DTO types owned by a query compilation scope, collectible with that scope.</summary>
public sealed class ProjectionTypes
{
    private readonly Dictionary<string, (TypeRef Contract, Type Clr)> cache = new(StringComparer.Ordinal);
    private readonly object gate = new();
    private ModuleBuilder? module;
    public static bool ValidField(string name) => Regex.IsMatch(name, "^[A-Za-z_][A-Za-z0-9_]{0,63}$", RegexOptions.CultureInvariant);
    public Type Resolve(TypeRef contract, Func<TypeRef, Type> resolve)
    {
        if (contract.Kind != "object" || contract.Fields is null || contract.Fields.Count is 0 or > 64 || contract.Fields.Keys.Any(name => !ValidField(name)))
            throw new InvalidOperationException("Projection requires 1–64 uniquely named identifier fields.");
        lock (gate)
        {
            var identity = GraphNodes.CodecIdentity(contract, "Projection_");
            if (cache.TryGetValue(identity, out var existing))
            {
                if (!TransportContracts.Equivalent(existing.Contract, contract)) throw new InvalidOperationException("Projection identity collision.");
                return existing.Clr;
            }
            if (cache.Count >= 512) throw new InvalidOperationException("Too many projection shapes in this compilation scope.");
            var fields = contract.Fields.OrderBy(pair => pair.Key, StringComparer.Ordinal).Select(pair => (pair.Key, Type: resolve(pair.Value))).ToArray();
            module ??= AssemblyBuilder.DefineDynamicAssembly(new AssemblyName("Adam.Flow2.Projections." + Guid.NewGuid().ToString("N")), AssemblyBuilderAccess.RunAndCollect).DefineDynamicModule("Projections");
            var builder = module.DefineType(identity, TypeAttributes.Public | TypeAttributes.Sealed | TypeAttributes.Class);
            builder.DefineDefaultConstructor(MethodAttributes.Public);
            foreach (var (name, type) in fields)
            {
                var field = builder.DefineField("_" + name, type, FieldAttributes.Private);
                var property = builder.DefineProperty(name, PropertyAttributes.None, type, null);
                property.SetCustomAttribute(new CustomAttributeBuilder(typeof(JsonPropertyNameAttribute).GetConstructor([typeof(string)])!, [name]));
                var attributes = MethodAttributes.Public | MethodAttributes.SpecialName | MethodAttributes.HideBySig;
                var getter = builder.DefineMethod("get_" + name, attributes, type, Type.EmptyTypes);
                var il = getter.GetILGenerator(); il.Emit(OpCodes.Ldarg_0); il.Emit(OpCodes.Ldfld, field); il.Emit(OpCodes.Ret);
                var setter = builder.DefineMethod("set_" + name, attributes, null, [type]);
                il = setter.GetILGenerator(); il.Emit(OpCodes.Ldarg_0); il.Emit(OpCodes.Ldarg_1); il.Emit(OpCodes.Stfld, field); il.Emit(OpCodes.Ret);
                property.SetGetMethod(getter); property.SetSetMethod(setter);
            }
            var result = builder.CreateType()!;
            cache.Add(identity, (contract, result));
            return result;
        }
    }
}
