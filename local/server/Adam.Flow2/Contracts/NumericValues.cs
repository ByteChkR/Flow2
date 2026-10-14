namespace Adam.Flow2.Contracts;

/// <summary>Native .NET operations; shared fixtures define the browser adapter's observable results.</summary>
public static class DecimalMath
{
    public static decimal Add(decimal a,decimal b)=>a+b;
    public static decimal Subtract(decimal a,decimal b)=>a-b;
    public static decimal Multiply(decimal a,decimal b)=>a*b;
    public static decimal Divide(decimal a,decimal b)=>a/b;
    public static decimal Modulo(decimal a,decimal b)=>a%b;
    public static int Compare(decimal a,decimal b)=>Math.Sign(decimal.Compare(a,b));
    public static decimal Round(decimal value,int digits,string mode="toEven")=>decimal.Round(value,digits,mode switch
    {"toEven"=>MidpointRounding.ToEven,"awayFromZero"=>MidpointRounding.AwayFromZero,_=>throw new ArgumentOutOfRangeException(nameof(mode))});
    public static int ToInt(decimal value)=>checked((int)decimal.Truncate(value));
    // Reciprocal first for negative exponents; then binary exponentiation, rounding at each operation.
    public static decimal Pow(decimal value,int exponent)
    {
        long n=exponent;var factor=value;var result=1m;
        if(n<0){factor=1m/factor;n=-n;}
        while(n>0){if(n%2!=0)result*=factor;n/=2;if(n>0)factor*=factor;}
        return result;
    }
    public static decimal Min(decimal a,decimal b)=>Math.Min(a,b);
    public static decimal Max(decimal a,decimal b)=>Math.Max(a,b);
    public static decimal Clamp(decimal value,decimal min,decimal max)=>Math.Clamp(value,min,max);
}
public static class IntegerMath
{
    public static int Add(int a,int b)=>checked(a+b);
    public static int Subtract(int a,int b)=>checked(a-b);
    public static int Multiply(int a,int b)=>checked(a*b);
    public static int Divide(int a,int b)=>checked(a/b);
    public static int Modulo(int a,int b)=>a==int.MinValue&&b==-1?0:a%b;
    public static int Compare(int a,int b)=>Math.Sign(a.CompareTo(b));
    public static int Pow(int value,int exponent)
    {
        if(exponent<0)throw new ArgumentOutOfRangeException(nameof(exponent));
        var factor=value;var result=1;
        while(exponent>0){if(exponent%2!=0)result=checked(result*factor);exponent/=2;if(exponent>0)factor=checked(factor*factor);}
        return result;
    }
    public static int Min(int a,int b)=>Math.Min(a,b);
    public static int Max(int a,int b)=>Math.Max(a,b);
    public static int Clamp(int value,int min,int max)=>Math.Clamp(value,min,max);
}
