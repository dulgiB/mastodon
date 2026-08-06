import PropTypes from 'prop-types';

import { defineMessages } from 'react-intl';

import classNames from 'classnames';
import { Helmet } from '@unhead/react/helmet';
import { withRouter } from 'react-router-dom';
import { difference } from 'lodash';

import { createSelector } from '@reduxjs/toolkit';
import ImmutablePropTypes from 'react-immutable-proptypes';
import ImmutablePureComponent from 'react-immutable-pure-component';
import { connect } from 'react-redux';

import VisibilityIcon from '@/material-icons/400-24px/visibility.svg?react';
import VisibilityOffIcon from '@/material-icons/400-24px/visibility_off.svg?react';
import { Hotkeys }  from 'mastodon/components/hotkeys';
import { Icon }  from 'mastodon/components/icon';
import { injectIntl } from '@/mastodon/components/intl';
import { LoadingIndicator } from 'mastodon/components/loading_indicator';
import { ScrollContainer } from 'mastodon/containers/scroll_container';
import BundleColumnError from 'mastodon/features/ui/components/bundle_column_error';
import { identityContextPropShape, withIdentity } from 'mastodon/identity_context';
import { WithRouterPropTypes } from 'mastodon/utils/react_router';

import {
  unblockAccount,
  unmuteAccount,
} from '../../actions/accounts';
import { initBlockModal } from '../../actions/blocks';
import {
  replyCompose,
  mentionCompose,
  directCompose,
} from '../../actions/compose';
import { markConversationRead, findConversationIdForStatus } from '../../actions/conversations';
import {
  initDomainBlockModal,
  unblockDomain,
} from '../../actions/domain_blocks';
import {
  toggleFavourite,
  bookmark,
  unbookmark,
  toggleReblog,
  pin,
  unpin,
} from '../../actions/interactions';
import { submitMarkers } from '../../actions/markers';
import { openModal } from '../../actions/modal';
import { initMuteModal } from '../../actions/mutes';
import { markNotificationsAsRead } from '../../actions/notification_groups';
import { initReport } from '../../actions/reports';
import {
  fetchStatus,
  muteStatus,
  unmuteStatus,
  deleteStatus,
  editStatus,
  hideStatus,
  revealStatus,
  translateStatus,
  undoStatusTranslation,
} from '../../actions/statuses';
import { setStatusQuotePolicy } from '../../actions/statuses_typed';
import { connectDirectStream } from '../../actions/streaming';
import ColumnHeader from '../../components/column_header';
import { scrollBottom } from '../../scroll';
import { textForScreenReader, defaultMediaVisibility } from '../../components/status';
import { StatusQuoteManager } from '../../components/status_quoted';
import { compareId } from '../../compare_id';
import { deleteModal, me } from '../../initial_state';
import { makeGetStatus, makeGetPictureInPicture } from '../../selectors';
import { getAncestorsIds, getDescendantsIds } from 'mastodon/selectors/contexts';
import Column from '../ui/components/column';
import { attachFullscreenListener, detachFullscreenListener, isFullscreen } from '../ui/util/fullscreen';

import ActionBar from './components/action_bar';
import { DetailedStatus } from './components/detailed_status';
import { DmBubble } from './components/dm_bubble';
import { DmComposer } from './components/dm_composer';
import { RefreshController } from './components/refresh_controller';
import { ScrollToBottomButton } from './components/scroll_to_bottom_button';
import { TypingIndicator } from './components/typing_indicator';
import { quoteComposeById } from '@/mastodon/actions/compose_typed';
import { FOCUS_TARGET, NavigationFocusTarget } from '@/mastodon/components/navigation_focus_target';

const messages = defineMessages({
  revealAll: { id: 'status.show_more_all', defaultMessage: 'Show more for all' },
  hideAll: { id: 'status.show_less_all', defaultMessage: 'Show less for all' },
  statusTitleWithAttachments: { id: 'status.title.with_attachments', defaultMessage: '{user} posted {attachmentCount, plural, one {an attachment} other {# attachments}}' },
  detailedStatus: { id: 'status.detailed_status', defaultMessage: 'Detailed conversation view' },
});

const NO_IDS = [];

