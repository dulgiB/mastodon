import { IntlProvider } from 'react-intl';

import { render, screen } from '@testing-library/react';

import { ShortNumber } from '../short_number';

function renderShortNumber(value: number) {
  return render(
    <IntlProvider locale='en'>
      <ShortNumber value={value} />
    </IntlProvider>,
  );
}

// Whippy Edition always shows exact figures instead of abbreviating them
// (see the commented-out branches in `toShortNumber`), so these assert the
// locale-grouped exact number rather than a K/M abbreviation.
describe('ShortNumber Component', () => {
  it('does not abbreviate numbers under 1000', () => {
    renderShortNumber(999);
    expect(screen.getByText('999')).toBeDefined();
  });

  it('shows the exact figure for 1000', () => {
    renderShortNumber(1000);
    expect(screen.getByText('1,000')).toBeDefined();
  });

  it('shows the exact figure for 101000', () => {
    renderShortNumber(101000);
    expect(screen.getByText('101,000')).toBeDefined();
  });

  it('shows the exact figure for 999999', () => {
    renderShortNumber(999999);
    expect(screen.getByText('999,999')).toBeDefined();
  });

  it('shows the exact figure for 2999999', () => {
    renderShortNumber(2999999);
    expect(screen.getByText('2,999,999')).toBeDefined();
  });

  it('shows the exact figure for 9999999', () => {
    renderShortNumber(9999999);
    expect(screen.getByText('9,999,999')).toBeDefined();
  });
});
