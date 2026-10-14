using System.Numerics;
using Adam.Flow2.Contracts;
namespace Adam.Flow2.Runtime;
public static class TemporalNodes
{
 static readonly Dictionary<string,long> Units=new(StringComparer.Ordinal){{"ticks",1},{"microseconds",10},{"milliseconds",10000},{"seconds",10000000},{"minutes",600000000},{"hours",36000000000},{"days",864000000000}};
 static long UnitTicks(string unit)=>Units.TryGetValue(unit,out var ticks)?ticks:throw new ArgumentException("unit: Expected ticks, microseconds, milliseconds, seconds, minutes, hours or days.");
 public static TimeSpan FromUnits(decimal value,string unit)
 {
  var bits=decimal.GetBits(value);var coefficient=(BigInteger)(uint)bits[0]+((BigInteger)(uint)bits[1]<<32)+((BigInteger)(uint)bits[2]<<64);if((bits[3]&int.MinValue)!=0)coefficient=-coefficient;
  var ticks=BigInteger.DivRem(coefficient*UnitTicks(unit),BigInteger.Pow(10,(bits[3]>>16)&255),out var remainder);
  if(remainder!=0)throw new ArgumentException("value: Duration must be an exact multiple of 100 ns.");
  if(ticks<long.MinValue||ticks>long.MaxValue)throw new OverflowException("TimeSpan overflow.");return TimeSpan.FromTicks((long)ticks);
 }
 public static void Register(NodeRegistry nodes)
 {
  var map=new NodeTypeMap();var integer=map.Resolve(typeof(int));var date=map.Resolve(typeof(DateTimeOffset));var duration=map.Resolve(typeof(TimeSpan));var dec=map.Resolve(typeof(decimal));var text=map.Resolve(typeof(string));
  PortType Optional(PortType port)=>new("optional<"+port.Id+">",port.ClrType,new("optional",Inner:port.ContractType));
  void Add(string name,string label,Dictionary<string,PortType> inputs,Dictionary<string,PortType> outputs,Func<IReadOnlyDictionary<string,object>,IReadOnlyDictionary<string,object>> run,string description="Arbeitet mit dem festen UTC-Offset des Werts. Keine implizite lokale Zeitzone oder Sommerzeitumstellung; Präzision 100 ns.")=>nodes.Register(new(new(name,1,inputs,outputs,new(Label:label,Category:name.StartsWith("Standard.TimeSpan.")?"Date/TimeSpan":name.StartsWith("Standard.Date.")?"Date":"Values",Description:description)),run));
  Dictionary<string,object> Result(object value)=>new(){{"value",value}};
  Add("Standard.Date.Create","Create Date",new(){{"year",integer},{"month",integer},{"day",integer},{"hour",Optional(integer)},{"minute",Optional(integer)},{"second",Optional(integer)},{"fractionTicks",Optional(integer)},{"offsetMinutes",Optional(integer)}},new(){{"value",date}},v=>{
   int Part(string key)=>v.TryGetValue(key,out var value)?(int)value:0;
   try{var fraction=Part("fractionTicks");if(fraction<0||fraction>9999999)throw new ArgumentOutOfRangeException();return Result(new DateTimeOffset(Part("year"),Part("month"),Part("day"),Part("hour"),Part("minute"),Part("second"),TimeSpan.FromMinutes(Part("offsetMinutes"))).AddTicks(fraction));}catch(ArgumentException){throw new ArgumentException("Invalid date components.");}
  });
  var parts=new[]{"year","month","day","hour","minute","second","fractionTicks","offsetMinutes","dayOfWeek"};
  Add("Standard.Date.Parts","Date Parts",new(){{"value",date}},parts.ToDictionary(key=>key,_=>integer),v=>{var value=(DateTimeOffset)v["value"];return new Dictionary<string,object>{{"year",value.Year},{"month",value.Month},{"day",value.Day},{"hour",value.Hour},{"minute",value.Minute},{"second",value.Second},{"fractionTicks",(int)(value.Ticks%TimeSpan.TicksPerSecond)},{"offsetMinutes",(int)value.Offset.TotalMinutes},{"dayOfWeek",((int)value.DayOfWeek+6)%7+1}};});
  foreach(var part in new[]{"Day","Month"})Add("Standard.Date.StartOf"+part,"Start of "+part,new(){{"value",date}},new(){{"value",date}},v=>{var value=(DateTimeOffset)v["value"];try{return Result(new DateTimeOffset(value.Year,value.Month,part=="Day"?value.Day:1,0,0,0,value.Offset));}catch(ArgumentException){throw new OverflowException("DateTimeOffset overflow.");}});
  Add("Standard.Date.AddDays","Add Days",new(){{"value",date},{"amount",integer}},new(){{"value",date}},v=>{try{return Result(((DateTimeOffset)v["value"]).AddTicks(checked((long)(int)v["amount"]*TimeSpan.TicksPerDay)));}catch(Exception e) when(e is ArgumentException or OverflowException){throw new OverflowException("DateTimeOffset overflow.");}});
  Add("Standard.TimeSpan.FromUnits","Duration From Units",new(){{"value",dec},{"unit",text}},new(){{"value",duration}},v=>Result(FromUnits((decimal)v["value"],(string)v["unit"])),"Einheiten: ticks, microseconds, milliseconds, seconds, minutes, hours, days. Erfordert ein exaktes Vielfaches von 100 ns.");
  Add("Standard.TimeSpan.TotalUnits","Duration Total Units",new(){{"value",duration},{"unit",text}},new(){{"value",dec}},v=>Result((decimal)((TimeSpan)v["value"]).Ticks/UnitTicks((string)v["unit"])),"Gesamtdauer als Decimal; Rundung wie Decimal-Division. Einheit: ticks, microseconds, milliseconds, seconds, minutes, hours oder days.");
  Add("Standard.Values.NewGuid","New Guid",new(),new(){{"value",map.Resolve(typeof(Guid))}},_=>Result(Guid.NewGuid()),"Erzeugt bei jeder Ausführung eine neue zufällige Guid.");
 }
}