const makeMapStateToProps = () => {
  const getStatus = makeGetStatus();
  const getPictureInPicture = makeGetPictureInPicture();
  const getLatestStatus = makeGetStatus();

  // Memoized so it only recomputes (and returns a new array) when the
  // thread's participants might actually have changed, rather than on every
  // store update — mapStateToProps runs on every dispatch app-wide, and an
  // always-fresh array here made connect() see "changed" props every time,
  // forcing this whole page to re-render (and any effect keyed off its
  // props, like the direct-stream connection, to spuriously re-run) on
  // completely unrelated activity elsewhere in the app.
  const getParticipantAccountIds = createSelector(
    [
      (_state, statusId) => statusId,
      (_state, _statusId, ancestorsIds) => ancestorsIds,
      (_state, _statusId, _ancestorsIds, descendantsIds) => descendantsIds,
      (_state, _statusId, _ancestorsIds, _descendantsIds, conversationAccountIds) => conversationAccountIds,
      state => state.statuses,
    ],
    (statusId, ancestorsIds, descendantsIds, conversationAccountIds, statuses) => {
      const seen = new Set();

      [statusId, ...ancestorsIds, ...descendantsIds].forEach(id => {
        const accountId = statuses.getIn([id, 'account']);
        if (accountId && accountId !== me) {
          seen.add(accountId);
        }
      });

      // A brand-new conversation's other participant has, by definition,
      // never posted in it yet — deriving participants purely from message
      // authors above would then never recognize their typing signal for
      // their own first reply. The conversation's own account list (from
      // AccountConversation, keyed by the mention graph rather than by who
      // has actually posted) covers that gap.
      (conversationAccountIds ?? []).forEach(accountId => {
        if (accountId && accountId !== me) {
          seen.add(accountId);
        }
      });

      return Array.from(seen);
    },
  );

  const mapStateToProps = (state, props) => {
    const status = getStatus(state, { id: props.params.statusId, contextType: 'detailed' });

    let ancestorsIds   = NO_IDS;
    let descendantsIds = NO_IDS;

    let participantAccountIds = NO_IDS;
    let conversationId = null;
    let conversationUnread = false;
    let latestStatus = null;

    if (status) {
      ancestorsIds   = getAncestorsIds(state, status.get('in_reply_to_id'));
      descendantsIds = getDescendantsIds(state, status.get('id'));

      // For direct conversations, collect the other participants so the typing
      // indicator only reacts to people in this conversation.
      if (status.get('visibility') === 'direct') {
        // getAncestorsIds/getDescendantsIds walk the reply tree in pre-order
        // DFS: siblings under one parent are visited oldest-first, but the
        // whole subtree of the oldest sibling is drained before the next
        // sibling is visited at all. That can misorder a DM thread as soon
        // as a single message picks up more than one direct reply. Re-sort
        // the full set chronologically and re-split around the focused
        // status so a DM thread always reads top-to-bottom in time order.
        const sortedIds = [...ancestorsIds, ...descendantsIds].sort(compareId);
        ancestorsIds = sortedIds.filter(id => compareId(id, status.get('id')) < 0);
        descendantsIds = sortedIds.filter(id => compareId(id, status.get('id')) > 0);

        conversationId = findConversationIdForStatus(state, status.get('id'));

        let conversation = null;
        if (conversationId) {
          conversation = state.getIn(['conversations', 'items']).find(item => item.get('id') === conversationId);
          conversationUnread = conversation ? conversation.get('unread') : false;
        }

        participantAccountIds = getParticipantAccountIds(state, status.get('id'), ancestorsIds, descendantsIds, conversation?.get('accounts'));

        // Replies composed from this thread should always attach to the
        // thread's true latest message, not the status the page happened to
        // be opened on (which goes stale as soon as a new message arrives).
        const latestId = descendantsIds.length > 0 ? descendantsIds[descendantsIds.length - 1] : status.get('id');
        latestStatus = latestId === status.get('id') ? status : getLatestStatus(state, { id: latestId });
      }
    }

    return {
      isLoading: state.getIn(['statuses', props.params.statusId, 'isLoading']),
      status,
      ancestorsIds,
      descendantsIds,
      participantAccountIds,
      latestStatus,
      conversationId,
      conversationUnread,
      askReplyConfirmation: state.getIn(['compose', 'text']).trim().length !== 0,
      domain: state.getIn(['meta', 'domain']),
      pictureInPicture: getPictureInPicture(state, { id: props.params.statusId }),
      composeInReplyTo: state.getIn(['compose', 'in_reply_to']),
      composeIsSubmitting: state.getIn(['compose', 'is_submitting']),
    };
  };

  return mapStateToProps;
};

