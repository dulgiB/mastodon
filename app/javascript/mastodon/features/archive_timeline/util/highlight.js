// Highlights every occurrence of `query` inside the status content text
// rendered under `root` (mirroring a browser's own find-in-page), so a
// search match can be shown in its normal place in the timeline —
// surrounded by its non-matching context — rather than the timeline being
// filtered down to matches only.
//
// Uses the CSS Custom Highlight API (Range objects registered in
// CSS.highlights, painted via ::highlight() in CSS) rather than inserting
// <mark> elements into the DOM: status content here is rendered as real
// React elements (see EmojiHTML/htmlStringToComponents), not raw HTML via
// dangerouslySetInnerHTML, so React actively reconciles this subtree —
// splicing extra nodes into it directly would fight the reconciler and
// risks it throwing on a later re-render. A Highlight's Ranges only
// reference existing text nodes; they never touch the DOM's structure, so
// there's nothing for React to trip over. Ranges pointing at text nodes
// React later discards (e.g. on an unrelated re-render of that status)
// simply stop drawing anything — harmless, and corrected on the next call.
const HIGHLIGHT_NAME = 'archive-timeline-match';
const CONTENT_SELECTOR = '.status__content__text';

const supported = typeof CSS !== 'undefined' && 'highlights' in CSS && typeof Highlight !== 'undefined';

const clear = () => {
  if (supported) {
    CSS.highlights.delete(HIGHLIGHT_NAME);
  }
};

// Applies (or clears, if `root` is falsy or `query` is blank/too short)
// highlighting to every status content element found under `root`.
export function applyHighlight (root, query) {
  if (!supported) {
    return;
  }

  const normalizedQuery = query ? query.trim().toLowerCase() : '';

  if (!root || normalizedQuery.length < 2) {
    clear();
    return;
  }

  const ranges = [];

  root.querySelectorAll(CONTENT_SELECTOR).forEach(contentEl => {
    // Status content is split across several sibling text nodes wherever a
    // mention/hashtag/link got interpolated as its own element, so a query
    // spanning one of those boundaries wouldn't be found by searching each
    // node's text in isolation. Search the content's full concatenated text
    // instead, then map each match back onto the (possibly several) text
    // nodes it actually spans.
    const walker = document.createTreeWalker(contentEl, NodeFilter.SHOW_TEXT);
    const segments = [];
    let fullText = '';
    let node = walker.nextNode();

    while (node) {
      segments.push({ node, start: fullText.length, length: node.textContent.length });
      fullText += node.textContent;
      node = walker.nextNode();
    }

    const lowerText = fullText.toLowerCase();
    let cursor = 0;
    let index = lowerText.indexOf(normalizedQuery, cursor);

    while (index !== -1) {
      const matchEnd = index + normalizedQuery.length;

      segments.forEach(({ node: segmentNode, start, length }) => {
        const overlapStart = Math.max(index, start);
        const overlapEnd = Math.min(matchEnd, start + length);

        if (overlapStart >= overlapEnd) {
          return;
        }

        const range = new Range();
        range.setStart(segmentNode, overlapStart - start);
        range.setEnd(segmentNode, overlapEnd - start);
        ranges.push(range);
      });

      cursor = matchEnd;
      index = lowerText.indexOf(normalizedQuery, cursor);
    }
  });

  if (ranges.length === 0) {
    clear();
  } else {
    CSS.highlights.set(HIGHLIGHT_NAME, new Highlight(...ranges));
  }
}

export function clearHighlight () {
  clear();
}
