import { createRef } from 'react';

import { render } from '@/testing/rendering';

import { NavigationFocusTarget } from '../index';

describe('NavigationFocusTarget', () => {
  it('passes the rendered element to a forwarded ref', () => {
    const ref = createRef<HTMLDivElement>();

    render(
      <NavigationFocusTarget as='div' ref={ref}>
        post
      </NavigationFocusTarget>,
    );

    expect(ref.current).toBeInstanceOf(HTMLDivElement);
    expect(ref.current?.textContent).toBe('post');
  });
});
