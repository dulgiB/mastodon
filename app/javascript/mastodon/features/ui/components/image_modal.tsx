import { defineMessages, useIntl } from 'react-intl';

import CloseIcon from '@/material-icons/400-24px/close.svg?react';
import { IconButton } from 'mastodon/components/icon_button';

import { ZoomableImage } from './zoomable_image';

const messages = defineMessages({
  close: { id: 'lightbox.close', defaultMessage: 'Close' },
});

export const ImageModal: React.FC<{
  src: string;
  alt: string;
  onClose: () => void;
}> = ({ src, alt, onClose }) => {
  const intl = useIntl();

  return (
    <div className='modal-root__modal media-modal'>
      <div
        className='media-modal__closer'
        role='presentation'
        onClick={onClose}
      >
        <ZoomableImage src={src} width={400} height={400} alt={alt} />
      </div>

      <div className='media-modal__navigation'>
        <div className='media-modal__close'>
          <IconButton
            title={intl.formatMessage(messages.close)}
            icon='times'
            iconComponent={CloseIcon}
            onClick={onClose}
          />
        </div>
      </div>
    </div>
  );
};