const truncate = (str, num) => {
  const arr = Array.from(str);
  if (arr.length > num) {
    return arr.slice(0, num).join('') + '…';
  } else {
    return str;
  }
};

const titleFromStatus = (intl, status) => {
  const displayName = status.getIn(['account', 'display_name']);
  const username = status.getIn(['account', 'username']);
  const user = displayName.trim().length === 0 ? username : displayName;
  const text = status.get('search_index');
  const attachmentCount = status.get('media_attachments').size;

  return text ? `${user}: "${truncate(text, 30)}"` : intl.formatMessage(messages.statusTitleWithAttachments, { user, attachmentCount });
};

class Status extends ImmutablePureComponent {
  static propTypes = {
    identity: identityContextPropShape,
    params: PropTypes.object.isRequired,
    dispatch: PropTypes.func.isRequired,
    status: ImmutablePropTypes.map,
    isLoading: PropTypes.bool,
    ancestorsIds: PropTypes.arrayOf(PropTypes.string).isRequired,
    descendantsIds: PropTypes.arrayOf(PropTypes.string).isRequired,
    participantAccountIds: PropTypes.arrayOf(PropTypes.string),
    conversationId: PropTypes.string,
    conversationUnread: PropTypes.bool,
    latestStatus: ImmutablePropTypes.map,
    composeInReplyTo: PropTypes.string,
    composeIsSubmitting: PropTypes.bool,
    intl: PropTypes.object.isRequired,
    askReplyConfirmation: PropTypes.bool,
    multiColumn: PropTypes.bool,
    domain: PropTypes.string.isRequired,
    pictureInPicture: ImmutablePropTypes.contains({
      inUse: PropTypes.bool,
      available: PropTypes.bool,
    }),
    ...WithRouterPropTypes
  };

  state = {
    fullscreen: false,
    showMedia: defaultMediaVisibility(this.props.status),
    loadedStatusId: undefined,
    /**
     * Holds the ids of newly added replies, excluding the initial load.
     * Used to highlight newly added replies in the UI
     */
    newRepliesIds: [],
    /** Whether the DM thread's scroll container is scrolled to the bottom. */
    isAtBottom: true,
    /** Count of new messages that arrived while scrolled away from the bottom. */
    newMessageCount: 0,
  };

  componentDidMount() {
    this.props.dispatch(fetchStatus(this.props.params.statusId, { forceFetch: true }));
    attachFullscreenListener(this.onFullScreenChange);
    // The container's own onScroll (below) only fires in multi-column
    // layout, where it's the actual overflow element — single-column
    // layout scrolls the page instead, so this is needed too.
    window.addEventListener('scroll', this.handleScroll);
  }

  handleToggleMediaVisibility = () => {
    this.setState({ showMedia: !this.state.showMedia });
  };

  handleFavouriteClick = (status) => {
    const { dispatch } = this.props;
    const { signedIn } = this.props.identity;

    if (signedIn) {
      dispatch(toggleFavourite(status.get('id')));
    } else {
      dispatch(openModal({
        modalType: 'INTERACTION',
        modalProps: {
          intent: 'favourite',
          accountId: status.getIn(['account', 'id']),
          url: status.get('uri'),
        },
      }));
    }
  };

  handlePin = (status) => {
    if (status.get('pinned')) {
      this.props.dispatch(unpin(status));
    } else {
      this.props.dispatch(pin(status));
    }
  };

  handleReplyClick = (status) => {
    const { askReplyConfirmation, dispatch } = this.props;
    const { signedIn } = this.props.identity;

    // In a DM thread, always reply to the true latest message rather than
    // whichever status this action happens to be bound to (the page's
    // focused status, which goes stale as soon as a new message arrives).
    const replyTarget = status.get('visibility') === 'direct' && this.props.latestStatus ? this.props.latestStatus : status;

    if (signedIn) {
      if (askReplyConfirmation) {
        dispatch(openModal({ modalType: 'CONFIRM_REPLY', modalProps: { status: replyTarget } }));
      } else {
        dispatch(replyCompose(replyTarget));
      }
    } else {
      dispatch(openModal({
        modalType: 'INTERACTION',
        modalProps: {
          intent: 'reply',
          accountId: replyTarget.getIn(['account', 'id']),
          url: replyTarget.get('uri'),
        },
      }));
    }
  };

