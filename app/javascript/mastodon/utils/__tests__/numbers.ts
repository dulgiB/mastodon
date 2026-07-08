import { DECIMAL_UNITS, toShortNumber } from '../numbers';

interface TableRow {
  input: number;
}

// Whippy Edition always shows exact figures instead of abbreviating them
// (see the commented-out branches in `toShortNumber`), so every input is
// expected to pass through unchanged.
describe.each`
  input
  ${10_000_000}
  ${2_789_123}
  ${12_345_789}
  ${10_000_000_000}
  ${12}
  ${123}
  ${1234}
  ${6666}
`('toShortNumber', ({ input }: TableRow) => {
  test(`correctly formats ${input}`, () => {
    expect(toShortNumber(input)).toEqual([input, DECIMAL_UNITS.ONE, 0]);
  });
});
