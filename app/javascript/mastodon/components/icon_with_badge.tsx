import type { IconProp } from './icon';
import { Icon } from './icon';

export const formatUnreadCount = (num: number): number | string =>
  num > 40 ? '40+' : num;

interface Props {
  id: string;
  icon: IconProp;
  count: number;
  issueBadge?: boolean;
  // A plain dot, for something unread whose count belongs somewhere else.
  dotBadge?: boolean;
  className: string;
}
export const IconWithBadge: React.FC<Props> = ({
  id,
  icon,
  count,
  issueBadge,
  dotBadge,
  className,
}) => (
  <i className='icon-with-badge'>
    <Icon id={id} icon={icon} className={className} />
    {count > 0 && (
      <i className='icon-with-badge__badge'>{formatUnreadCount(count)}</i>
    )}
    {issueBadge && <i className='icon-with-badge__issue-badge' />}
    {dotBadge && <i className='icon-with-badge__dot-badge' />}
  </i>
);
