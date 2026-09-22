// Every build gives its chunks new content-hashed filenames, and the previous
// build's files are gone the moment the container is replaced. A tab left open
// across a deploy — or restored from the back/forward cache — keeps asking for
// the filenames it was served before, so the first route whose chunk it had not
// already fetched fails to import and its column falls back to the network
// error. Retrying there asks for the same missing file forever; only a reload
// picks up the new HTML and, with it, the new filenames.
//
// So when a bundle fails to load the way a vanished file fails, reload once and
// let the fresh page carry on to the route the user asked for. Any unsent draft
// is still protected: a programmatic reload runs the beforeunload handler that
// the UI installs while composing, and the browser asks before leaving.

// Chrome, Firefox and Safari each word this differently, and a 404 handed back
// as an HTML error page trips the MIME check rather than the fetch. The last of
// these is Vite's own, for the stylesheet a chunk pulls in alongside itself,
// which goes missing in exactly the same way. Anything else — a component
// throwing as it evaluates, say — is a real error and is left to the error
// column.
const MODULE_LOAD_ERROR =
  /(dynamically imported module|importing a module script failed|failed to load module script|unable to preload css)/i;

const RELOAD_MARKER = 'mastodon_stale_bundle_reload_at';

// Long enough that a build which is broken for everyone settles into the error
// column instead of reloading on a loop, short enough that a tab living through
// a second deploy days later still recovers by itself.
const RELOAD_COOLDOWN = 10 * 60 * 1000;

let reloadRequested = false;

export function isModuleLoadError(error: unknown): boolean {
  return error instanceof Error && MODULE_LOAD_ERROR.test(error.message);
}

/**
 * Reloads the page if `error` looks like a bundle left behind by a deploy.
 * @returns whether a reload was started, in which case the caller should leave
 * the loading state alone rather than render an error the reload will discard.
 */
export function reloadForStaleBundle(error: unknown): boolean {
  if (reloadRequested || !isModuleLoadError(error)) {
    return false;
  }

  // Offline, the import fails the same way but a reload would replace the app
  // with the browser's own error page, which is worse than the error column.
  if (!navigator.onLine) {
    return false;
  }

  const now = Date.now();

  // Without session storage there is nothing to stop the reloaded page from
  // failing and reloading again, so leave it to the error column.
  try {
    const previous = Number(sessionStorage.getItem(RELOAD_MARKER));

    if (previous && now - previous < RELOAD_COOLDOWN) {
      return false;
    }

    sessionStorage.setItem(RELOAD_MARKER, now.toString());
  } catch {
    return false;
  }

  reloadRequested = true;
  window.location.reload();

  return true;
}