  handleReblogClick = (status, e) => {
    const { dispatch } = this.props;
    const { signedIn } = this.props.identity;

    if (signedIn) {
      dispatch(toggleReblog(status.get('id'), e && e.shiftKey));
    } else {
      dispatch(openModal({
        modalType: 'INTERACTION',
        modalProps: {
          intent: 'reblog',
          accountId: status.getIn(['account', 'id']),
          url: status.get('uri'),
        },
      }));
    }
  };

  handleBookmarkClick = (status) => {
    if (status.get('bookmarked')) {
      this.props.dispatch(unbookmark(status));
    } else {
      this.props.dispatch(bookmark(status));
    }
  };

  handleDeleteClick = (status, withRedraft = false) => {
    const { dispatch, history } = this.props;

    const handleDeleteSuccess = () => {
      history.push('/', {
        // Preventing the default "scroll to right" on
        // location change in advanced UI to avoid conflict
        // with the composer being focused
        preventMultiColumnAutoScroll: true
      });
    };

    if (!deleteModal) {
      dispatch(deleteStatus(status.get('id'), withRedraft))
        .then(() => {
          if (!withRedraft) {
            handleDeleteSuccess();
          }
        })
        .catch(() => {
          // Error handling - could show error message
        });
    } else {
      dispatch(openModal({
        modalType: 'CONFIRM_DELETE_STATUS',
        modalProps: {
          statusId: status.get('id'),
          withRedraft,
          onDeleteSuccess: handleDeleteSuccess
        }
      }));
    }
  };

  handleRevokeQuoteClick = (status) => {
    const { dispatch } = this.props;

    dispatch(openModal({ modalType: 'CONFIRM_REVOKE_QUOTE', modalProps: { statusId: status.get('id'), quotedStatusId: status.getIn(['quote', 'quoted_status']) }}));
  };

  handleQuotePolicyChange = (status) => {
    const statusId = status.get('id');
    const { dispatch } = this.props;
    const handleChange = (_, quotePolicy) => {
      dispatch(
        setStatusQuotePolicy({ policy: quotePolicy, statusId }),
      );
    }
    dispatch(openModal({ modalType: 'COMPOSE_PRIVACY', modalProps: { statusId, onChange: handleChange } }));
  };

  handleQuote = (status) => {
    const { dispatch } = this.props;

    dispatch(quoteComposeById(status.get('id')));
  };

  handleEditClick = (status) => {
    const { dispatch, askReplyConfirmation } = this.props;

    if (askReplyConfirmation) {
      dispatch(openModal({ modalType: 'CONFIRM_EDIT_STATUS', modalProps: { statusId: status.get('id') } }));
    } else {
      dispatch(editStatus(status.get('id')));
    }
  };

  handleDirectClick = (account) => {
    this.props.dispatch(directCompose(account));
  };

  handleMentionClick = (account) => {
    this.props.dispatch(mentionCompose(account));
  };

  handleOpenMedia = (media, index, lang) => {
    this.props.dispatch(openModal({
      modalType: 'MEDIA',
      modalProps: { statusId: this.props.status.get('id'), media, index, lang },
    }));
  };

  handleOpenVideo = (media, lang, options) => {
    this.props.dispatch(openModal({
      modalType: 'VIDEO',
      modalProps: { statusId: this.props.status.get('id'), media, lang, options },
    }));
  };

  handleHotkeyOpenMedia = e => {
    const { status } = this.props;

    e.preventDefault();

    if (status.get('media_attachments').size > 0) {
      if (status.getIn(['media_attachments', 0, 'type']) === 'video') {
        this.handleOpenVideo(status.getIn(['media_attachments', 0]), { startTime: 0 });
      } else {
        this.handleOpenMedia(status.get('media_attachments'), 0);
      }
    }
  };

  handleMuteClick = (account) => {
    this.props.dispatch(initMuteModal(account));
  };

