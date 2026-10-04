import { useEffect, useState } from 'react';

import { animated, useSpring, config } from '@react-spring/web';

import { reduceMotion } from '../initial_state';

import { ShortNumber } from './short_number';

interface Props {
  value: number;
  // Keep the space a zero would take, so nothing moves when it turns into a
  // one, but leave it blank
  hideZero?: boolean;
}

const Digits: React.FC<{ value: number; hideZero: boolean }> = ({
  value,
  hideZero,
}) =>
  hideZero && value === 0 ? (
    <span style={{ visibility: 'hidden' }} aria-hidden='true'>
      <ShortNumber value={value} />
    </span>
  ) : (
    <ShortNumber value={value} />
  );

export const AnimatedNumber: React.FC<Props> = ({
  value,
  hideZero = false,
}) => {
  const [previousValue, setPreviousValue] = useState(value);
  const direction = value > previousValue ? -1 : 1;

  const [styles, api] = useSpring(
    () => ({
      from: { transform: `translateY(${100 * direction}%)` },
      to: { transform: 'translateY(0%)' },
      onRest() {
        setPreviousValue(value);
      },
      config: { ...config.gentle, duration: 200 },
      immediate: true, // This ensures that the animation is not played when the component is first rendered
    }),
    [value, previousValue],
  );

  // When the value changes, start the animation
  useEffect(() => {
    if (value !== previousValue) {
      void api.start({ reset: true });
    }
  }, [api, previousValue, value]);

  if (reduceMotion) {
    return <Digits value={value} hideZero={hideZero} />;
  }

  return (
    <span className='animated-number'>
      <animated.span style={styles}>
        <Digits value={value} hideZero={hideZero} />
      </animated.span>
      {value !== previousValue && (
        <animated.span
          style={{
            ...styles,
            position: 'absolute',
            top: `${-100 * direction}%`, // Adds extra space on top of translateY
          }}
          role='presentation'
        >
          <Digits value={previousValue} hideZero={hideZero} />
        </animated.span>
      )}
    </span>
  );
};
