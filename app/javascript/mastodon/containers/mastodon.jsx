import { PureComponent } from 'react';

import { Helmet } from '@unhead/react/helmet';
import { Route } from 'react-router-dom';

import { Provider as ReduxProvider } from 'react-redux';

import { hydrateStore } from 'mastodon/actions/store';
import { connectDirectStream, connectUserStream } from 'mastodon/actions/streaming';
import ErrorBoundary from 'mastodon/components/error_boundary';
import { FocusTargetProvider } from '@/mastodon/components/navigation_focus_target';
import { Router } from 'mastodon/components/router';
import UI from 'mastodon/features/ui';
import { IdentityContext, createIdentityContext } from 'mastodon/identity_context';
import { initialState, title as siteTitle } from 'mastodon/initial_state';
import { IntlProvider } from 'mastodon/locales';
import { store } from 'mastodon/store';
import { isProduction } from 'mastodon/utils/environment';
import { BodyScrollLock } from 'mastodon/features/ui/components/body_scroll_lock';

import { ScrollContext } from './scroll_container/scroll_context';

const title = isProduction() ? siteTitle : `${siteTitle} (Dev)`;

const hydrateAction = hydrateStore(initialState);

store.dispatch(hydrateAction);

export default class Mastodon extends PureComponent {
  identity = createIdentityContext(initialState);

  componentDidMount() {
    if (this.identity.signedIn) {
      this.disconnect = store.dispatch(connectUserStream());

      // Connected here (once, for the whole session) rather than from the
      // direct-message thread view itself: tying it to that route
      // component's mount/update lifecycle meant every unrelated store
      // update while a thread was open could re-run the connect/disconnect
      // logic, and connecting can itself synchronously dispatch further
      // actions — the two together produced a rapid subscribe/unsubscribe
      // loop on the streaming server instead of a single stable
      // connection, so messages arriving during a "disconnected" sliver
      // never rendered live. Matching connectUserStream's always-on
      // pattern here sidesteps that whole class of problem.
      this.disconnectDirectStream = store.dispatch(connectDirectStream());
    }
  }

  componentWillUnmount () {
    if (this.disconnect) {
      this.disconnect();
      this.disconnect = null;
    }

    if (this.disconnectDirectStream) {
      this.disconnectDirectStream();
      this.disconnectDirectStream = null;
    }
  }

  render () {
    return (
      <IdentityContext.Provider value={this.identity}>
        <IntlProvider>
          <ReduxProvider store={store}>
            <ErrorBoundary>
              <Router>
                <ScrollContext>
                  <FocusTargetProvider>
                    <Route path='/' component={UI} />
                  </FocusTargetProvider>
                </ScrollContext>
                <BodyScrollLock />
              </Router>

              <Helmet defaultTitle={title} titleTemplate={`%s - ${title}`} />
            </ErrorBoundary>
          </ReduxProvider>
        </IntlProvider>
      </IdentityContext.Provider>
    );
  }

}