  handleConversationMuteClick = (status) => {
    if (status.get('muted')) {
      this.props.dispatch(unmuteStatus(status.get('id')));
    } else {
      this.props.dispatch(muteStatus(status.get('id')));
    }
  };

  handleToggleHidden = (status) => {
    if (status.get('hidden')) {
      this.props.dispatch(revealStatus(status.get('id')));
    } else {
      this.props.dispatch(hideStatus(status.get('id')));
    }
  };

  handleToggleAll = () => {
    const { status, ancestorsIds, descendantsIds } = this.props;
    const statusIds = [status.get('id')].concat(ancestorsIds, descendantsIds);

    if (status.get('hidden')) {
      this.props.dispatch(revealStatus(statusIds));
    } else {
      this.props.dispatch(hideStatus(statusIds));
    }
  };

  handleTranslate = status => {
    const { dispatch } = this.props;

    if (status.get('translation')) {
      dispatch(undoStatusTranslation(status.get('id'), status.get('poll')));
    } else {
      dispatch(translateStatus(status.get('id')));
    }
  };

  handleBlockClick = (status) => {
    const { dispatch } = this.props;
    const account = status.get('account');
    dispatch(initBlockModal(account));
  };

  handleReport = (status) => {
    this.props.dispatch(initReport(status.get('account'), status));
  };

  handleEmbed = (status) => {
    this.props.dispatch(openModal({
      modalType: 'EMBED',
      modalProps: { id: status.get('id') },
    }));
  };

  handleUnmuteClick = account => {
    this.props.dispatch(unmuteAccount(account.get('id')));
  };

  handleUnblockClick = account => {
    this.props.dispatch(unblockAccount(account.get('id')));
  };

  handleBlockDomainClick = account => {
    this.props.dispatch(initDomainBlockModal(account));
  };

  handleUnblockDomainClick = domain => {
    this.props.dispatch(unblockDomain(domain));
  };

  handleHotkeyReply = e => {
    e.preventDefault();
    this.handleReplyClick(this.props.status);
  };

  handleHotkeyFavourite = () => {
    this.handleFavouriteClick(this.props.status);
  };

  handleHotkeyBoost = () => {
    this.handleReblogClick(this.props.status);
  };

  handleHotkeyQuote = () => {
    this.props.dispatch(quoteComposeById(this.props.status.get('id')));
  };

  handleHotkeyMention = e => {
    e.preventDefault();
    this.handleMentionClick(this.props.status.get('account'));
  };

  handleHotkeyOpenProfile = () => {
    this.props.history.push(`/@${this.props.status.getIn(['account', 'acct'])}`);
  };

  handleHotkeyToggleHidden = () => {
    this.handleToggleHidden(this.props.status);
  };

  handleHotkeyToggleSensitive = () => {
    this.handleToggleMediaVisibility();
  };

  handleHotkeyTranslate = () => {
    this.handleTranslate(this.props.status);
  };

  renderChildren (list, ancestors) {
    const { status, params: { statusId } } = this.props;

    // Direct conversations are rendered as a chat thread of aligned bubbles
    // instead of the standard stacked status cards.
    if (status && status.get('visibility') === 'direct') {
      return list.map(id => (
        <DmBubble key={id} id={id} />
      ));
    }

    return list.map((id, i) => (
      <StatusQuoteManager
        key={id}
        id={id}
        contextType='thread'
        previousId={i > 0 ? list[i - 1] : undefined}
        nextId={list[i + 1] || (ancestors && statusId)}
        rootId={statusId}
        shouldHighlightOnMount={this.state.newRepliesIds.includes(id)}
      />
    ));
  }

  setContainerRef = c => {
    this.node = c;
  };

  setStatusRef = c => {
    this.statusNode = c;
  };

  // `.columns-area--mobile .scrollable` (single-column layout) sets
  // `overflow: visible` on this container so the page itself scrolls
  // instead — only multi-column desktop layout makes the container the
  // actual overflow/scroll element. Both the container's own `onScroll`
  // and window `scroll` events are wired up (see componentDidMount), and
  // this checks which one is actually live at call time.
  isContainerScrollable = () => {
    const node = this.node;
    return !!node && node.scrollHeight > node.clientHeight;
  };

