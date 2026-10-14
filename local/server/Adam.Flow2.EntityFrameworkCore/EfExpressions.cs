using System.Linq.Expressions;
using System.Runtime.CompilerServices;
using Adam.Flow2.Runtime;
using Microsoft.EntityFrameworkCore;
namespace Adam.Flow2.EntityFrameworkCore;
public static class EfExpressions {
 [ModuleInitializer] public static void Register() => QueryExpressionProviders.Like = (text,pattern) => Expression.Call(typeof(DbFunctionsExtensions).GetMethod(nameof(DbFunctionsExtensions.Like),[typeof(DbFunctions),typeof(string),typeof(string)])!,Expression.Property(null,typeof(EF),nameof(EF.Functions)),text,pattern);
}
