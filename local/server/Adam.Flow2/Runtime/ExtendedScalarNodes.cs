using Adam.Flow2.Contracts;

namespace Adam.Flow2.Runtime;

/// <summary>Small value operations, with matching browser implementations.</summary>
public static class ExtendedScalarNodes
{
    public static void Register(NodeRegistry nodes)
    {
        TemporalNodes.Register(nodes);
        AssertNode.Register(nodes);
        var map = new NodeTypeMap();
        void Add<T>(string id, string label, Dictionary<string, PortType> inputs, Func<IReadOnlyDictionary<string, object>, T> run, string description)
            => nodes.Register(new(new(id, 1, inputs, new Dictionary<string,PortType>() { ["value"] = map.Resolve(typeof(T)) },
                new(Label: label, Category: id.StartsWith("Standard.Date.") ? "Date" : "Math", Description: description)),
                values => new Dictionary<string, object> { ["value"] = run(values)! }));
        void Numbers<T>(string kind, Func<T,T> abs, Func<T,T,T> min, Func<T,T,T> max,
            Func<T,T,T> modulo, Func<T,int,T> power, Func<T,T,T,T> clamp)
        {
            var number = map.Resolve(typeof(T));
            Dictionary<string,PortType> Binary() => new() { ["left"] = number, ["right"] = number };
            Add($"Standard.Math.{(kind=="integer"?"Integer":"Decimal")}.Abs", $"Abs ({kind})", new() { ["value"] = number }, v => abs((T)v["value"]), "Absolutwert berechnen. Ein Überlauf bricht die Ausführung ab.");
            Add($"Standard.Math.{(kind=="integer"?"Integer":"Decimal")}.Min", $"Min ({kind})", Binary(), v => min((T)v["left"], (T)v["right"]), "Minimum zweier Werte.");
            Add($"Standard.Math.{(kind=="integer"?"Integer":"Decimal")}.Max", $"Max ({kind})", Binary(), v => max((T)v["left"], (T)v["right"]), "Maximum zweier Werte.");
            Add($"Standard.Math.{(kind=="integer"?"Integer":"Decimal")}.Modulo", $"Modulo ({kind})", Binary(), v => modulo((T)v["left"], (T)v["right"]), "Divisionsrest mit Vorzeichen des linken Werts. Der Divisor darf nicht null sein.");
            Add($"Standard.Math.{(kind=="integer"?"Integer":"Decimal")}.Power", $"Power ({kind})", new() { ["value"] = number, ["exponent"] = map.Resolve(typeof(int)) }, v => power((T)v["value"], (int)v["exponent"]),
                kind == "integer" ? "Potenz mit nichtnegativem Integer-Exponenten und Überlaufprüfung." : "Potenz mit Integer-Exponent. Negative Exponenten berechnen zuerst den Kehrwert.");
            Add($"Standard.Math.{(kind=="integer"?"Integer":"Decimal")}.Clamp", $"Clamp ({kind})", new() { ["value"] = number, ["min"] = number, ["max"] = number }, v => clamp((T)v["value"], (T)v["min"], (T)v["max"]), "Begrenzt den Wert auf min bis max. min darf max nicht überschreiten.");
        }
        Numbers<int>("integer", Math.Abs, IntegerMath.Min, IntegerMath.Max, IntegerMath.Modulo, IntegerMath.Pow, IntegerMath.Clamp);
        Numbers<decimal>("decimal", Math.Abs, DecimalMath.Min, DecimalMath.Max, DecimalMath.Modulo, DecimalMath.Pow, DecimalMath.Clamp);
        foreach (var unit in new[] { "Months", "Years" })
            Add($"Standard.Date.Add{unit}", $"Add {unit}", new() { ["value"] = map.Resolve(typeof(DateTimeOffset)), ["amount"] = map.Resolve(typeof(int)) },
                v => unit == "Months" ? ((DateTimeOffset)v["value"]).AddMonths((int)v["amount"]) : ((DateTimeOffset)v["value"]).AddYears((int)v["amount"]),
                "Verschiebt ein Datum um Kalendermonate oder -jahre. Kürzt den Tag bei kürzeren Monaten und erhält Uhrzeit, Präzision und UTC-Offset.");
    }
}
