import { createIntl, IntlProvider } from 'react-intl';

import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { EpisodePicker } from '../episode_picker';

const noop = () => {};
const intl = createIntl({ locale: 'en', onError: noop });

const main = { id: 'g1', title: 'Main', position: 0 };
const side = { id: 'g2', title: 'Side', position: 1 };

// Chronological, with the interlude between the main episodes.
const archives = [
  { id: '1', title: 'Main 1', group: main },
  { id: '2', title: 'Side 1', group: side },
  { id: '3', title: 'Main 2', group: main },
];

const renderPicker = (props = {}) => {
  const onSelect = vi.fn();

  render(
    <IntlProvider locale='en' onError={noop}>
    <EpisodePicker
      intl={intl}
      archives={archives}
      currentId='1'
      order='asc'
      onSelect={onSelect}
      onToggleOrder={vi.fn()}
      {...props}
    />
    </IntlProvider>,
  );

  return { onSelect };
};

const optionLabels = () => screen.getAllByRole('option').map(option => option.textContent);
const chip = title => screen.getByRole('button', { name: title });

describe('<EpisodePicker />', () => {
  it('starts with no group selected, listing every episode', () => {
    renderPicker();

    expect(chip('Main').getAttribute('aria-pressed')).toBe('false');
    expect(chip('Side').getAttribute('aria-pressed')).toBe('false');
    expect(optionLabels()).toEqual(['Main 1', 'Side 1', 'Main 2']);
  });

  it('lists only the episodes of the selected groups, in time order', () => {
    renderPicker();

    fireEvent.click(chip('Main'));
    expect(optionLabels()).toEqual(['Main 1', 'Main 2']);

    fireEvent.click(chip('Side'));
    expect(optionLabels()).toEqual(['Main 1', 'Side 1', 'Main 2']);
  });

  it('lists every episode again once the last group is deselected', () => {
    renderPicker();

    fireEvent.click(chip('Main'));
    fireEvent.click(chip('Main'));

    expect(chip('Main').getAttribute('aria-pressed')).toBe('false');
    expect(optionLabels()).toEqual(['Main 1', 'Side 1', 'Main 2']);
  });

  it('steps only through the listed episodes', () => {
    const { onSelect } = renderPicker();

    fireEvent.click(screen.getByTitle('Next episode'));
    expect(onSelect).toHaveBeenLastCalledWith('2', { preserveSearch: true });

    fireEvent.click(chip('Main'));
    fireEvent.click(screen.getByTitle('Next episode'));
    expect(onSelect).toHaveBeenLastCalledWith('3', { preserveSearch: true });
  });

  it('switches to the latest listed episode when the open one’s group is deselected', () => {
    const { onSelect } = renderPicker({ currentId: '3' });

    fireEvent.click(chip('Main'));
    fireEvent.click(chip('Side'));
    expect(onSelect).not.toHaveBeenCalled();

    fireEvent.click(chip('Main'));
    expect(onSelect).toHaveBeenLastCalledWith('2');
  });

  it('switches when the selected groups leave the open episode out', () => {
    const { onSelect } = renderPicker({ currentId: '1' });

    fireEvent.click(chip('Side'));
    expect(onSelect).toHaveBeenLastCalledWith('2');
  });

  it('stays on the open episode when the last group is deselected', () => {
    const { onSelect } = renderPicker({ currentId: '1' });

    fireEvent.click(chip('Main'));
    fireEvent.click(chip('Main'));
    expect(onSelect).not.toHaveBeenCalled();
  });
});
