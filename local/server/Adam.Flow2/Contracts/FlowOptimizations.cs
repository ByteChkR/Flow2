namespace Adam.Flow2.Contracts;

/// <summary>Process-scoped experimental switches. Never read from requests or persisted graphs.</summary>
public static class FlowOptimizations
{
    public static bool PlanCache { get; } = Read("PLAN_CACHE");
    public static bool ValidationReuse { get; } = Read("VALIDATION_REUSE");
    public static bool RegistryMetadata { get; } = Read("REGISTRY_METADATA");
    public static bool RegistrationFilter { get; } = Read("REGISTRATION_FILTER");
    public static bool RuntimeIndexes { get; } = Read("RUNTIME_INDEXES");
    public static bool ContractMetadataCache { get; } = Read("CONTRACT_METADATA_CACHE");
    public static bool FastContractValidation { get; } = Read("FAST_CONTRACT_VALIDATION");
    public static IReadOnlyDictionary<string,bool> Effective => new Dictionary<string,bool> {
        ["PLAN_CACHE"]=PlanCache,["VALIDATION_REUSE"]=ValidationReuse,["REGISTRY_METADATA"]=RegistryMetadata,
        ["REGISTRATION_FILTER"]=RegistrationFilter,["RUNTIME_INDEXES"]=RuntimeIndexes,
        ["CONTRACT_METADATA_CACHE"]=ContractMetadataCache,["FAST_CONTRACT_VALIDATION"]=FastContractValidation
    };
    private static bool Read(string name) => Environment.GetEnvironmentVariable("FLOW2_OPT_"+name)?.ToLowerInvariant() switch {
        null or "true" or "1" => true, "false" or "0" => false,
        _ => throw new InvalidOperationException("Invalid Flow2 optimization flag: "+name)
    };
}