  scrollToBottom = () => {
    if (!this.node) {
      return;
    }

    if (this.isContainerScrollable()) {
      scrollBottom(this.node);
    } else {
      requestIdleCallback(() => {
        window.scrollTo({ top: document.documentElement.scrollHeight, behavior: 'smooth' });
      });
    }
  };

  handleScrollToBottomClick = () => {
    this.setState({ isAtBottom: true, newMessageCount: 0 });
    this.scrollToBottom();
    this.maybeMarkConversationRead(true);
  };

  handleScroll = () => {
    if (!this.node || this.props.status?.get('visibility') !== 'direct') {
      return;
    }

    let isAtBottom;

    if (this.isContainerScrollable()) {
      const { scrollTop, scrollHeight, clientHeight } = this.node;
      isAtBottom = scrollHeight - scrollTop - clientHeight < 40;
    } else {
      isAtBottom = this.node.getBoundingClientRect().bottom - window.innerHeight < 40;
    }

    if (isAtBottom !== this.state.isAtBottom) {
      this.setState({ isAtBottom, ...(isAtBottom ? { newMessageCount: 0 } : {}) });
    }

    if (isAtBottom) {
      this.maybeMarkConversationRead(true);
    }
  };

  // Reaching the bottom of a fully-read DM thread clears both the DM inbox's
  // own unread flag and the bell-icon mention-notification badge. The latter
  // only supports a single "mark everything up to now as read" cursor (no
  // per-notification read API), so this mirrors what "mark all as read"
  // already does elsewhere rather than introducing a new mechanism.
  maybeMarkConversationRead = (isAtBottom = this.state.isAtBottom) => {
    const { dispatch, conversationId, conversationUnread } = this.props;

    if (isAtBottom && conversationUnread && conversationId) {
      dispatch(markConversationRead(conversationId));
      dispatch(markNotificationsAsRead());
      dispatch(submitMarkers({ immediate: true }));
    }
  };

  componentDidUpdate(prevProps) {
    const { status, ancestorsIds, descendantsIds, params } = this.props;

    const isSameStatus = status && (prevProps.status?.get('id') === status.get('id'));
    const isDirect = status && status.get('visibility') === 'direct';

    // Only highlight replies after the initial load
    if (prevProps.descendantsIds.length && isSameStatus) {
      const newRepliesIds = difference(descendantsIds, prevProps.descendantsIds);

      if (newRepliesIds.length) {
        this.setState({newRepliesIds});

        if (isDirect) {
          if (this.state.isAtBottom) {
            this.scrollToBottom();
            this.maybeMarkConversationRead(true);
          } else {
            this.setState(({ newMessageCount }) => ({ newMessageCount: newMessageCount + newRepliesIds.length }));
          }
        }
      }
    }

    // The thread's ancestors/replies (ancestorsIds/descendantsIds) arrive
    // from a separate context fetch than the status itself, landing a
    // render or two after it — by which point the loadedStatusId scroll
    // below already ran with nothing yet to scroll to. A DM thread is
    // opened at its latest message (see conversation.jsx's handleClick),
    // so ancestorsIds — not descendantsIds — usually holds the bulk of
    // the thread's history; both are checked since either can be what's
    // still missing at that point. Catches that transition specifically
    // (excluded from the "new replies" branch above since
    // prevProps.descendantsIds.length is 0 here, by design, to avoid
    // highlighting the whole initial load as "new").
    if (
      isDirect &&
      this.state.isAtBottom &&
      ((prevProps.descendantsIds.length === 0 && descendantsIds.length > 0) ||
        (prevProps.ancestorsIds.length === 0 && ancestorsIds.length > 0))
    ) {
      this.scrollToBottom();
    }

    // Force-scroll to the bottom once our own reply to this thread finishes submitting.
    if (
      isDirect &&
      prevProps.composeIsSubmitting && !this.props.composeIsSubmitting &&
      prevProps.composeInReplyTo && [status.get('id'), ...ancestorsIds, ...descendantsIds].includes(prevProps.composeInReplyTo)
    ) {
      this.setState({ isAtBottom: true, newMessageCount: 0 });
      this.scrollToBottom();
    }

    if (params.statusId && prevProps.params.statusId !== params.statusId) {
      this.props.dispatch(fetchStatus(params.statusId, { forceFetch: true }));
    }

    if (status && status.get('id') !== this.state.loadedStatusId) {
      this.setState({ showMedia: defaultMediaVisibility(this.props.status), loadedStatusId: status.get('id') });
      this.updateDirectStreamSubscription(status.get('visibility') === 'direct');

      if (isDirect) {
        // ScrollContainer's own restore-on-navigate (shouldUpdateScroll,
        // above) sets scrollTop directly on this component's own div —
        // a no-op in single-column layout, where the page scrolls instead
        // (see scrollToBottom/handleScroll). Covers that case explicitly,
        // rather than opening a thread scrolled to its very top there.
        this.scrollToBottom();
      }

      // Covers opening a thread that's already scrolled to the bottom (the
      // default) with unread messages waiting.
      this.maybeMarkConversationRead();
    }
  }

