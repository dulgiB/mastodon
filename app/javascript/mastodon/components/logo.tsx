import logo from '@/images/logo.svg';
import wordmark from '@/images/logos/wordmark_dark.png';

export const WordmarkLogo: React.FC = () => (
  <img src={wordmark} alt='Whippy Edition' className='logo logo--wordmark' />
);

export const IconLogo: React.FC = () => (
  <svg viewBox='0 0 79 79' className='logo logo--icon' role='img'>
    <title>Mastodon</title>
    <use xlinkHref='#logo-symbol-icon' />
  </svg>
);

export const SymbolLogo: React.FC = () => (
  <img src={logo} alt='Whippy Edition' className='logo logo--icon' />
);
