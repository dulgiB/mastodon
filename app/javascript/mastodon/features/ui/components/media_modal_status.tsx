import { useEffect, useRef } from 'react';

import { useHistory } from 'react-router-dom';

import { focusCompose } from 'mastodon/actions/compose';
import { LoadingIndicator } from 'mastodon/components/loading_indicator';
import { Status } from 'mastodon/features/ui/util/async-components';
import { useAppDispatch, useAppSelector } from 'mastodon/store';

import Bundle from './bundle';

type ThreadComponent = React.FC<{
  params: { statusId: string };
  embedded?: boolean;
}>;

export const MediaModalStatus: React.FC<{
  statusId: string;
  onClose: (ignoreFocus?: boolean) => void;
}> = ({ statusId, onClose }) => {
  const history = useHistory();
  const dispatch = useAppDispatch();

  // The listeners below are registered once, so they read the current handler
  // rather than the one that was in scope when they were attached.
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  // A thread is full of links, and the viewer sits over whatever page opened
  // it: without this it would stay open over wherever one of them landed. The
  // entry the modal pushes for itself keeps the path it was opened on, so
  // comparing paths tells the two apart.
  useEffect(() => {
    const openedOn = history.location.pathname;

    return history.listen((location) => {
      if (location.pathname !== openedOn) {
        onCloseRef.current();
      }
    });
  }, [history]);

  // Only a reply sets this, and it is a fresh Date every time, so it says
  // "a reply was just started" even when it is a reply to the same post.
  const replyStartedAt = useAppSelector(
    (state) => state.compose.get('preselectDate') as Date | null,
  );
  const composerIsOnThePage = useAppSelector(
    (state) => (state.compose.get('mounted') as number) > 0,
  );
  const replyTargetPath = useAppSelector((state) => {
    const targetId = state.compose.get('in_reply_to') as string | undefined;

    if (!targetId) {
      return undefined;
    }

    const accountId = state.statuses.getIn([targetId, 'account']) as
      | string
      | undefined;
    const acct = accountId ? state.accounts.get(accountId)?.acct : undefined;

    return acct ? `/@${acct}/${targetId}` : undefined;
  });

  // Replying from the panel leaves the composer where the viewer covers it, so
  // the reply is written blind. Go to the post being replied to instead, where
  // the composer is in plain sight next to the conversation it belongs to.
  const lastReplyStart = useRef(replyStartedAt);
  useEffect(() => {
    if (replyStartedAt === lastReplyStart.current) {
      return;
    }
    lastReplyStart.current = replyStartedAt;

    // With no composer on the page, replying has already gone to /publish.
    if (!composerIsOnThePage || !replyTargetPath) {
      return;
    }

    // Closed with ignoreFocus, or the viewer would hand the focus back to the
    // thumbnail it was opened from.
    onCloseRef.current(true);
    history.push(replyTargetPath);

    // Everything behind the viewer is inert while it is open, so the focus the
    // reply asked for had nowhere to land. Ask again on the next turn, once
    // the viewer is gone and the composer can take it.
    setTimeout(() => {
      dispatch(focusCompose());
    }, 0);
  }, [replyStartedAt, composerIsOnThePage, replyTargetPath, history, dispatch]);

  return (
    <div className='media-modal__status'>
      <Bundle fetchComponent={Status} loading={LoadingIndicator}>
        {(Thread: ThreadComponent) => <Thread params={{ statusId }} embedded />}
      </Bundle>
    </div>
  );
};
