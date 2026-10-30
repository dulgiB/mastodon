// How long to keep the opened post in place while the thread around it loads
export const KEEP_IN_VIEW_DURATION = 5000;

// Any of these means the reader is scrolling or interacting on their own
const READER_INPUT_EVENTS = [
  'wheel',
  'touchstart',
  'pointerdown',
  'keydown',
] as const;

function scrollParentsOf(node: HTMLElement) {
  const parents: Element[] = [];

  for (let el = node.parentElement; el; el = el.parentElement) {
    const { overflowY } = getComputedStyle(el);

    if (overflowY === 'auto' || overflowY === 'scroll') {
      parents.push(el);
    }
  }

  parents.push(document.scrollingElement ?? document.documentElement);

  return parents;
}

/**
 * Scrolls `node` back into view whenever the content above it pushes it
 * away, until the reader scrolls or interacts with the page on their own,
 * or `KEEP_IN_VIEW_DURATION` has passed.
 * Returns a function that stops it early.
 */
export function keepInView(
  node: HTMLElement,
  scrollToPost: (node: HTMLElement) => void,
) {
  const scrollParents = scrollParentsOf(node);
  const scrollPositions = () =>
    scrollParents.map((el) => el.scrollTop).join(',');

  let expectedTop = node.getBoundingClientRect().top;
  let expectedScroll = scrollPositions();
  let frame = 0;

  const check = () => {
    // The post moving while the scroll position stays put means the layout
    // above it changed. The scroll position changing means someone else
    // scrolled -- the reader dragging a scrollbar, or the browser's own
    // scroll anchoring already correcting for the shift -- so leave it be.
    if (scrollPositions() !== expectedScroll) {
      stop();
      return;
    }

    if (Math.abs(node.getBoundingClientRect().top - expectedTop) >= 1) {
      scrollToPost(node);
      expectedTop = node.getBoundingClientRect().top;
      expectedScroll = scrollPositions();
    }

    frame = requestAnimationFrame(check);
  };

  const stop = () => {
    cancelAnimationFrame(frame);
    clearTimeout(timeout);
    READER_INPUT_EVENTS.forEach((type) => {
      window.removeEventListener(type, stop, true);
    });
  };

  READER_INPUT_EVENTS.forEach((type) => {
    window.addEventListener(type, stop, { capture: true, passive: true });
  });

  const timeout = setTimeout(stop, KEEP_IN_VIEW_DURATION);
  frame = requestAnimationFrame(check);

  return stop;
}
