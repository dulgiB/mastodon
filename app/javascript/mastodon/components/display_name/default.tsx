import { useMemo } from 'react';
import type { ComponentPropsWithoutRef, FC } from 'react';

import { defineMessages, useIntl } from 'react-intl';

import { Skeleton } from '../skeleton';

import type { DisplayNameProps } from './index';
import { DisplayNameWithoutDomain } from './no-domain';

const messages = defineMessages({
  invalidHandle: {
    id: 'account.hame.invalid_handle',
    defaultMessage: 'Handle unavailable',
  },
});

export function useAccountHandle(
  account: DisplayNameProps['account'],
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  localDomain: DisplayNameProps['localDomain'],
) {
  const intl = useIntl();

  return useMemo(() => {
    if (!account) {
      return null;
    }

    if (account.invalid_handle)
      return intl.formatMessage(messages.invalidHandle);

    return `@${account.acct}`;
  }, [account, intl]);
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