  componentWillUnmount () {
    detachFullscreenListener(this.onFullScreenChange);
    this.directStreamDisconnect?.();
    window.removeEventListener('scroll', this.handleScroll);
  }

  // Direct-visibility statuses are never fanned out over the regular
  // `update` stream, so a DM thread needs its own subscription to the
  // `direct` channel to receive new messages (and typing events) live —
  // otherwise only the DM inbox column (if also mounted) would get them.
  updateDirectStreamSubscription = (isDirect) => {
    this.directStreamDisconnect?.();
    this.directStreamDisconnect = isDirect ? this.props.dispatch(connectDirectStream()) : undefined;
  };

  onFullScreenChange = () => {
    this.setState({ fullscreen: isFullscreen() });
  };

  shouldUpdateScroll = (prevLocation, location) => {
    // Do not change scroll when opening a modal
    if (location.state?.mastodonModalKey !== prevLocation?.state?.mastodonModalKey) {
      return false;
    }

    // Direct threads open scrolled to the newest message, like a
    // messenger, rather than to the focused post's own position — for a
    // conversation opened from the list the focused post already is the
    // newest message, but scrolling to just its offset can still leave it
    // (and everything below it, like the composer) out of view when there
    // are ancestors above it.
    if (this.props.status?.get('visibility') === 'direct') {
      return this.node ? [0, this.node.scrollHeight] : false;
    }

    // Scroll to focused post if it is loaded
    if (this.statusNode) {
      return [0, this.statusNode.offsetTop];
    }

    // Do not scroll otherwise, `componentDidUpdate` will take care of that
    return false;
  };

