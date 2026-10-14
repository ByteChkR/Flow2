# Numeric contract fixtures

`values.json` contains 917 fixed cases for Decimal, Int32, TimeSpan and
DateTimeOffset. Results and failure categories come from the native .NET adapter;
the browser evaluates the same inputs independently using BigInt arithmetic.
The set includes seeded samples and explicit range, rounding, cancellation-of-
signs, zero-divisor, exponent, offset and calendar boundaries.

To regenerate expected results after an intentional contract change:

```sh
dotnet run --project backend/tests/Flow2.ValueContracts.Tests -- \
  --write-numeric-fixtures "$PWD/Adam.Flow2/contracts/fixtures/numeric/values.json"
```

Run from the common Adam workspace root. Review changed expectations before
accepting a contract change. Normal test runs only read these fixtures.

## Semantics

- Decimal inputs and outputs use canonical decimal strings with at most 28
  fractional digits and a 96-bit unsigned magnitude plus sign. Browser operations
  never pass a Decimal through a JavaScript number.
- Add/subtract/multiply/divide follow .NET Decimal precision reduction with
  round-to-nearest, ties-to-even. Overflow and zero divisors fail; underflow may
  round to zero. Modulo keeps the dividend's sign.
- Explicit Round accepts digits 0–28 and `toEven` or `awayFromZero`. ToInt truncates
  toward zero before the checked Int32 conversion.
- Pow uses binary exponentiation with a checked, rounded result after each
  multiplication. A negative Decimal exponent first computes the rounded
  reciprocal, then raises it to the exponent's magnitude. No unused final square
  is computed. `0^0 = 1`; zero to a negative power fails. Integer exponents must
  be nonnegative. Both adapters accept the full Int32 exponent range.
- Int32 arithmetic is checked. Divide truncates toward zero; MinValue / -1 fails,
  while MinValue % -1 is explicitly defined as zero. Clamp rejects min > max.
- TimeSpan arithmetic uses checked signed Int64 ticks, not calendar units.
  DateTimeOffset addition preserves the supplied offset and checks both local
  and UTC ranges. Comparison uses UTC ticks, not local text or browser timezone.

Adapters are exposed as `DecimalMath`, `IntegerMath`, `TimeSpanMath` and
`DateTimeOffsetMath` in C#, and the corresponding camelCase exports in TypeScript.
Registering the graphical arithmetic nodes is a separate catalog work package.
