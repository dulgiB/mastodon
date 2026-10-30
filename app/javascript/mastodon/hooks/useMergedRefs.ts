import { useCallback } from 'react';

/**
 * Combines several refs into one ref callback, so an element can be handed
 * to more than one owner (for example a component's own ref and the one its
 * caller forwarded).
 *
 * The callback only changes when one of the refs does, so stable refs give a
 * stable callback and React does not detach and re-attach it on every render.
 */
export function useMergedRefs<T>(...refs: (React.Ref<T> | undefined)[]) {
  return useCallback(
    (node: T | null) => {
      for (const ref of refs) {
        if (typeof ref === 'function') {
          ref(node);
        } else if (ref) {
          (ref as React.MutableRefObject<T | null>).current = node;
        }
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    refs,
  );
}
