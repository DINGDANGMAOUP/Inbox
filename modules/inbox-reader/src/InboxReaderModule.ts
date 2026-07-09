import { NativeModule, requireNativeModule } from 'expo';

declare class InboxReaderModule extends NativeModule<{}> {
  getEngineInfo(): { platform: 'android'; name: 'Readium'; version: string };
}

export default requireNativeModule<InboxReaderModule>('InboxReader');
