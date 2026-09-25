import { useEffect, useRef } from 'react';

import { useHistory } from 'react-router-dom';

import { LoadingIndicator } from 'mastodon/components/loading_indicator';
import { Status } from 'mastodon/features/ui/util/async-components';

import Bundle from './bundle';

type ThreadComponent = React.FC<{
  params: { statusId: string };
  embedded?: boolean;
}>;

export const MediaModalStatus: React.FC<{
  statusId: string;
  onClose: (arg0?: boolean) => void;
}> = ({ statusId, onClose }) => {
  const history = useHistory();

  // The listener is registered once, so it reads the current handler rather
  // than the one that was in scope when it was attached.
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

  return (
    <div className='media-modal__status'>
      <Bundle fetchComponent={Status} loading={LoadingIndicator}>
        {(Thread: ThreadComponent) => <Thread params={{ statusId }} embedded />}
      </Bundle>
    </div>
  );
};
