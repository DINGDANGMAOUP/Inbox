import type { ViewProps } from 'react-native';

export type InboxReaderPreferences = {
  fontFamily?: 'system' | 'serif' | 'sans' | 'kai';
  fontSize?: number;
  lineHeight?: number;
  margin?: number;
  readerTheme?: 'paper' | 'sepia' | 'night' | 'eink';
  readingMode?: 'scroll' | 'page';
};

export type InboxReaderLocationEvent = {
  locator: string;
  progression?: number;
  totalProgression?: number;
  position?: number;
};

export type InboxReaderErrorEvent = {
  message: string;
};

export type InboxReaderExternalLinkEvent = {
  url: string;
};

export type InboxReaderTapEvent = {
  zone: 'left' | 'center' | 'right';
  x: number;
  y: number;
};

export type InboxReaderDecorationPressEvent = {
  id: string;
  x?: number;
  y?: number;
  width?: number;
  height?: number;
};

export type InboxReaderDecoration = {
  id: string;
  locator: string;
  type?: 'highlight' | 'note' | 'bookmark';
  label?: string;
};

export type InboxReaderSelection = {
  locator: string;
  selectedText: string;
  before?: string;
  after?: string;
  href?: string;
  x?: number;
  y?: number;
  width?: number;
  height?: number;
};

export type InboxReaderViewProps = ViewProps & {
  fileUri?: string | null;
  initialLocator?: string | null;
  initialReadingOrderIndex?: number | null;
  initialProgression?: number | null;
  preferences?: InboxReaderPreferences | null;
  decorations?: InboxReaderDecoration[] | null;
  onReady?: () => void;
  onLocationChange?: (event: { nativeEvent: InboxReaderLocationEvent }) => void;
  onSelectionChange?: (event: { nativeEvent: Partial<InboxReaderSelection> }) => void;
  onError?: (event: { nativeEvent: InboxReaderErrorEvent }) => void;
  onExternalLink?: (event: { nativeEvent: InboxReaderExternalLinkEvent }) => void;
  onTap?: (event: { nativeEvent: InboxReaderTapEvent }) => void;
  onDecorationPress?: (event: { nativeEvent: InboxReaderDecorationPressEvent }) => void;
};

export type InboxReaderViewRef = {
  goBackward(animated?: boolean): Promise<boolean>;
  goForward(animated?: boolean): Promise<boolean>;
  goToLocator(locator: string, animated?: boolean): Promise<boolean>;
  goToReadingOrder(index: number, progression?: number, animated?: boolean): Promise<boolean>;
  submitPreferences(preferences: InboxReaderPreferences): Promise<void>;
  getCurrentSelection(): Promise<InboxReaderSelection | null>;
  clearSelection(): Promise<void>;
};
