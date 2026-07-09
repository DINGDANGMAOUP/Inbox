import { requireNativeView } from 'expo';
import { forwardRef, type ComponentType } from 'react';

import type { InboxReaderViewProps, InboxReaderViewRef } from './InboxReader.types';

const NativeInboxReaderView = requireNativeView<InboxReaderViewProps>('InboxReader') as never;

export const InboxReaderView = forwardRef<InboxReaderViewRef, InboxReaderViewProps>((props, ref) => {
  const NativeView = NativeInboxReaderView as ComponentType<InboxReaderViewProps & { ref?: typeof ref }>;
  return <NativeView {...props} ref={ref} />;
});

InboxReaderView.displayName = 'InboxReaderView';
