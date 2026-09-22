import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type * as StaleBundle from './stale_bundle';

const RELOAD_MARKER = 'mastodon_stale_bundle_reload_at';

// The module keeps a flag of its own so that however many bundles fail only one
// reload is ever asked for, so each test needs a fresh copy of it.
let subject: typeof StaleBundle;
let reload: ReturnType<typeof vi.fn>;
let originalLocation: Location;

beforeEach(async () => {
  vi.resetModules();
  sessionStorage.clear();

  reload = vi.fn();
  originalLocation = window.location;
  Object.defineProperty(window, 'location', {
    configurable: true,
    value: { href: originalLocation.href, reload },
  });

  subject = await import('./stale_bundle');
});

afterEach(() => {
  Object.defineProperty(window, 'location', {
    configurable: true,
    value: originalLocation,
  });
  vi.restoreAllMocks();
});

const missingChunkError = () =>
  new TypeError(
    'Failed to fetch dynamically imported module: https://example.com/packs/archive_timeline-B6WNcbwP.js',
  );

describe('isModuleLoadError', () => {
  it.each([
    'Failed to fetch dynamically imported module: https://example.com/packs/a.js',
    'error loading dynamically imported module: https://example.com/packs/a.js',
    'Importing a module script failed.',
    'Failed to load module script: Expected a JavaScript module script but the server responded with a MIME type of "text/html".',
    'Unable to preload CSS for /packs/assets/archive_timeline-DcfjHi2n.css',
  ])('recognises %s', (message) => {
    expect(subject.isModuleLoadError(new Error(message))).toBe(true);
  });

  it('leaves an error thrown by the component itself alone', () => {
    expect(
      subject.isModuleLoadError(new TypeError('x is not a function')),
    ).toBe(false);
  });

  it('tolerates something that is not an error at all', () => {
    expect(subject.isModuleLoadError('nope')).toBe(false);
  });
});

describe('reloadForStaleBundle', () => {
  it('reloads for a chunk the deploy took away', () => {
    expect(subject.reloadForStaleBundle(missingChunkError())).toBe(true);
    expect(reload).toHaveBeenCalledOnce();
  });

  it('does not reload for an error from the component itself', () => {
    expect(
      subject.reloadForStaleBundle(new TypeError('x is not a function')),
    ).toBe(false);
    expect(reload).not.toHaveBeenCalled();
  });

  it('only asks for one reload however many bundles fail', () => {
    subject.reloadForStaleBundle(missingChunkError());
    subject.reloadForStaleBundle(missingChunkError());

    expect(reload).toHaveBeenCalledOnce();
  });

  it('leaves the page alone when a reload has just been tried', () => {
    sessionStorage.setItem(RELOAD_MARKER, Date.now().toString());

    expect(subject.reloadForStaleBundle(missingChunkError())).toBe(false);
    expect(reload).not.toHaveBeenCalled();
  });

  it('reloads again once the cooldown has passed', () => {
    sessionStorage.setItem(
      RELOAD_MARKER,
      (Date.now() - 11 * 60 * 1000).toString(),
    );

    expect(subject.reloadForStaleBundle(missingChunkError())).toBe(true);
    expect(reload).toHaveBeenCalledOnce();
  });

  it('leaves an offline browser on the page it has', () => {
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false);

    expect(subject.reloadForStaleBundle(missingChunkError())).toBe(false);
    expect(reload).not.toHaveBeenCalled();
  });

  it('does not reload when it cannot remember having done so', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('denied', 'SecurityError');
    });

    expect(subject.reloadForStaleBundle(missingChunkError())).toBe(false);
    expect(reload).not.toHaveBeenCalled();
  });
});
