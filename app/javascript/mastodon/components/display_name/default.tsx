import { useMemo } from 'react';
import type { ComponentPropsWithoutRef, FC } from 'react';

import { Skeleton } from '../skeleton';

import type { DisplayNameProps } from './index';
import { DisplayNameWithoutDomain } from './no-domain';

export function useAccountHandle(
  account: DisplayNameProps['account'],
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  localDomain: DisplayNameProps['localDomain'],
) {
  return useMemo(() => {
    if (!account) {
      return null;
    }
    const acct = account.get('acct');

    return `@${acct}`;
  }, [account]);
}

export const DisplayNameDefault: FC<
  Omit<DisplayNameProps, 'variant'> & ComponentPropsWithoutRef<'span'>
> = ({ account, localDomain, className, ...props }) => {
  const username = useAccountHandle(account, localDomain);

  return (
    <DisplayNameWithoutDomain
      account={account}
      className={className}
      {...props}
    >
      {' '}
      <span className='display-name__account'>
        {username ?? <Skeleton width='7ch' />}
      </span>
    </DisplayNameWithoutDomain>
  );
};