  render () {
    let ancestors, descendants, remoteHint;
    const { isLoading, status, ancestorsIds, descendantsIds, refresh, intl, domain, multiColumn, pictureInPicture } = this.props;
    const { fullscreen } = this.state;
    const { signedIn } = this.props.identity;


    if (isLoading) {
      return (
        <Column>
          <LoadingIndicator />
        </Column>
      );
    }

    if (status === null || !signedIn ) {
      return (
        <BundleColumnError multiColumn={multiColumn} errorType='routing' />
      );
    }

    if (ancestorsIds && ancestorsIds.length > 0) {
      ancestors = <>{this.renderChildren(ancestorsIds, true)}</>;
    }

    if (descendantsIds && descendantsIds.length > 0) {
      descendants = <>{this.renderChildren(descendantsIds)}</>;
    }

    const isLocal = status.getIn(['account', 'acct'], '').indexOf('@') === -1;
    const isIndexable = !status.getIn(['account', 'noindex']);
    const isDirect = status.get('visibility') === 'direct';

    const handlers = {
      reply: this.handleHotkeyReply,
      favourite: this.handleHotkeyFavourite,
      boost: this.handleHotkeyBoost,
      quote: this.handleHotkeyQuote,
      mention: this.handleHotkeyMention,
      openProfile: this.handleHotkeyOpenProfile,
      toggleHidden: this.handleHotkeyToggleHidden,
      toggleSensitive: this.handleHotkeyToggleSensitive,
      openMedia: this.handleHotkeyOpenMedia,
      onTranslate: this.handleHotkeyTranslate,
    };

    return (
      <Column bindToDocument={!multiColumn} label={intl.formatMessage(messages.detailedStatus)}>
        <ColumnHeader
          showBackButton
          multiColumn={multiColumn}
          extraButton={(
            <button type='button' className='column-header__button' title={intl.formatMessage(status.get('hidden') ? messages.revealAll : messages.hideAll)} aria-label={intl.formatMessage(status.get('hidden') ? messages.revealAll : messages.hideAll)} onClick={this.handleToggleAll}><Icon id={status.get('hidden') ? 'eye' : 'eye-slash'} icon={status.get('hidden') ? VisibilityIcon : VisibilityOffIcon} /></button>
          )}
        />

        <ScrollContainer scrollKey='thread' shouldUpdateScroll={this.shouldUpdateScroll} childRef={this.setContainerRef}>
          <div className={classNames('item-list scrollable scrollable--flex', { fullscreen, 'conversation-thread': isDirect })} ref={this.setContainerRef} onScroll={isDirect ? this.handleScroll : undefined}>
            {ancestors}

            <Hotkeys handlers={handlers}>
              <NavigationFocusTarget
                as='div'
                focusTargetName={FOCUS_TARGET.POST}
                className={classNames('focusable', 'detailed-status__wrapper', `detailed-status__wrapper-${status.get('visibility')}`)}
                tabIndex={0}
                aria-label={textForScreenReader({intl, status})} ref={this.setStatusRef}
              >
                {isDirect ? (
                  <DmBubble
                    key={`bubble-${status.get('id')}`}
                    id={status.get('id')}
                    focused
                  />
                ) : (
                  <DetailedStatus
                    key={`details-${status.get('id')}`}
                    status={status}
                    onOpenVideo={this.handleOpenVideo}
                    onOpenMedia={this.handleOpenMedia}
                    onToggleHidden={this.handleToggleHidden}
                    onTranslate={this.handleTranslate}
                    domain={domain}
                    showMedia={this.state.showMedia}
                    onToggleMediaVisibility={this.handleToggleMediaVisibility}
                    pictureInPicture={pictureInPicture}
                    ancestors={this.props.ancestorsIds.length}
                    multiColumn={multiColumn}
                  />
                )}

                {/* Direct messages use the per-bubble ellipsis menu in DmBubble
                    instead of the full action bar, which reads as out of
                    place under a chat-style message. */}
                {!isDirect && (
                  <ActionBar
                    key={`action-bar-${status.get('id')}`}
                    status={status}
                    onReply={this.handleReplyClick}
                    onFavourite={this.handleFavouriteClick}
                    onReblog={this.handleReblogClick}
                    onBookmark={this.handleBookmarkClick}
                    onDelete={this.handleDeleteClick}
                    onRevokeQuote={this.handleRevokeQuoteClick}
                    onQuotePolicyChange={this.handleQuotePolicyChange}
                    onQuote={this.handleQuote}
                    onEdit={this.handleEditClick}
                    onDirect={this.handleDirectClick}
                    onMention={this.handleMentionClick}
                    onMute={this.handleMuteClick}
                    onUnmute={this.handleUnmuteClick}
                    onMuteConversation={this.handleConversationMuteClick}
                    onBlock={this.handleBlockClick}
                    onUnblock={this.handleUnblockClick}
                    onBlockDomain={this.handleBlockDomainClick}
                    onUnblockDomain={this.handleUnblockDomainClick}
                    onReport={this.handleReport}
                    onPin={this.handlePin}
                    onEmbed={this.handleEmbed}
                  />
                )}
              </NavigationFocusTarget>
            </Hotkeys>

            {descendants}

            <RefreshController
              isLocal={isLocal}
              statusId={status.get('id')}
              statusCreatedAt={status.get('created_at')}
            />
          </div>
        </ScrollContainer>

        {isDirect && (
          <div className='dm-composer-anchor'>
            {!this.state.isAtBottom && (
              <ScrollToBottomButton count={this.state.newMessageCount} onClick={this.handleScrollToBottomClick} />
            )}

            <TypingIndicator accountIds={this.props.participantAccountIds} />

            <DmComposer rootId={status.get('id')} />
          </div>
        )}

        <Helmet>
          <title>{titleFromStatus(intl, status)}</title>
          <meta name='robots' content={(isLocal && isIndexable) ? 'all' : 'noindex'} />
          <link rel='canonical' href={status.get('url')} />
        </Helmet>
      </Column>
    );
  }

}

export default withRouter(injectIntl(connect(makeMapStateToProps)(withIdentity(Status))));
