import { useCallback, useEffect, useMemo } from 'react';

import { FormattedMessage } from 'react-intl';

import { Link } from 'react-router-dom';

import { fetchContext } from 'mastodon/actions/statuses_typed';
import { Avatar } from 'mastodon/components/avatar';
import { DisplayName } from 'mastodon/components/display_name';
import { RelativeTimestamp } from 'mastodon/components/relative_timestamp';
import StatusContent from 'mastodon/components/status_content';
import { EmbeddedStatus } from 'mastodon/features/notifications_v2/components/embedded_status';
import { Footer } from 'mastodon/features/picture_in_picture/components/footer';
import type { Account } from 'mastodon/models/account';
import type { Status } from 'mastodon/models/status';
import { makeGetStatus } from 'mastodon/selectors';
import type { RootState } from 'mastodon/store';
import { useAppDispatch, useAppSelector } from 'mastodon/store';

// StatusContent is a class component behind connect() and withRouter(), and
// its own props do not survive those, so it is typed here by what it takes.
const StatusContentComponent = StatusContent as unknown as React.ComponentType<{
  status: Status;
}>;

type GetStatusSelector = (
  state: RootState,
  props: { id?: string | null; contextType?: string },
) => Status | null;

export const MediaModalStatus: React.FC<{
  statusId: string;
  onClose: (arg0?: boolean) => void;
}> = ({ statusId, onClose }) => {
  const dispatch = useAppDispatch();
  const getStatus = useMemo(() => makeGetStatus(), []) as GetStatusSelector;
  const status = useAppSelector((state) => getStatus(state, { id: statusId }));
  const replyIds = useAppSelector(
    (state) => state.contexts.replies[statusId] as string[] | undefined,
  );

  useEffect(() => {
    void dispatch(fetchContext({ statusId }));
  }, [dispatch, statusId]);

  // The viewer would otherwise stay open over wherever the link landed.
  const handleNavigate = useCallback(() => {
    onClose();
  }, [onClose]);

  if (!status) {
    return null;
  }

  const account = status.get('account') as Account;
  const acct = account.acct;
  const statusPath = `/@${acct}/${statusId}`;

  return (
    <div className='media-modal__status'>
      <div className='media-modal__status__scroller'>
        <Link
          className='media-modal__status__author'
          to={`/@${acct}`}
          onClick={handleNavigate}
        >
          <Avatar account={account} size={46} />
          <DisplayName account={account} />
        </Link>

        <StatusContentComponent status={status} />

        <Link
          className='media-modal__status__timestamp'
          to={statusPath}
          onClick={handleNavigate}
        >
          <RelativeTimestamp
            timestamp={status.get('created_at') as string}
            long
          />
        </Link>

        <div className='media-modal__status__actions'>
          <Footer statusId={statusId} withOpenButton onClose={onClose} />
        </div>

        {replyIds && replyIds.length > 0 && (
          <div className='media-modal__status__replies'>
            <h3 className='media-modal__status__replies__heading'>
              <FormattedMessage
                id='lightbox.replies'
                defaultMessage='Replies'
              />
            </h3>

            {replyIds.map((replyId) => (
              // EmbeddedStatus navigates itself; this only closes the viewer.
              <div
                key={replyId}
                className='media-modal__status__reply'
                onClick={handleNavigate}
                role='presentation'
              >
                <EmbeddedStatus statusId={replyId} />
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
