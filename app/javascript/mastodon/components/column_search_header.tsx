import { useCallback, useState, useRef } from 'react';

import { FormattedMessage } from 'react-intl';

export const ColumnSearchHeader: React.FC<{
  onBack: () => void;
  onSubmit: (value: string) => void;
  onActivate: () => void;
  // Fires on the form's actual submit (Enter in the input), distinct from
  // onSubmit above (which also fires on every keystroke) — for consumers
  // that want to tell "still typing" apart from "pressed Enter", the way a
  // browser's own find-in-page bar jumps to the next match on Enter.
  onEnter?: () => void;
  placeholder: string;
  active: boolean;
  inputClassName?: string;
  // Rendered inside the form, between the input and the Cancel button —
  // for controls that belong to the search box itself rather than below it
  // (e.g. the archive timeline's prev/next-match arrows and match count),
  // keeping the header a single row instead of growing another one.
  trailing?: React.ReactNode;
}> = ({
  onBack,
  onActivate,
  onSubmit,
  onEnter,
  placeholder,
  active,
  inputClassName,
  trailing,
}) => {
  const inputRef = useRef<HTMLInputElement>(null);
  const [value, setValue] = useState('');

  // Reset the component when it turns from active to inactive.
  // [More on this pattern](https://react.dev/learn/you-might-not-need-an-effect#adjusting-some-state-when-a-prop-changes)
  const [previousActive, setPreviousActive] = useState(active);
  if (active !== previousActive) {
    setPreviousActive(active);
    if (!active) {
      setValue('');
    }
  }

  const handleChange = useCallback(
    ({ target: { value } }: React.ChangeEvent<HTMLInputElement>) => {
      setValue(value);
      onSubmit(value);
    },
    [setValue, onSubmit],
  );

  const handleKeyUp = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onBack();
        inputRef.current?.blur();
      }
    },
    [onBack],
  );

  const handleFocus = useCallback(() => {
    onActivate();
  }, [onActivate]);

  const handleSubmit = useCallback(
    (e: React.FormEvent<HTMLFormElement>) => {
      // Without this, the browser performs its default (unprevented) form
      // submission, which navigates/reloads the page instead of letting
      // onEnter run.
      e.preventDefault();
      onSubmit(value);
      onEnter?.();
    },
    [onSubmit, onEnter, value],
  );

  return (
    <form className='column-search-header' onSubmit={handleSubmit}>
      <input
        ref={inputRef}
        type='search'
        className={inputClassName}
        value={value}
        onChange={handleChange}
        onKeyUp={handleKeyUp}
        placeholder={placeholder}
        onFocus={handleFocus}
      />

      {trailing}

      {active && (
        <button type='button' className='link-button' onClick={onBack}>
          <FormattedMessage id='column_search.cancel' defaultMessage='Cancel' />
        </button>
      )}
    </form>
  );
};
