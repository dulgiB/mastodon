import { createRef } from 'react';

import { render } from '@/testing/rendering';

import { NavigationFocusTarget } from '../index';

describe('NavigationFocusTarget', () => {
  it('passes the rendered element to a forwarded ref', () => {
    const ref = createRef<HTMLDivElement>();

    render(
      // The polymorphic ref type resolves to `never` for intrinsic elements
      // under React 18's types, so the ref has to be cast to be passed at all.
      <NavigationFocusTarget as='div' ref={ref as React.Ref<never>}>
        post
      </NavigationFocusTarget>,
    );

    expect(ref.current).toBeInstanceOf(HTMLDivElement);
    expect(ref.current?.textContent).toBe('post');
  });
});
