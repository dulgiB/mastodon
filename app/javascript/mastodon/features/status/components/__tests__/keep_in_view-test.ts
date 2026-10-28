import { KEEP_IN_VIEW_DURATION, keepInView } from '../keep_in_view';

const FRAME = 16;

function setup() {
  const node = document.createElement('div');
  document.body.appendChild(node);

  let top = 100;
  vi.spyOn(node, 'getBoundingClientRect').mockImplementation(
    () => ({ top }) as DOMRect,
  );

  const scrollingElement =
    document.scrollingElement ?? document.documentElement;
  const scrollToPost = vi.fn(() => {
    top = 100;
  });

  return {
    node,
    scrollToPost,
    movePost: (to: number) => {
      top = to;
    },
    scrollBy: (y: number) => {
      scrollingElement.scrollTop += y;
    },
  };
}

describe('keepInView', () => {
  beforeEach(() => {
    vi.useFakeTimers({
      toFake: [
        'setTimeout',
        'clearTimeout',
        'requestAnimationFrame',
        'cancelAnimationFrame',
      ],
    });
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    document.body.innerHTML = '';
    (document.scrollingElement ?? document.documentElement).scrollTop = 0;
  });

  it('scrolls the post back when the content above it pushes it away', () => {
    const { node, scrollToPost, movePost } = setup();
    keepInView(node, scrollToPost);

    vi.advanceTimersByTime(FRAME * 2);
    expect(scrollToPost).not.toHaveBeenCalled();

    movePost(400);
    vi.advanceTimersByTime(FRAME * 2);
    expect(scrollToPost).toHaveBeenCalledTimes(1);
  });

  it('stops once the scroll position changes on its own', () => {
    const { node, scrollToPost, movePost, scrollBy } = setup();
    keepInView(node, scrollToPost);

    scrollBy(50);
    movePost(50);
    vi.advanceTimersByTime(FRAME * 4);

    movePost(400);
    vi.advanceTimersByTime(FRAME * 4);
    expect(scrollToPost).not.toHaveBeenCalled();
  });

  it('stops when the reader interacts with the page', () => {
    const { node, scrollToPost, movePost } = setup();
    keepInView(node, scrollToPost);

    window.dispatchEvent(new Event('wheel'));
    movePost(400);
    vi.advanceTimersByTime(FRAME * 4);
    expect(scrollToPost).not.toHaveBeenCalled();
  });

  it('stops after the time limit', () => {
    const { node, scrollToPost, movePost } = setup();
    keepInView(node, scrollToPost);

    vi.advanceTimersByTime(KEEP_IN_VIEW_DURATION + FRAME);
    movePost(400);
    vi.advanceTimersByTime(FRAME * 4);
    expect(scrollToPost).not.toHaveBeenCalled();
  });

  it('stops when the returned function is called', () => {
    const { node, scrollToPost, movePost } = setup();
    const stop = keepInView(node, scrollToPost);

    stop();
    movePost(400);
    vi.advanceTimersByTime(FRAME * 4);
    expect(scrollToPost).not.toHaveBeenCalled();
  });
});
