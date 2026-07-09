import { Link, router, useLocalSearchParams } from 'expo-router';
import * as Clipboard from 'expo-clipboard';
import { Image } from 'expo-image';
import { useSQLiteContext } from 'expo-sqlite';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AccessibilityInfo,
  ActivityIndicator,
  Alert,
  BackHandler,
  FlatList,
  KeyboardAvoidingView,
  Keyboard,
  type LayoutChangeEvent,
  Linking,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  PanResponder,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  useWindowDimensions,
} from 'react-native';
import Animated, { FadeIn, FadeOut } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { InboxReaderView, type InboxReaderDecoration, type InboxReaderDecorationPressEvent, type InboxReaderExternalLinkEvent, type InboxReaderLocationEvent, type InboxReaderSelection, type InboxReaderTapEvent, type InboxReaderViewRef } from '../../../modules/inbox-reader';
import { AdaptiveSurface } from '@/components/reader/adaptive-surface';
import { IconButton } from '@/components/reader/icon-button';
import { M3FilterChip, M3Screen, M3SegmentedControl, M3StatePanel, M3Stepper } from '@/components/reader/m3';
import { m3Motion } from '@/components/reader/motion-presets';
import { M3Pressable } from '@/components/reader/m3-pressable';
import { MaterialSymbol, type MaterialSymbolName } from '@/components/reader/material-symbol';
import { brand } from '@/constants/brand';
import { readerFontFamilies, readerFontFamilyOrder, readerNativeFontFamily } from '@/constants/reader-fonts';
import { readerThemeAssets } from '@/constants/theme-assets';
import {
  createAnnotation,
  deleteAnnotation,
  getReaderPreferences,
  getChapter,
  listAnnotations,
  openBook,
  saveProgress,
  searchBook,
  updateReaderPreferences,
} from '@/lib/reader-service';
import { cleanChapterTitle } from '@/lib/text-utils';
import type { Annotation, Book, Chapter, ReaderPreferences, ReaderTheme, SearchResult } from '@/types/reader';

type Panel = 'toc' | 'search' | 'notes' | 'settings' | null;
type ReaderPanel = Exclude<Panel, null>;
type AnnotationFilter = 'all' | Annotation['type'];
type TextSelection = {
  selectedText: string;
  offset: number;
  x: number;
  y: number;
  height?: number;
  locator?: string;
};
type NoteAnchor = {
  key: string;
  locator: string;
  selectedText: string;
  chapterId: string;
  annotations: Annotation[];
};
type PendingReadiumNavigation = {
  index: number;
  ratio: number;
  token: number;
  timeout: ReturnType<typeof setTimeout>;
};

const annotationLabels: Record<Annotation['type'], string> = {
  bookmark: '书签',
  highlight: '划线',
  note: '笔记',
};

const themeLabels: Record<ReaderTheme, string> = {
  paper: '纸页',
  sepia: '暖笺',
  night: '夜读',
  eink: '墨白',
};

const readingModeLabels: Record<ReaderPreferences['readingMode'], string> = {
  scroll: '滚动',
  page: '翻页',
};

const annotationFilters: { value: AnnotationFilter; label: string }[] = [
  { value: 'all', label: '全部' },
  { value: 'bookmark', label: '书签' },
  { value: 'highlight', label: '划线' },
  { value: 'note', label: '笔记' },
];
const readiumQuoteContextLength = 32;

const readerPanelTabs: { value: ReaderPanel; label: string; icon: MaterialSymbolName }[] = [
  { value: 'toc', label: '目录', icon: 'list.bullet' },
  { value: 'search', label: '搜索', icon: 'magnifyingglass' },
  { value: 'notes', label: '标注', icon: 'note' },
  { value: 'settings', label: '样式', icon: 'textformat.size' },
];

function chapterLabel(title: string) {
  return cleanChapterTitle(title, '正文')
    .replace(/^Part\s+(\d+)$/i, '第 $1 部分')
    .replace(/^Chapter\s+(\d+)$/i, '第 $1 章');
}

function bookTitleLabel(title: string) {
  return cleanChapterTitle(title, title || '未命名书籍');
}

function cleanInlineContent(input: string) {
  return input
    .replace(/\\r/g, '\n')
    .replace(/\r/g, '\n')
    .replace(/\\?[\w-]*pq[\w.-]*\.(?:bmp|png|jpe?g|gif)\\?/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function chapterTitleKey(input: string) {
  const cleaned = cleanChapterTitle(input, '');
  if (!cleaned) {
    return '';
  }

  return chapterLabel(cleaned)
    .normalize('NFKC')
    .replace(/[\s　:：,，.。·\-—_]+/g, '')
    .toLowerCase();
}

function shouldShowChapterHeading(title: string, chapterCount: number) {
  const label = chapterLabel(title);
  return chapterCount > 1 || !/^(?:正文|未命名文本)$/.test(label);
}

function isDuplicateChapterHeading(block: string, title: string) {
  const blockKey = chapterTitleKey(cleanInlineContent(block));
  const titleKey = chapterTitleKey(title);
  return Boolean(blockKey && titleKey && blockKey === titleKey);
}

function readerParagraphs(chapter: Chapter, chapterCount: number) {
  const showHeading = shouldShowChapterHeading(chapter.title, chapterCount);
  let checkedOpeningBlock = false;

  return chapter.textContent
    .replace(/\\r/g, '\n')
    .replace(/\r/g, '\n')
    .split(/\n+/)
    .filter((block) => {
      if (!showHeading || checkedOpeningBlock) {
        return true;
      }
      if (!cleanInlineContent(block)) {
        return true;
      }

      checkedOpeningBlock = true;
      return !isDuplicateChapterHeading(block, chapter.title);
    })
    .map(cleanInlineContent)
    .filter(Boolean);
}

function parseAnnotationPosition(position: string) {
  try {
    const parsed = JSON.parse(position) as { chapterId?: string; offset?: number; quote?: string; locator?: string };
    return parsed;
  } catch {
    return {};
  }
}

function hashAnnotationAnchor(value: string) {
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) {
    hash = (hash * 31 + value.charCodeAt(index)) >>> 0;
  }
  return hash.toString(36);
}

function noteAnchorKey(annotation: Annotation) {
  const position = parseAnnotationPosition(annotation.position);
  return `note-anchor-${annotation.chapterId}-${hashAnnotationAnchor(`${position.locator ?? position.offset ?? ''}|${annotation.selectedText ?? ''}`)}`;
}

function ratioFromOffset(chapter: Chapter | undefined, offset?: number) {
  if (!chapter || typeof offset !== 'number' || offset < 0) {
    return 0;
  }

  const contentLength = Math.max(1, chapter.textLength ?? chapter.textContent.length);
  return Math.max(0, Math.min(0.96, offset / contentLength));
}

function clampRatio(value: number) {
  return Math.max(0, Math.min(1, Number.isFinite(value) ? value : 0));
}

function normalizeReadiumHref(href?: string | null) {
  return (href ?? '')
    .replace(/#.*$/, '')
    .replace(/^\.?\//, '');
}

function readiumHrefFromChapter(chapter: Chapter) {
  return normalizeReadiumHref(chapter.href.replace(/#chunk-\d+$/, ''));
}

function readiumHrefCandidatesFromChapter(chapter: Chapter) {
  const href = readiumHrefFromChapter(chapter);
  const withoutOpfBase = href.replace(/^[^/]+\//, '');
  return withoutOpfBase && withoutOpfBase !== href ? [href, withoutOpfBase] : [href];
}

function readiumHrefMatchesChapter(chapter: Chapter, href: string) {
  const normalized = normalizeReadiumHref(href);
  return readiumHrefCandidatesFromChapter(chapter).includes(normalized);
}

function readiumLocatorForChapter(chapter: Chapter, progression = 0, href = readiumHrefFromChapter(chapter)) {
  return JSON.stringify({
    href: normalizeReadiumHref(href),
    type: 'application/xhtml+xml',
    locations: { progression: clampRatio(progression) },
  });
}

function readiumLocatorForOffset(chapter: Chapter, offset: number, highlight?: string) {
  const safeOffset = Math.max(0, Math.min(chapter.textContent.length, Number.isFinite(offset) ? offset : 0));
  const paragraph = readiumParagraphLocator(chapter, safeOffset);
  const trimmedHighlight = highlight?.trim();
  const localStart = trimmedHighlight ? paragraph.localText.indexOf(trimmedHighlight, paragraph.localOffset) : -1;
  const quoteStart = localStart >= 0 ? localStart : paragraph.localOffset;
  const quoteEnd = trimmedHighlight ? quoteStart + trimmedHighlight.length : quoteStart;

  return JSON.stringify({
    href: readiumHrefFromChapter(chapter),
    type: 'application/xhtml+xml',
    locations: {
      progression: ratioFromOffset(chapter, safeOffset),
      cssSelector: paragraph.cssSelector,
    },
    text: trimmedHighlight
      ? {
          before: paragraph.localText.slice(Math.max(0, quoteStart - readiumQuoteContextLength), quoteStart),
          highlight: trimmedHighlight,
          after: paragraph.localText.slice(quoteEnd, quoteEnd + readiumQuoteContextLength),
        }
      : undefined,
  });
}

function readiumHrefFromLocator(locator: string) {
  try {
    return normalizeReadiumHref((JSON.parse(locator) as { href?: string }).href);
  } catch {
    return '';
  }
}

function parseReadiumLocator(locator?: string | null) {
  if (!locator) {
    return null;
  }

  try {
    return JSON.parse(locator) as {
      href?: string;
      type?: string;
      locations?: { progression?: number; cssSelector?: string };
      text?: { before?: string; highlight?: string; after?: string };
    };
  } catch {
    return null;
  }
}

function chapterFromReadiumLocator(chapters: Chapter[], locator?: string) {
  const href = locator ? readiumHrefFromLocator(locator) : '';
  const index = chapters.findIndex((chapter) => readiumHrefMatchesChapter(chapter, href));
  return index >= 0 ? { chapter: chapters[index], index } : null;
}

function findAnnotationOffset(chapterText: string, highlight: string, position: ReturnType<typeof parseAnnotationPosition>, locator?: ReturnType<typeof parseReadiumLocator>) {
  const text = chapterText.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  const locatorText = locator?.text;
  const locatorHighlight = locatorText?.highlight?.trim() || highlight;
  const before = locatorText?.before ?? '';
  const after = locatorText?.after ?? '';

  if (before) {
    for (const size of [160, 120, 80, 48, 24]) {
      const beforeTail = before.slice(-size);
      if (!beforeTail) {
        continue;
      }
      const index = text.indexOf(beforeTail + locatorHighlight);
      if (index >= 0) {
        return index + beforeTail.length;
      }
    }
  }

  if (after) {
    for (const size of [160, 120, 80, 48, 24]) {
      const afterHead = after.slice(0, size);
      if (!afterHead) {
        continue;
      }
      const index = text.indexOf(locatorHighlight + afterHead);
      if (index >= 0) {
        return index;
      }
    }
  }

  const quote = position.quote ?? highlight;
  let offset = typeof position.offset === 'number' ? position.offset : -1;
  if (offset < 0 || text.slice(offset, offset + quote.length) !== quote) {
    offset = text.indexOf(quote);
  }
  if (offset < 0) {
    offset = text.indexOf(highlight);
  }

  return offset;
}

function readiumParagraphLocator(chapter: Chapter, offset: number) {
  const text = chapter.textContent.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  const lines = text.split('\n');
  let cursor = 0;

  for (let index = 0; index < lines.length; index += 1) {
    const rawLine = lines[index];
    const line = rawLine.trimEnd();
    const end = cursor + rawLine.length;
    if (line && offset >= cursor && offset <= end) {
      return {
        cssSelector: `body > section > p:nth-of-type(${index + 1})`,
        localText: line,
        localOffset: Math.max(0, Math.min(line.length, offset - cursor)),
      };
    }
    cursor = end + 1;
  }

  return {
    cssSelector: 'body > section',
    localText: text,
    localOffset: Math.max(0, Math.min(text.length, offset)),
  };
}

function readiumLocatorForAnnotation(annotation: Annotation, chapter?: Chapter) {
  const position = parseAnnotationPosition(annotation.position);
  const storedLocator = parseReadiumLocator(position.locator);
  if (storedLocator) {
    return position.locator;
  }
  if (!chapter || !annotation.selectedText) {
    return position.locator ?? null;
  }

  const highlight = annotation.selectedText;
  const offset = findAnnotationOffset(chapter.textContent, highlight, position);
  if (offset < 0) {
    return position.locator ?? null;
  }

  const paragraph = readiumParagraphLocator(chapter, offset);
  const localStart = paragraph.localText.indexOf(highlight, paragraph.localOffset);
  const quoteStart = localStart >= 0 ? localStart : paragraph.localOffset;
  const quoteEnd = quoteStart + highlight.length;
  return JSON.stringify({
    href: readiumHrefFromChapter(chapter),
    type: 'application/xhtml+xml',
    locations: {
      progression: ratioFromOffset(chapter, offset),
      cssSelector: paragraph.cssSelector,
    },
    text: {
      before: paragraph.localText.slice(Math.max(0, quoteStart - readiumQuoteContextLength), quoteStart),
      highlight,
      after: paragraph.localText.slice(quoteEnd, quoteEnd + readiumQuoteContextLength),
    },
  });
}

function canUseReadium(book: Book | null) {
  if (Platform.OS !== 'android' || !book?.publicationUri) {
    return false;
  }

  if (book.format === 'epub') {
    return true;
  }

  return book.publicationUri.split(/[?#]/)[0]?.toLowerCase().endsWith('.epub') ?? false;
}

function formatAnnotationTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return '';
  }

  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  const hour = String(date.getHours()).padStart(2, '0');
  const minute = String(date.getMinutes()).padStart(2, '0');
  return `${month}/${day} ${hour}:${minute}`;
}

function SearchExcerpt({ text, query }: { text: string; query: string }) {
  const trimmed = query.trim();
  const matchIndex = trimmed ? text.toLowerCase().indexOf(trimmed.toLowerCase()) : -1;

  if (matchIndex < 0) {
    return (
      <Text numberOfLines={3} style={styles.panelRowMeta}>
        {text}
      </Text>
    );
  }

  return (
    <Text numberOfLines={3} style={styles.panelRowMeta}>
      {text.slice(0, matchIndex)}
      <Text style={styles.searchMatchText}>{text.slice(matchIndex, matchIndex + trimmed.length)}</Text>
      {text.slice(matchIndex + trimmed.length)}
    </Text>
  );
}

function ReaderToolChip({
  icon,
  label,
  active,
  tone = 'secondary',
  onPress,
  chromeTheme,
}: {
  icon: MaterialSymbolName;
  label: string;
  active: boolean;
  tone?: 'primary' | 'secondary';
  onPress: () => void;
  chromeTheme: {
    subtleSurface: string;
    controlBorder: string;
    text: string;
    accent: string;
    accentText: string;
    primaryContainer: string;
    onPrimaryContainer: string;
  };
}) {
  const primary = tone === 'primary';
  const backgroundColor = active ? chromeTheme.accent : primary ? chromeTheme.primaryContainer : chromeTheme.subtleSurface;
  const color = active ? chromeTheme.accentText : primary ? chromeTheme.onPrimaryContainer : chromeTheme.text;

  return (
    <M3Pressable
      captureTouches
      onPress={onPress}
      feedback={active ? 'subtle' : 'standard'}
      accessibilityLabel={label}
      accessibilityState={{ selected: active }}
      style={[
        styles.readerToolChip,
        primary && styles.readerToolChipPrimary,
        { backgroundColor, borderColor: active ? chromeTheme.accent : chromeTheme.controlBorder },
      ]}>
      <MaterialSymbol name={icon} color={color} description={label} decorative size={17} />
      <Text numberOfLines={1} style={[styles.readerToolChipText, { color }]}>
        {label}
      </Text>
    </M3Pressable>
  );
}

function ScrollReaderChapter({
  chapter,
  chapterIndex,
  chapterCount,
  preferences,
  readerTheme,
  onLayout,
  onPress,
}: {
  chapter: Chapter;
  chapterIndex: number;
  chapterCount: number;
  preferences: ReaderPreferences;
  readerTheme: (typeof brand.readerThemes)[ReaderTheme];
  onLayout: (event: LayoutChangeEvent) => void;
  onPress: () => void;
}) {
  const loaded = Boolean(chapter.textContent);
  const paragraphs = useMemo(() => (loaded ? readerParagraphs(chapter, chapterCount) : []), [chapter, chapterCount, loaded]);
  const showHeading = shouldShowChapterHeading(chapter.title, chapterCount);

  return (
    <Pressable onPress={onPress} onLayout={onLayout} style={[styles.scrollChapter, { paddingHorizontal: preferences.margin }]}>
      {showHeading && (
        <View style={styles.scrollChapterHeading}>
          <Text style={[styles.scrollChapterKicker, { color: readerTheme.accent }]}>
            第 {chapterIndex + 1} / {chapterCount} 章
          </Text>
          <Text style={[styles.scrollChapterTitle, { color: readerTheme.text }]}>{chapterLabel(chapter.title)}</Text>
          <View style={[styles.scrollChapterRule, { backgroundColor: readerTheme.line }]} />
        </View>
      )}
      {loaded ? (
        <View style={styles.scrollParagraphStack}>
          {paragraphs.map((paragraph, index) => (
            <Text
              key={`${chapter.id}-${index}`}
              selectable
              style={[
                styles.scrollParagraph,
                {
                  color: readerTheme.text,
                  fontFamily: readerNativeFontFamily(preferences.fontFamily),
                  fontSize: preferences.fontSize,
                  lineHeight: Math.round(preferences.fontSize * preferences.lineHeight),
                },
              ]}>
              {paragraph}
            </Text>
          ))}
        </View>
      ) : (
        <View style={[styles.scrollChapterLoading, { borderColor: readerTheme.line }]}>
          <ActivityIndicator color={readerTheme.accent} />
        </View>
      )}
    </Pressable>
  );
}

export default function ReaderScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const db = useSQLiteContext();
  const insets = useSafeAreaInsets();
  const { width: windowWidth, height: windowHeight } = useWindowDimensions();
  const nativeReaderRef = useRef<InboxReaderViewRef | null>(null);
  const scrollReaderRef = useRef<FlatList<Chapter> | null>(null);
  const scrollChapterLayouts = useRef<Record<string, { y: number; height: number }>>({});
  const pendingScrollNavigation = useRef<{ index: number; ratio: number; animated: boolean } | null>(null);
  const lastProgressSave = useRef(0);
  const latestProgressRatio = useRef(0);
  const latestReadiumLocator = useRef<string | null>(null);
  const pendingReadiumNavigation = useRef<PendingReadiumNavigation | null>(null);
  const [book, setBook] = useState<Book | null>(null);
  const [chapters, setChapters] = useState<Chapter[]>([]);
  const [chapterCache, setChapterCache] = useState<Record<string, Chapter>>({});
  const [currentIndex, setCurrentIndex] = useState(0);
  const [restoreRatio, setRestoreRatio] = useState(0);
  const [preferences, setPreferences] = useState<ReaderPreferences>({
    appThemeMode: 'system',
    readerTheme: 'paper',
    fontFamily: 'system',
    fontSize: 19,
    lineHeight: 1.7,
    margin: 22,
    readingMode: 'scroll',
  });
  const [annotations, setAnnotations] = useState<Annotation[]>([]);
  const [panel, setPanel] = useState<Panel>(null);
  const [annotationFilter, setAnnotationFilter] = useState<AnnotationFilter>('all');
  const [chromeVisible, setChromeVisible] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [noteDraft, setNoteDraft] = useState('');
  const [textSelection, setTextSelection] = useState<TextSelection | null>(null);
  const [noteSelection, setNoteSelection] = useState<TextSelection | null>(null);
  const [activeNoteAnchorKey, setActiveNoteAnchorKey] = useState<string | null>(null);
  const [activeNoteAnchorPoint, setActiveNoteAnchorPoint] = useState<{ x: number; y: number; width: number; height: number } | null>(null);
  const [noteWindowOffset, setNoteWindowOffset] = useState({ x: 0, y: 0 });
  const [keyboardHeight, setKeyboardHeight] = useState(0);
  const [loading, setLoading] = useState(true);
  const [reduceMotion, setReduceMotion] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [pageStatus, setPageStatus] = useState({ pageIndex: 1, pageCount: 1 });

  const currentChapterMeta = chapters[currentIndex];
  const currentChapter = currentChapterMeta ? chapterCache[currentChapterMeta.id] : undefined;
  const useNativeReadium = canUseReadium(book);
  const useContinuousScroll = preferences.readingMode === 'scroll';
  const useNativePageReader = useNativeReadium && !useContinuousScroll;
  const themeToken = brand.readerThemes[preferences.readerTheme];
  const readerTheme = themeToken;
  const chromePanelSurface = preferences.readerTheme === 'night' ? '#171A18' : brand.chrome.surface;
  const chromeSubtleSurface = preferences.readerTheme === 'night' ? 'rgba(255, 255, 255, 0.075)' : brand.chrome.surfaceSoft;
  const chromeBorder = preferences.readerTheme === 'night' ? 'rgba(255, 255, 255, 0.13)' : brand.chrome.border;
  const chromeTheme = {
    surface: chromePanelSurface,
    panelSurface: chromePanelSurface,
    subtleSurface: chromeSubtleSurface,
    border: chromeBorder,
    controlBorder: chromeBorder,
    text: brand.chrome.text,
    muted: brand.chrome.muted,
    accent: brand.chrome.accent,
    accentText: brand.chrome.accentText,
    primaryContainer: brand.chrome.accent,
    onPrimaryContainer: brand.chrome.accentText,
  };
  const panelControlTheme = {
    surface: chromeTheme.subtleSurface,
    surfaceSolid: chromeTheme.panelSurface,
    surfaceContainer: chromeTheme.subtleSurface,
    surfaceContainerHigh: chromeTheme.subtleSurface,
    primaryContainer: chromeTheme.primaryContainer,
    onPrimaryContainer: chromeTheme.onPrimaryContainer,
    text: chromeTheme.text,
    muted: chromeTheme.muted,
    accent: chromeTheme.accent,
    accentText: chromeTheme.accentText,
    line: chromeTheme.controlBorder,
  };
  const noticeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const currentBookmark = useMemo(
    () => annotations.find((annotation) => annotation.type === 'bookmark' && annotation.chapterId === currentChapterMeta?.id),
    [annotations, currentChapterMeta?.id]
  );
  const chapterTitleById = useMemo(() => {
    return new Map(chapters.map((chapter) => [chapter.id, chapter.title]));
  }, [chapters]);
  const filteredAnnotations = useMemo(() => {
    if (annotationFilter === 'all') {
      return annotations;
    }

    return annotations.filter((annotation) => annotation.type === annotationFilter);
  }, [annotationFilter, annotations]);
  const noteAnchors = useMemo<NoteAnchor[]>(() => {
    if (!useNativePageReader) {
      return [];
    }

    const anchors = new Map<string, NoteAnchor>();
    for (const annotation of annotations) {
      if (annotation.type !== 'note' || !annotation.selectedText) {
        continue;
      }

      const fallbackChapter = annotation.chapterId === currentChapter?.id ? currentChapter : undefined;
      const locator = readiumLocatorForAnnotation(annotation, fallbackChapter);
      if (!locator) {
        continue;
      }

      const key = noteAnchorKey(annotation);
      const anchor = anchors.get(key);
      if (anchor) {
        anchor.annotations.push(annotation);
      } else {
        anchors.set(key, {
          key,
          locator,
          selectedText: annotation.selectedText,
          chapterId: annotation.chapterId,
          annotations: [annotation],
        });
      }
    }

    return Array.from(anchors.values()).map((anchor) => ({
      ...anchor,
      annotations: anchor.annotations.sort((left, right) => right.updatedAt.localeCompare(left.updatedAt)),
    }));
  }, [annotations, currentChapter, useNativePageReader]);
  const activeNoteAnchor = useMemo(
    () => noteAnchors.find((anchor) => anchor.key === activeNoteAnchorKey) ?? null,
    [activeNoteAnchorKey, noteAnchors]
  );
  const notePopoverStyle = useMemo(() => {
    const width = Math.min(360, Math.max(280, windowWidth - 28));
    const anchorX = activeNoteAnchorPoint?.x ?? windowWidth / 2;
    const anchorY = activeNoteAnchorPoint?.y ?? Math.min(windowHeight * 0.34, 320);
    const anchorHeight = activeNoteAnchorPoint?.height ?? 20;
    const topLimit = Math.max(insets.top + 12, 72);
    const bottomLimit = windowHeight - insets.bottom - 16;
    const estimatedHeight = Math.min(330, windowHeight * 0.46);
    const belowTop = anchorY + anchorHeight + 12;
    const top =
      belowTop + estimatedHeight <= bottomLimit
        ? belowTop
        : Math.max(topLimit, anchorY - estimatedHeight - 12);

    return {
      left: Math.min(windowWidth - width - 14, Math.max(14, anchorX - width / 2)),
      maxHeight: Math.max(220, Math.min(380, bottomLimit - top)),
      top,
      width,
    };
  }, [activeNoteAnchorPoint, insets.bottom, insets.top, windowHeight, windowWidth]);
  const noteWindowBounds = useMemo(() => {
    const margin = 14;
    if (activeNoteAnchor) {
      const height = Math.min(notePopoverStyle.maxHeight, 330);
      return {
        maxX: windowWidth - notePopoverStyle.left - notePopoverStyle.width - margin,
        maxY: windowHeight - insets.bottom - notePopoverStyle.top - height - margin,
        minX: margin - notePopoverStyle.left,
        minY: Math.max(insets.top + margin, 64) - notePopoverStyle.top,
      };
    }

    const width = Math.min(520, Math.max(0, windowWidth - 24));
    const left = (windowWidth - width) / 2;
    return {
      maxX: windowWidth - left - width - 12,
      maxY: 0,
      minX: 12 - left,
      minY: -windowHeight * 0.48,
    };
  }, [activeNoteAnchor, insets.bottom, insets.top, notePopoverStyle.left, notePopoverStyle.maxHeight, notePopoverStyle.top, notePopoverStyle.width, windowHeight, windowWidth]);
  const clampNoteWindowOffset = useCallback(
    (x: number, y: number) => ({
      x: Math.min(noteWindowBounds.maxX, Math.max(noteWindowBounds.minX, x)),
      y: Math.min(noteWindowBounds.maxY, Math.max(noteWindowBounds.minY, y)),
    }),
    [noteWindowBounds.maxX, noteWindowBounds.maxY, noteWindowBounds.minX, noteWindowBounds.minY]
  );
  const resetNoteWindowOffset = useCallback(() => {
    setNoteWindowOffset({ x: 0, y: 0 });
  }, []);
  const noteWindowPanResponder = useMemo(
    () =>
      PanResponder.create({
        onMoveShouldSetPanResponder: (_event, gesture) => Math.abs(gesture.dx) > 4 || Math.abs(gesture.dy) > 4,
        onPanResponderMove: (_event, gesture) => {
          setNoteWindowOffset(clampNoteWindowOffset(noteWindowOffset.x + gesture.dx, noteWindowOffset.y + gesture.dy));
        },
        onPanResponderRelease: (_event, gesture) => {
          setNoteWindowOffset(clampNoteWindowOffset(noteWindowOffset.x + gesture.dx, noteWindowOffset.y + gesture.dy));
        },
        onPanResponderTerminate: (_event, gesture) => {
          setNoteWindowOffset(clampNoteWindowOffset(noteWindowOffset.x + gesture.dx, noteWindowOffset.y + gesture.dy));
        },
      }),
    [clampNoteWindowOffset, noteWindowOffset.x, noteWindowOffset.y]
  );
  const noteWindowDragStyle = useMemo(
    () => ({ transform: [{ translateX: noteWindowOffset.x }, { translateY: noteWindowOffset.y }] }),
    [noteWindowOffset.x, noteWindowOffset.y]
  );
  const noteComposerBottomInset = keyboardHeight > 0 ? keyboardHeight + 10 : Math.max(12, insets.bottom + 10);
  const readiumDecorations = useMemo<InboxReaderDecoration[]>(() => {
    if (!useNativePageReader) {
      return [];
    }

    const highlights = annotations.flatMap((annotation) => {
      if (annotation.type !== 'highlight' || !annotation.selectedText) {
        return [];
      }

      const fallbackChapter = annotation.chapterId === currentChapter?.id ? currentChapter : undefined;
      const locator = readiumLocatorForAnnotation(annotation, fallbackChapter);
      if (!locator) {
        return [];
      }

      return [{ id: annotation.id, locator, type: annotation.type }];
    });
    const noteBadges = noteAnchors.map((anchor) => ({
      id: anchor.key,
      locator: anchor.locator,
      type: 'note' as const,
      label: anchor.annotations.length > 99 ? '99+' : String(anchor.annotations.length),
    }));

    return [...highlights, ...noteBadges];
  }, [annotations, currentChapter, noteAnchors, useNativePageReader]);
  const annotationCounts = useMemo(() => {
    return annotations.reduce(
      (counts, annotation) => {
        counts.all += 1;
        counts[annotation.type] += 1;
        return counts;
      },
      { all: 0, bookmark: 0, highlight: 0, note: 0 } as Record<AnnotationFilter, number>
    );
  }, [annotations]);
  const chromeTopOffset = Math.max(24, insets.top + 12);
  const chromeBottomOffset = Math.max(16, insets.bottom + 12);
  const bottomDockVisible = chromeVisible && panel === null;
  const panelHeight = panel
    ? Math.min(windowHeight * (panel === 'search' ? 0.62 : 0.74), windowHeight - chromeTopOffset - 32)
    : undefined;
  const selectionMenuStyle = useMemo(() => {
    if (!textSelection) {
      return null;
    }

    const menuWidth = 248;
    const menuHeight = 48;
    const margin = 12;
    const topLimit = insets.top + 88;
    const bottomLimit = windowHeight - chromeBottomOffset - menuHeight - margin;
    const selectionHalfHeight = (textSelection.height ?? 0) / 2;
    const belowSelection = textSelection.y + selectionHalfHeight + margin;
    const aboveSelection = textSelection.y - selectionHalfHeight - menuHeight - margin;
    const top = aboveSelection >= topLimit ? aboveSelection : belowSelection;
    return {
      left: Math.min(windowWidth - menuWidth - 12, Math.max(12, textSelection.x - menuWidth / 2)),
      top: Math.min(bottomLimit, Math.max(topLimit, top)),
      width: menuWidth,
    };
  }, [chromeBottomOffset, insets.top, textSelection, windowHeight, windowWidth]);

  const closePanel = useCallback(() => {
    Keyboard.dismiss();
    setPanel(null);
    setTextSelection(null);
    setNoteSelection(null);
    setActiveNoteAnchorKey(null);
    resetNoteWindowOffset();
  }, [resetNoteWindowOffset]);

  const dismissSelectionNote = useCallback(() => {
    Keyboard.dismiss();
    setNoteDraft('');
    setNoteSelection(null);
    setActiveNoteAnchorKey(null);
    resetNoteWindowOffset();
  }, [resetNoteWindowOffset]);

  const showNotice = useCallback((message: string) => {
    if (noticeTimer.current) {
      clearTimeout(noticeTimer.current);
    }
    setNotice(message);
    noticeTimer.current = setTimeout(() => setNotice(null), 2200);
  }, []);

  const loadReader = useCallback(async () => {
    if (!id) {
      return;
    }

    setLoading(true);
    const { book: nextBook, chapters: nextChapters, progress } = await openBook(db, id);
    const nextPreferences = await getReaderPreferences(db);
    const nextAnnotations = await listAnnotations(db, id);

    const progressIndex = nextChapters.findIndex((chapter) => chapter.id === progress?.chapter_id);
    const nextIndex = progressIndex >= 0 ? progressIndex : 0;
    const initialChapter = nextChapters[nextIndex] ? await getChapter(db, id, nextChapters[nextIndex].id) : null;
    setBook(nextBook);
    setChapters(nextChapters);
    setChapterCache(initialChapter ? { [initialChapter.id]: initialChapter } : {});
    setPreferences(nextPreferences);
    setAnnotations(nextAnnotations);
    setCurrentIndex(nextIndex);
    setRestoreRatio(progress?.scroll_ratio ?? 0);
    latestProgressRatio.current = progress?.scroll_ratio ?? 0;
    pendingScrollNavigation.current = { index: nextIndex, ratio: progress?.scroll_ratio ?? 0, animated: false };
    setLoading(false);
  }, [db, id]);

  useEffect(() => {
    const handle = setTimeout(() => {
      loadReader().catch((error) => {
        setLoading(false);
        Alert.alert('阅读器打开失败', error instanceof Error ? error.message : '无法打开所选书籍。');
      });
    }, 0);

    return () => clearTimeout(handle);
  }, [loadReader]);

  useEffect(() => {
    if (!book || !currentChapterMeta || currentChapter) {
      return;
    }

    let cancelled = false;
    getChapter(db, book.id, currentChapterMeta.id)
      .then((chapter) => {
        if (!cancelled && chapter) {
          setChapterCache((cache) => ({ ...cache, [chapter.id]: chapter }));
        }
      })
      .catch(() => showNotice('章节加载失败，请重试'));

    return () => {
      cancelled = true;
    };
  }, [book, currentChapter, currentChapterMeta, db, showNotice]);

  useEffect(() => {
    if (!book) {
      return;
    }

    const ids = [chapters[currentIndex - 1]?.id, chapters[currentIndex + 1]?.id].filter((chapterId): chapterId is string => Boolean(chapterId && !chapterCache[chapterId]));
    if (!ids.length) {
      return;
    }

    let cancelled = false;
    Promise.all(ids.map((chapterId) => getChapter(db, book.id, chapterId)))
      .then((loadedChapters) => {
        if (cancelled) {
          return;
        }
        setChapterCache((cache) => {
          const next = { ...cache };
          for (const chapter of loadedChapters) {
            if (chapter) {
              next[chapter.id] = chapter;
            }
          }
          return next;
        });
      })
      .catch(() => undefined);

    return () => {
      cancelled = true;
    };
  }, [book, chapterCache, chapters, currentIndex, db]);

  useEffect(() => {
    AccessibilityInfo.isReduceMotionEnabled().then(setReduceMotion);
    const subscription = AccessibilityInfo.addEventListener('reduceMotionChanged', setReduceMotion);
    return () => {
      subscription.remove();
      if (noticeTimer.current) {
        clearTimeout(noticeTimer.current);
      }
    };
  }, []);

  useEffect(() => {
    const showEvent = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvent = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';
    const showSubscription = Keyboard.addListener(showEvent, (event) => setKeyboardHeight(event.endCoordinates.height));
    const hideSubscription = Keyboard.addListener(hideEvent, () => setKeyboardHeight(0));
    return () => {
      showSubscription.remove();
      hideSubscription.remove();
    };
  }, []);

  const flushProgress = useCallback(() => {
    if (!book || !currentChapterMeta) {
      return;
    }

    void saveProgress(db, book.id, currentChapterMeta.id, latestProgressRatio.current);
  }, [book, currentChapterMeta, db]);

  const handleReaderBack = useCallback(() => {
    flushProgress();
    router.back();
  }, [flushProgress]);

  useEffect(() => {
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      if (activeNoteAnchorKey) {
        setActiveNoteAnchorKey(null);
        return true;
      }

      if (noteSelection) {
        dismissSelectionNote();
        return true;
      }

      if (panel) {
        closePanel();
        return true;
      }

      flushProgress();
      return false;
    });

    return () => subscription.remove();
  }, [activeNoteAnchorKey, closePanel, dismissSelectionNote, flushProgress, noteSelection, panel]);

  useEffect(() => {
    let cancelled = false;
    const handle = setTimeout(() => {
      if (!book || !searchQuery.trim()) {
        setSearchResults([]);
        return;
      }

      searchBook(db, book.id, searchQuery)
        .then((results) => {
          if (!cancelled) {
            setSearchResults(results);
          }
        })
        .catch(() => {
          if (!cancelled) {
            setSearchResults([]);
          }
        });
    }, 180);

    return () => {
      cancelled = true;
      clearTimeout(handle);
    };
  }, [book, db, searchQuery]);

  const clearPendingReadiumNavigation = useCallback(() => {
    const pending = pendingReadiumNavigation.current;
    if (pending) {
      clearTimeout(pending.timeout);
      pendingReadiumNavigation.current = null;
    }
  }, []);

  useEffect(() => clearPendingReadiumNavigation, [clearPendingReadiumNavigation]);

  const restorePendingScrollNavigation = useCallback(() => {
    const pending = pendingScrollNavigation.current;
    if (!pending || preferences.readingMode !== 'scroll') {
      return;
    }

    const chapter = chapters[pending.index];
    const layout = chapter ? scrollChapterLayouts.current[chapter.id] : undefined;
    if (!layout || !scrollReaderRef.current) {
      return;
    }

    const readableHeight = Math.max(0, layout.height - windowHeight * 0.45);
    scrollReaderRef.current.scrollToOffset({
      animated: pending.animated,
      offset: Math.max(0, layout.y + readableHeight * clampRatio(pending.ratio)),
    });
    pendingScrollNavigation.current = null;
  }, [chapters, preferences.readingMode, windowHeight]);

  const handleScrollChapterLayout = useCallback(
    (chapterId: string, event: LayoutChangeEvent) => {
      const { y, height } = event.nativeEvent.layout;
      scrollChapterLayouts.current[chapterId] = { y, height };
      restorePendingScrollNavigation();
    },
    [restorePendingScrollNavigation]
  );

  const handleScrollReaderScroll = useCallback(
    (event: NativeSyntheticEvent<NativeScrollEvent>) => {
      if (!book || preferences.readingMode !== 'scroll') {
        return;
      }

      const probeY = event.nativeEvent.contentOffset.y + windowHeight * 0.34;
      let nextIndex = currentIndex;
      let nextRatio = latestProgressRatio.current;

      for (let index = 0; index < chapters.length; index += 1) {
        const chapter = chapters[index];
        const layout = scrollChapterLayouts.current[chapter.id];
        if (!layout) {
          continue;
        }
        if (probeY >= layout.y && probeY <= layout.y + layout.height) {
          nextIndex = index;
          nextRatio = clampRatio((probeY - layout.y) / Math.max(1, layout.height));
          break;
        }
        if (probeY > layout.y + layout.height) {
          nextIndex = index;
          nextRatio = 0.96;
        }
      }

      const nextChapter = chapters[nextIndex];
      if (!nextChapter) {
        return;
      }

      latestProgressRatio.current = nextRatio;
      if (nextIndex !== currentIndex) {
        setCurrentIndex(nextIndex);
        setRestoreRatio(nextRatio);
        setPageStatus({ pageIndex: 1, pageCount: 1 });
      }

      const now = Date.now();
      if (now - lastProgressSave.current < 1200) {
        return;
      }
      lastProgressSave.current = now;
      void saveProgress(db, book.id, nextChapter.id, nextRatio);
    },
    [book, chapters, currentIndex, db, preferences.readingMode, windowHeight]
  );

  const goToChapter = useCallback(
    async (index: number, ratio = 0) => {
      if (!book || !chapters[index]) {
        return;
      }
      const nextChapter = chapters[index];
      const targetRatio = clampRatio(ratio);
      if (useNativePageReader) {
        clearPendingReadiumNavigation();
        const token = Date.now();
        const timeout = setTimeout(() => {
          if (pendingReadiumNavigation.current?.token === token) {
            pendingReadiumNavigation.current = null;
            showNotice('章节跳转失败');
          }
        }, 2200);
        pendingReadiumNavigation.current = { index, ratio: targetRatio, token, timeout };
        const jumped = Boolean(await nativeReaderRef.current?.goToReadingOrder(index, targetRatio, false).catch(() => false));
        if (!jumped) {
          clearPendingReadiumNavigation();
          showNotice('章节跳转失败');
          return;
        }
        clearPendingReadiumNavigation();
        setCurrentIndex(index);
        setRestoreRatio(targetRatio);
        setPageStatus({ pageIndex: 1, pageCount: 1 });
        setPanel(null);
        setTextSelection(null);
        setNoteSelection(null);
        setActiveNoteAnchorKey(null);
        latestProgressRatio.current = targetRatio;
        void saveProgress(db, book.id, nextChapter.id, targetRatio);
        return;
      }
      pendingScrollNavigation.current = { index, ratio: targetRatio, animated: false };
      setCurrentIndex(index);
      setRestoreRatio(targetRatio);
      setPageStatus({ pageIndex: 1, pageCount: 1 });
      setPanel(null);
      setTextSelection(null);
      setNoteSelection(null);
      setActiveNoteAnchorKey(null);
      latestProgressRatio.current = targetRatio;
      void saveProgress(db, book.id, nextChapter.id, targetRatio);
      requestAnimationFrame(restorePendingScrollNavigation);
    },
    [book, chapters, clearPendingReadiumNavigation, db, restorePendingScrollNavigation, showNotice, useNativePageReader]
  );

  const handleReadiumLocationChange = useCallback(
    (event: { nativeEvent: InboxReaderLocationEvent }) => {
      if (!book) {
        return;
      }

      const href = readiumHrefFromLocator(event.nativeEvent.locator);
      latestReadiumLocator.current = event.nativeEvent.locator;
      const nextIndex = chapters.findIndex((chapter) => readiumHrefMatchesChapter(chapter, href));
      if (nextIndex < 0) {
        return;
      }

      const ratio = clampRatio(event.nativeEvent.progression ?? 0);
      const pending = pendingReadiumNavigation.current;
      if (pending?.index === nextIndex) {
        clearPendingReadiumNavigation();
        setRestoreRatio(pending.ratio);
        setPageStatus({ pageIndex: 1, pageCount: 1 });
        setPanel(null);
        setTextSelection(null);
        setNoteSelection(null);
        setActiveNoteAnchorKey(null);
      }
      latestProgressRatio.current = ratio;
      if (nextIndex !== currentIndex) {
        setCurrentIndex(nextIndex);
      }

      const now = Date.now();
      if (now - lastProgressSave.current < 1200) {
        return;
      }
      lastProgressSave.current = now;
      void saveProgress(db, book.id, chapters[nextIndex].id, ratio);
    },
    [book, chapters, clearPendingReadiumNavigation, currentIndex, db]
  );

  const handleReadiumTap = useCallback(
    (event: { nativeEvent: InboxReaderTapEvent }) => {
      if (activeNoteAnchorKey) {
        setActiveNoteAnchorKey(null);
        setChromeVisible(false);
        return;
      }
      if (noteSelection) {
        dismissSelectionNote();
        setChromeVisible(false);
        return;
      }
      if (chromeVisible || panel || textSelection) {
        closePanel();
        setChromeVisible(false);
        return;
      }
      if (preferences.readingMode === 'page') {
        if (event.nativeEvent.zone === 'left') {
          void nativeReaderRef.current?.goBackward(true);
          return;
        }
        if (event.nativeEvent.zone === 'right') {
          void nativeReaderRef.current?.goForward(true);
          return;
        }
      }
      setChromeVisible((visible) => !visible);
    },
    [activeNoteAnchorKey, chromeVisible, closePanel, dismissSelectionNote, noteSelection, panel, preferences.readingMode, textSelection]
  );

  const handleReadiumDecorationPress = useCallback(
    (event: { nativeEvent: InboxReaderDecorationPressEvent }) => {
      const noteAnchor = noteAnchors.find((anchor) => anchor.key === event.nativeEvent.id);
      if (noteAnchor) {
        setTextSelection(null);
        setNoteSelection(null);
        setPanel(null);
        setChromeVisible(false);
        setActiveNoteAnchorPoint({
          height: typeof event.nativeEvent.height === 'number' ? event.nativeEvent.height : 20,
          width: typeof event.nativeEvent.width === 'number' ? event.nativeEvent.width : 20,
          x: typeof event.nativeEvent.x === 'number' ? event.nativeEvent.x : windowWidth / 2,
          y: typeof event.nativeEvent.y === 'number' ? event.nativeEvent.y : Math.min(windowHeight * 0.34, 320),
        });
        resetNoteWindowOffset();
        setActiveNoteAnchorKey(noteAnchor.key);
        return;
      }

      const annotation = annotations.find((item) => item.id === event.nativeEvent.id);
      if (!annotation) {
        return;
      }

      setTextSelection(null);
      setNoteSelection(null);
      setAnnotationFilter(annotation.type === 'note' ? 'note' : annotation.type === 'highlight' ? 'highlight' : 'all');
      setPanel('notes');
      setChromeVisible(true);
    },
    [annotations, noteAnchors, resetNoteWindowOffset, windowHeight, windowWidth]
  );

  const handleReadiumExternalLink = useCallback(
    async (event: { nativeEvent: InboxReaderExternalLinkEvent }) => {
      const url = event.nativeEvent.url;
      if (!url) {
        return;
      }

      try {
        await Linking.openURL(url);
      } catch {
        showNotice('外部链接打开失败');
      }
    },
    [showNotice]
  );

  const handleReadiumSelectionChange = useCallback(
    (event: { nativeEvent: Partial<InboxReaderSelection> }) => {
      const selection = event.nativeEvent;
      const selectedText = selection.selectedText?.trim();
      if (!selection.locator || !selectedText) {
        setTextSelection(null);
        return;
      }

      Keyboard.dismiss();
      setPanel(null);
      setChromeVisible(false);
      setTextSelection({
        selectedText,
        offset: 0,
        x: typeof selection.x === 'number' ? selection.x : windowWidth / 2,
        y: typeof selection.y === 'number' ? selection.y : windowHeight / 2,
        height: typeof selection.height === 'number' ? selection.height : undefined,
        locator: selection.locator,
      });
    },
    [windowHeight, windowWidth]
  );

  const goToSearchResult = useCallback(
    async (result: SearchResult) => {
      const chapterIndex = chapters.findIndex((chapter) => chapter.id === result.chapterId);
      if (chapterIndex < 0) {
        showNotice('没有找到匹配章节');
        return;
      }

      if (book && useNativePageReader) {
        const loadedChapter = chapterCache[result.chapterId] ?? (await getChapter(db, book.id, result.chapterId));
        if (!loadedChapter) {
          showNotice('命中章节加载失败');
          return;
        }

        if (!chapterCache[result.chapterId]) {
          setChapterCache((cache) => ({ ...cache, [loadedChapter.id]: loadedChapter }));
        }

        const ratio = ratioFromOffset(loadedChapter, result.matchOffset);
        const queryText = searchQuery.trim();
        const highlight = queryText ? loadedChapter.textContent.slice(result.matchOffset, result.matchOffset + queryText.length) : undefined;
        const locator = readiumLocatorForOffset(loadedChapter, result.matchOffset, highlight);
        setCurrentIndex(chapterIndex);
        setRestoreRatio(ratio);
        setPageStatus({ pageIndex: 1, pageCount: 1 });
        setPanel(null);
        setTextSelection(null);
        setNoteSelection(null);
        latestProgressRatio.current = ratio;
        latestReadiumLocator.current = locator;
        await nativeReaderRef.current?.goToLocator(locator, true).catch(() => showNotice('搜索跳转失败'));
        await saveProgress(db, book.id, loadedChapter.id, ratio);
        showNotice('已跳到命中位置');
        return;
      }

      goToChapter(chapterIndex, ratioFromOffset(chapters[chapterIndex], result.matchOffset));
      showNotice('已跳到命中位置');
    },
    [book, chapterCache, chapters, db, goToChapter, searchQuery, showNotice, useNativePageReader]
  );

  const goToAnnotation = useCallback(
    async (annotation: Annotation) => {
      const chapterIndex = chapters.findIndex((chapter) => chapter.id === annotation.chapterId);
      if (chapterIndex < 0) {
        showNotice('没有找到标注所在章节');
        return;
      }

      const position = parseAnnotationPosition(annotation.position);
      if (book && useNativePageReader) {
        const loadedChapter = chapterCache[annotation.chapterId] ?? (await getChapter(db, book.id, annotation.chapterId));
        const locator = loadedChapter ? readiumLocatorForAnnotation(annotation, loadedChapter) ?? position.locator : position.locator;
        if (!locator) {
          showNotice('标注位置已失效');
          return;
        }

        if (loadedChapter && !chapterCache[annotation.chapterId]) {
          setChapterCache((cache) => ({ ...cache, [loadedChapter.id]: loadedChapter }));
        }

        const target = chapterFromReadiumLocator(chapters, locator);
        const ratio = clampRatio(parseReadiumLocator(locator)?.locations?.progression ?? (loadedChapter ? ratioFromOffset(loadedChapter, position.offset) : 0));
        if (target) {
          setCurrentIndex(target.index);
        }
        setPanel(null);
        setTextSelection(null);
        setNoteSelection(null);
        latestProgressRatio.current = ratio;
        latestReadiumLocator.current = locator;
        await nativeReaderRef.current?.goToLocator(locator, true).catch(() => showNotice('标注跳转失败'));
        if (target && book) {
          await saveProgress(db, book.id, target.chapter.id, ratio);
        }
        showNotice(`已跳到${annotationLabels[annotation.type]}`);
        return;
      }

      goToChapter(chapterIndex, clampRatio(parseReadiumLocator(position.locator)?.locations?.progression ?? ratioFromOffset(chapters[chapterIndex], position.offset)));
      showNotice(`已跳到${annotationLabels[annotation.type]}`);
    },
    [book, chapterCache, chapters, db, goToChapter, showNotice, useNativePageReader]
  );

  const copySelectedText = useCallback(async () => {
    if (!textSelection) {
      return;
    }

    const copied = await Clipboard.setStringAsync(textSelection.selectedText);
    setTextSelection(null);
    await nativeReaderRef.current?.clearSelection?.();
    showNotice(copied ? '已复制' : '复制失败，请重试');
  }, [showNotice, textSelection]);

  const saveSelectedHighlight = useCallback(async () => {
    if (!book || !currentChapterMeta || !textSelection) {
      return;
    }

    const selection = textSelection;
    setTextSelection(null);
    await nativeReaderRef.current?.clearSelection?.();
    const targetChapter = selection.locator
      ? chapterFromReadiumLocator(chapters, selection.locator)?.chapter ?? currentChapterMeta
      : currentChapterMeta;
    await createAnnotation(db, {
      bookId: book.id,
      chapterId: targetChapter.id,
      type: 'highlight',
      selectedText: selection.selectedText,
      color: '#f6d46a',
      position: JSON.stringify({ offset: selection.offset, locator: selection.locator, quote: selection.selectedText.slice(0, 140) }),
    });
    setAnnotations(await listAnnotations(db, book.id));
    showNotice('已保存划线');
  }, [book, chapters, currentChapterMeta, db, showNotice, textSelection]);

  const startSelectionNote = useCallback(async () => {
    if (!textSelection) {
      return;
    }

    setNoteSelection(textSelection);
    setNoteDraft('');
    setTextSelection(null);
    await nativeReaderRef.current?.clearSelection?.();
    setPanel(null);
    setChromeVisible(false);
    resetNoteWindowOffset();
  }, [resetNoteWindowOffset, textSelection]);

  const initialReadiumLocator = useMemo(
    () => (currentChapterMeta ? readiumLocatorForChapter(currentChapterMeta, restoreRatio) : null),
    [currentChapterMeta, restoreRatio]
  );

  const saveNote = useCallback(async () => {
    if (!book || !currentChapterMeta || !noteDraft.trim()) {
      return;
    }

    const noteChapter = noteSelection?.locator
      ? chapterFromReadiumLocator(chapters, noteSelection.locator)?.chapter ?? currentChapterMeta
      : currentChapterMeta;
    await createAnnotation(db, {
      bookId: book.id,
      chapterId: noteChapter.id,
      type: 'note',
      selectedText: noteSelection?.selectedText,
      noteText: noteDraft.trim(),
      position: JSON.stringify(
        noteSelection
          ? { offset: noteSelection.offset, locator: noteSelection.locator, quote: noteSelection.selectedText.slice(0, 140) }
          : { chapterId: currentChapterMeta.id }
      ),
    });
    const wasSelectionNote = Boolean(noteSelection);
    setNoteDraft('');
    setNoteSelection(null);
    Keyboard.dismiss();
    setAnnotations(await listAnnotations(db, book.id));
    showNotice('笔记已保存');
    if (wasSelectionNote) {
      setPanel(null);
      setChromeVisible(false);
      return;
    }
    setPanel('notes');
  }, [book, chapters, currentChapterMeta, db, noteDraft, noteSelection, showNotice]);

  const startNoteForActiveAnchor = useCallback(() => {
    if (!activeNoteAnchor) {
      return;
    }

    setNoteSelection({
      selectedText: activeNoteAnchor.selectedText,
      offset: 0,
      x: windowWidth / 2,
      y: windowHeight / 2,
      locator: activeNoteAnchor.locator,
    });
    setNoteDraft('');
    setActiveNoteAnchorKey(null);
    setActiveNoteAnchorPoint(null);
    setPanel(null);
    setChromeVisible(false);
    resetNoteWindowOffset();
  }, [activeNoteAnchor, resetNoteWindowOffset, windowHeight, windowWidth]);

  const addBookmark = useCallback(async () => {
    if (!book || !currentChapterMeta) {
      return;
    }

    if (currentBookmark) {
      await deleteAnnotation(db, currentBookmark.id);
      setAnnotations(await listAnnotations(db, book.id));
      showNotice('已取消本章书签');
      return;
    }

    await createAnnotation(db, {
      bookId: book.id,
      chapterId: currentChapterMeta.id,
      type: 'bookmark',
      selectedText: currentChapterMeta.title,
      position: JSON.stringify({ chapterId: currentChapterMeta.id, locator: useNativePageReader ? latestReadiumLocator.current : undefined }),
    });
    setAnnotations(await listAnnotations(db, book.id));
    showNotice('已加入本章书签');
    setPanel('notes');
  }, [book, currentBookmark, currentChapterMeta, db, showNotice, useNativePageReader]);

  const updatePreference = useCallback(
    async (next: ReaderPreferences) => {
      const switchingMode = next.readingMode !== preferences.readingMode;
      setRestoreRatio(latestProgressRatio.current);
      if (switchingMode) {
        setTextSelection(null);
        setNoteSelection(null);
        setActiveNoteAnchorKey(null);
        setActiveNoteAnchorPoint(null);
        void nativeReaderRef.current?.clearSelection?.();
      }
      if (next.readingMode === 'scroll') {
        pendingScrollNavigation.current = { index: currentIndex, ratio: latestProgressRatio.current, animated: false };
      }
      setPreferences(next);
      setPageStatus({ pageIndex: 1, pageCount: 1 });
      await updateReaderPreferences(db, next);
      requestAnimationFrame(restorePendingScrollNavigation);
    },
    [currentIndex, db, preferences.readingMode, restorePendingScrollNavigation]
  );

  if (loading) {
    return (
      <M3Screen key={`reader-loading-${preferences.readerTheme}`} theme={themeToken} backgroundSource={readerThemeAssets[preferences.readerTheme].background}>
        <View style={styles.stateWrap}>
          <M3StatePanel theme={themeToken} title="正在打开阅读器" body="正在恢复章节、主题和阅读进度。" artwork={<ActivityIndicator color={themeToken.accent} />} />
        </View>
      </M3Screen>
    );
  }

  if (!book || !currentChapterMeta) {
    return (
      <M3Screen key={`reader-missing-${preferences.readerTheme}`} theme={themeToken} backgroundSource={readerThemeAssets[preferences.readerTheme].background}>
        <View style={styles.stateWrap}>
          <M3StatePanel
            theme={themeToken}
            title="未找到这本书"
            body="这本书可能已被删除，或本机数据库仍在整理。"
            artwork={<MaterialSymbol name="error" color={themeToken.accent} description="未找到这本书" decorative size={28} />}>
            <IconButton
              icon="chevron.left"
              label="返回书架"
              tone="quiet"
              tintColor={themeToken.text}
              style={{ backgroundColor: themeToken.surfaceContainerHigh, borderColor: themeToken.line }}
              onPress={handleReaderBack}
            />
          </M3StatePanel>
        </View>
      </M3Screen>
    );
  }

  if (!useNativeReadium && preferences.readingMode === 'page') {
    return (
      <M3Screen key={`reader-readium-placeholder-${preferences.readerTheme}`} theme={themeToken} backgroundSource={readerThemeAssets[preferences.readerTheme].background}>
        <View style={styles.stateWrap}>
          <M3StatePanel
            theme={themeToken}
            title="阅读器占位"
            body={Platform.OS === 'android' ? '旧 WebView 引擎已移除。请重新导入这本书生成 Readium EPUB。' : '旧 WebView 引擎已移除；此平台的 Readium 阅读器后续接入。'}
            artwork={<MaterialSymbol name="error" color={themeToken.accent} description="阅读器占位" decorative size={28} />}>
            <IconButton
              icon="chevron.left"
              label="返回书架"
              tone="quiet"
              tintColor={themeToken.text}
              style={{ backgroundColor: themeToken.surfaceContainerHigh, borderColor: themeToken.line }}
              onPress={handleReaderBack}
            />
          </M3StatePanel>
        </View>
      </M3Screen>
    );
  }

  return (
    <View style={[styles.screen, { backgroundColor: readerTheme.background }]}>
      <Link.AppleZoomTarget>
        <View style={styles.readerCanvas}>
          {useContinuousScroll ? (
            <FlatList
              ref={scrollReaderRef}
              data={chapters}
              keyExtractor={(chapter) => chapter.id}
              extraData={chapterCache}
              initialScrollIndex={currentIndex}
              keyboardShouldPersistTaps="handled"
              onContentSizeChange={restorePendingScrollNavigation}
              onScroll={handleScrollReaderScroll}
              onScrollToIndexFailed={(info) => {
                scrollReaderRef.current?.scrollToOffset({ animated: false, offset: Math.max(0, info.averageItemLength * info.index) });
                requestAnimationFrame(restorePendingScrollNavigation);
              }}
              renderItem={({ item, index }) => (
                <ScrollReaderChapter
                  chapter={chapterCache[item.id] ?? item}
                  chapterIndex={index}
                  chapterCount={chapters.length}
                  preferences={preferences}
                  readerTheme={readerTheme}
                  onLayout={(event) => handleScrollChapterLayout(item.id, event)}
                  onPress={() => {
                    if (chromeVisible || panel || textSelection) {
                      closePanel();
                      setChromeVisible(false);
                      return;
                    }
                    setChromeVisible((visible) => !visible);
                  }}
                />
              )}
              scrollEventThrottle={120}
              style={[styles.readerView, { backgroundColor: readerTheme.background }]}
              contentContainerStyle={[
                styles.scrollReaderContent,
                {
                  paddingBottom: Math.max(72, insets.bottom + 64),
                  paddingTop: Math.max(32, insets.top + 28),
                },
              ]}
            />
          ) : (
            <InboxReaderView
              ref={nativeReaderRef}
              key={`readium-${book.id}-${book.publicationUri}-${preferences.readingMode}`}
              fileUri={book.publicationUri ?? book.fileUri}
              initialLocator={initialReadiumLocator}
              initialReadingOrderIndex={currentIndex}
              initialProgression={restoreRatio}
              preferences={preferences}
              decorations={readiumDecorations}
              onLocationChange={handleReadiumLocationChange}
              onSelectionChange={handleReadiumSelectionChange}
              onTap={handleReadiumTap}
              onDecorationPress={handleReadiumDecorationPress}
              onError={(event) => showNotice(event.nativeEvent.message)}
              onExternalLink={handleReadiumExternalLink}
              style={[styles.readerView, { backgroundColor: readerTheme.background }]}
            />
          )}
        </View>
      </Link.AppleZoomTarget>

      {textSelection && selectionMenuStyle && (
        <Animated.View
          entering={reduceMotion ? FadeIn.duration(80) : FadeIn.duration(120)}
          exiting={reduceMotion ? FadeOut.duration(80) : FadeOut.duration(90)}
          style={[styles.selectionToolbar, selectionMenuStyle, { backgroundColor: readerTheme.surfaceSolid, borderColor: readerTheme.line }]}>
          <M3Pressable captureTouches onPress={copySelectedText} feedback="subtle" accessibilityLabel="复制选中内容" style={styles.selectionToolButton}>
            <MaterialSymbol name="copy" color={readerTheme.accent} description="复制" decorative size={17} />
            <Text style={[styles.selectionToolText, { color: readerTheme.text }]}>复制</Text>
          </M3Pressable>
          <View style={[styles.selectionToolDivider, { backgroundColor: readerTheme.line }]} />
          <M3Pressable captureTouches onPress={saveSelectedHighlight} feedback="subtle" accessibilityLabel="保存划线" style={styles.selectionToolButton}>
            <MaterialSymbol name="highlighter" color={readerTheme.accent} description="划线" decorative size={17} />
            <Text style={[styles.selectionToolText, { color: readerTheme.text }]}>划线</Text>
          </M3Pressable>
          <View style={[styles.selectionToolDivider, { backgroundColor: readerTheme.line }]} />
          <M3Pressable captureTouches onPress={startSelectionNote} feedback="subtle" accessibilityLabel="添加笔记" style={styles.selectionToolButton}>
            <MaterialSymbol name="note" color={readerTheme.accent} description="笔记" decorative size={17} />
            <Text style={[styles.selectionToolText, { color: readerTheme.text }]}>笔记</Text>
          </M3Pressable>
        </Animated.View>
      )}

      {chromeVisible && (
        <Animated.View
          entering={reduceMotion ? FadeIn.duration(80) : m3Motion.slideChromeUp()}
          exiting={reduceMotion ? FadeOut.duration(80) : m3Motion.slideOutUp()}
          style={[styles.topChrome, { top: chromeTopOffset }]}>
          <AdaptiveSurface style={[styles.topBar, { backgroundColor: chromeTheme.surface, borderColor: chromeTheme.border }]}>
            <IconButton
              icon="chevron.left"
              label="返回"
              tone="quiet"
              size="icon"
              tintColor={chromeTheme.text}
              style={[styles.backButton, { backgroundColor: chromeTheme.subtleSurface, borderColor: chromeTheme.controlBorder }]}
              onPress={handleReaderBack}
            />
            <View style={styles.titleStack}>
              <Text numberOfLines={1} style={[styles.chromeTitle, { color: chromeTheme.text }]}>
                {bookTitleLabel(book.title)}
              </Text>
              <Text numberOfLines={1} style={[styles.chromeMeta, { color: chromeTheme.muted }]}>
                {chapterLabel(currentChapterMeta.title)}
                {preferences.readingMode === 'page' && pageStatus.pageCount > 1 ? ` · ${pageStatus.pageIndex}/${pageStatus.pageCount} 页` : ''}
              </Text>
            </View>
            <Text style={[styles.chapterCount, { color: chromeTheme.accent }]}>
              {currentIndex + 1}/{chapters.length}
            </Text>
          </AdaptiveSurface>
        </Animated.View>
      )}

      {bottomDockVisible && (
        <Animated.View
          entering={reduceMotion ? FadeIn.duration(80) : m3Motion.slideChromeDown()}
          exiting={reduceMotion ? FadeOut.duration(80) : m3Motion.slideOutDown()}
          style={[styles.bottomChrome, { bottom: chromeBottomOffset }]}>
          <AdaptiveSurface style={[styles.readerDock, { backgroundColor: chromeTheme.surface, borderColor: chromeTheme.border }]}>
            <View style={[styles.chapterStrip, { backgroundColor: chromeTheme.subtleSurface, borderColor: chromeTheme.controlBorder }]}>
              <M3Pressable
                captureTouches
                disabled={currentIndex === 0}
                onPress={() => goToChapter(Math.max(0, currentIndex - 1), preferences.readingMode === 'page' ? 1 : 0)}
                feedback="subtle"
                style={[styles.chapterTextButton, currentIndex === 0 && styles.disabledChapterButton]}>
                <Text style={[styles.chapterTextButtonText, { color: chromeTheme.text }]}>上一章</Text>
              </M3Pressable>
              <M3Pressable captureTouches onPress={() => setPanel(panel === 'toc' ? null : 'toc')} feedback="subtle" style={styles.chapterCenter}>
                <Text numberOfLines={1} style={[styles.chapterCenterTitle, { color: chromeTheme.text }]}>
                  {chapterLabel(currentChapterMeta.title)}
                </Text>
                <Text style={[styles.chapterCenterMeta, { color: chromeTheme.muted }]}>
                  {currentIndex + 1}/{chapters.length}
                  {preferences.readingMode === 'page' && pageStatus.pageCount > 1 ? ` · ${pageStatus.pageIndex}/${pageStatus.pageCount} 页` : ''}
                </Text>
              </M3Pressable>
              <M3Pressable
                captureTouches
                disabled={currentIndex >= chapters.length - 1}
                onPress={() => goToChapter(Math.min(chapters.length - 1, currentIndex + 1), 0)}
                feedback="subtle"
                style={[styles.chapterTextButton, currentIndex >= chapters.length - 1 && styles.disabledChapterButton]}>
                <Text style={[styles.chapterTextButtonText, { color: chromeTheme.text }]}>下一章</Text>
              </M3Pressable>
            </View>
            <View style={styles.readerToolRow}>
              <ReaderToolChip icon="list.bullet" label="目录" tone="primary" active={panel === 'toc'} chromeTheme={chromeTheme} onPress={() => setPanel(panel === 'toc' ? null : 'toc')} />
              <ReaderToolChip icon="magnifyingglass" label="搜索" active={panel === 'search'} chromeTheme={chromeTheme} onPress={() => setPanel(panel === 'search' ? null : 'search')} />
              <ReaderToolChip icon="note" label="标注" active={panel === 'notes'} chromeTheme={chromeTheme} onPress={() => setPanel(panel === 'notes' ? null : 'notes')} />
              <ReaderToolChip icon="textformat.size" label="样式" active={panel === 'settings'} chromeTheme={chromeTheme} onPress={() => setPanel(panel === 'settings' ? null : 'settings')} />
            </View>
          </AdaptiveSurface>
        </Animated.View>
      )}

      {panel && (
        <Animated.View
          entering={reduceMotion ? FadeIn.duration(80) : m3Motion.slideChromeDown()}
          exiting={reduceMotion ? FadeOut.duration(80) : m3Motion.slideOutDown()}
          style={[styles.panel, { bottom: chromeBottomOffset }, panel === 'search' ? { height: panelHeight } : { maxHeight: panelHeight }]}>
          <AdaptiveSurface style={[styles.panelSurface, panel === 'search' && styles.panelSurfaceFill, { backgroundColor: chromeTheme.panelSurface, borderColor: chromeTheme.border }]}>
            <View style={[styles.panelHandle, { backgroundColor: chromeTheme.controlBorder }]} />
            <View style={styles.panelHeader}>
              <View style={styles.panelTitleStack}>
                <View style={styles.panelTitleRow}>
                  <MaterialSymbol name={panelIcon(panel)} color={chromeTheme.accent} description={panelTitle(panel)} decorative size={20} />
                  <Text style={[styles.panelTitle, { color: chromeTheme.text }]}>{panelTitle(panel)}</Text>
                </View>
              </View>
              <IconButton
                icon="close"
                label="关闭"
                tone="quiet"
                size="icon"
                tintColor={chromeTheme.text}
                onPress={closePanel}
                style={[styles.closeButton, { backgroundColor: chromeTheme.subtleSurface, borderColor: chromeTheme.controlBorder }]}
              />
            </View>

            <View style={[styles.panelTabs, { backgroundColor: chromeTheme.subtleSurface, borderColor: chromeTheme.controlBorder }]}>
              {readerPanelTabs.map((item) => {
                const active = panel === item.value;
                return (
                  <M3Pressable
                    key={item.value}
                    captureTouches
                    accessibilityRole="button"
                    accessibilityState={{ selected: active }}
                    accessibilityLabel={item.label}
                    onPress={() => setPanel(item.value)}
                    feedback={active ? 'subtle' : 'standard'}
                    style={[styles.panelTab, active && { backgroundColor: chromeTheme.accent }]}>
                    <MaterialSymbol name={item.icon} color={active ? chromeTheme.accentText : chromeTheme.text} description={item.label} decorative size={17} />
                    <Text numberOfLines={1} style={[styles.panelTabText, { color: active ? chromeTheme.accentText : chromeTheme.text }]}>
                      {item.label}
                    </Text>
                  </M3Pressable>
                );
              })}
            </View>

            {panel === 'toc' && (
              <View style={styles.panelBody}>
                <ScrollView contentContainerStyle={styles.panelList}>
                  {chapters.map((chapter, index) => {
                    const active = index === currentIndex;
                    return (
                      <M3Pressable
                        key={chapter.id}
                        onPress={() => goToChapter(index)}
                        feedback={active ? 'subtle' : 'standard'}
                        accessibilityRole="button"
                        accessibilityState={{ selected: active }}
                        style={[
                          styles.panelRow,
                          styles.tocRow,
                          { backgroundColor: active ? chromeTheme.primaryContainer : chromeTheme.subtleSurface, borderColor: active ? chromeTheme.accent : chromeTheme.controlBorder },
                        ]}>
                        <Text style={[styles.tocIndex, { color: active ? chromeTheme.onPrimaryContainer : chromeTheme.muted }]}>
                          {String(index + 1).padStart(2, '0')}
                        </Text>
                        <View style={styles.tocContent}>
                          <View style={styles.tocTitleRow}>
                            <Text numberOfLines={2} style={[styles.panelRowTitle, { color: active ? chromeTheme.onPrimaryContainer : chromeTheme.text }]}>
                              {chapterLabel(chapter.title)}
                            </Text>
                            {active && (
                              <View style={[styles.currentBadge, { backgroundColor: chromeTheme.accent }]}>
                                <Text style={[styles.currentBadgeText, { color: chromeTheme.accentText }]}>当前</Text>
                              </View>
                            )}
                          </View>
                          <Text style={[styles.panelRowMeta, { color: active ? chromeTheme.onPrimaryContainer : chromeTheme.muted }]}>
                            {chapter.wordCount.toLocaleString()} 字
                          </Text>
                        </View>
                      </M3Pressable>
                    );
                  })}
                </ScrollView>
              </View>
            )}

            {panel === 'search' && (
              <View style={[styles.panelBody, styles.panelBodyFill]}>
                <TextInput
                  value={searchQuery}
                  onChangeText={setSearchQuery}
                  placeholder="搜索这本书里的文字"
                  placeholderTextColor={chromeTheme.muted}
                  returnKeyType="search"
                  onSubmitEditing={Keyboard.dismiss}
                  style={[styles.panelInput, { backgroundColor: chromeTheme.subtleSurface, borderColor: chromeTheme.controlBorder, color: chromeTheme.text }]}
                />
                <ScrollView keyboardShouldPersistTaps="handled" style={styles.panelScroll} contentContainerStyle={styles.panelList}>
                  {searchResults.map((result) => (
                    <M3Pressable
                      key={`${result.chapterId}-${result.matchOffset}`}
                      onPress={() => goToSearchResult(result)}
                      feedback="standard"
                      accessibilityRole="button"
                      style={[styles.panelRow, { backgroundColor: chromeTheme.subtleSurface, borderColor: chromeTheme.controlBorder }]}>
                      <Text style={[styles.panelRowTitle, { color: chromeTheme.text }]}>{chapterLabel(result.chapterTitle)}</Text>
                      <SearchExcerpt text={result.excerpt} query={searchQuery} />
                    </M3Pressable>
                  ))}
                  {searchQuery.trim() && searchResults.length === 0 && (
                    <View style={[styles.emptyPanelState, { backgroundColor: chromeTheme.subtleSurface, borderColor: chromeTheme.controlBorder }]}>
                      <Text style={[styles.emptyPanelTitle, { color: chromeTheme.text }]}>没有搜索结果</Text>
                      <Text style={[styles.emptyPanelBody, { color: chromeTheme.muted }]}>换一个关键词试试。</Text>
                    </View>
                  )}
                </ScrollView>
              </View>
            )}

            {panel === 'notes' && (
              <View style={styles.panelBody}>
                <View style={styles.annotationQuickActions}>
                  <M3Pressable
                    captureTouches
                    onPress={addBookmark}
                    feedback={currentBookmark ? 'subtle' : 'standard'}
                    accessibilityRole="button"
                    accessibilityState={{ selected: Boolean(currentBookmark) }}
                    style={[
                      styles.annotationActionCard,
                      { backgroundColor: currentBookmark ? chromeTheme.accent : chromeTheme.subtleSurface, borderColor: chromeTheme.controlBorder },
                    ]}>
                    <View style={styles.annotationActionHeader}>
                      <MaterialSymbol name={currentBookmark ? 'check.circle' : 'bookmark'} color={currentBookmark ? chromeTheme.accentText : chromeTheme.accent} description="本章书签" decorative size={18} />
                      <Text style={[styles.annotationActionTitle, { color: currentBookmark ? chromeTheme.accentText : chromeTheme.text }]}>
                        {currentBookmark ? '取消书签' : '本章书签'}
                      </Text>
                    </View>
                    <Text style={[styles.annotationActionBody, { color: currentBookmark ? chromeTheme.accentText : chromeTheme.muted }]}>
                      {currentBookmark ? '已标记当前章' : '收藏当前位置'}
                    </Text>
                  </M3Pressable>
                </View>
                <TextInput
                  value={noteDraft}
                  onChangeText={setNoteDraft}
                  placeholder="为本章写一条笔记"
                  placeholderTextColor={chromeTheme.muted}
                  multiline
                  style={[styles.panelInput, styles.noteInput, { backgroundColor: chromeTheme.subtleSurface, borderColor: chromeTheme.controlBorder, color: chromeTheme.text }]}
                />
                <M3Pressable captureTouches onPress={saveNote} feedback="standard" style={styles.saveNoteButton}>
                  <Text style={styles.saveNoteText}>保存笔记</Text>
                </M3Pressable>
                <View style={styles.filterRow}>
                  {annotationFilters.map((filter) => {
                    const active = annotationFilter === filter.value;
                    return (
                      <M3FilterChip
                        key={filter.value}
                        theme={panelControlTheme}
                        selected={active}
                        label={filter.label}
                        count={annotationCounts[filter.value]}
                        compact
                        onPress={() => setAnnotationFilter(filter.value)}
                      />
                    );
                  })}
                </View>
                <ScrollView contentContainerStyle={styles.panelList}>
                  {filteredAnnotations.map((annotation) => (
                    <M3Pressable
                      key={annotation.id}
                      onPress={() => goToAnnotation(annotation)}
                      feedback="standard"
                      accessibilityRole="button"
                      style={[styles.panelRow, { backgroundColor: chromeTheme.subtleSurface, borderColor: chromeTheme.controlBorder }]}>
                      <View style={styles.annotationHeader}>
                        <Text style={[styles.annotationType, { color: chromeTheme.accent }]}>{annotationLabels[annotation.type]}</Text>
                        <Text numberOfLines={1} style={[styles.annotationChapter, { color: chromeTheme.muted }]}>
                          {chapterLabel(chapterTitleById.get(annotation.chapterId) ?? '正文')} · {formatAnnotationTime(annotation.updatedAt)}
                        </Text>
                      </View>
                      <Text numberOfLines={4} style={[styles.panelRowTitle, { color: chromeTheme.text }]}>
                        {annotation.noteText || annotation.selectedText || '章节书签'}
                      </Text>
                      <View style={styles.annotationActions}>
                        <Text style={[styles.annotationHint, { color: chromeTheme.muted }]}>点按跳转</Text>
                        <M3Pressable
                          hitSlop={8}
                          feedback="subtle"
                          accessibilityRole="button"
                          onPress={async (event) => {
                            event.stopPropagation();
                            await deleteAnnotation(db, annotation.id);
                            setAnnotations(await listAnnotations(db, book.id));
                          }}>
                          <Text style={[styles.deleteText, { color: chromeTheme.accent }]}>删除</Text>
                        </M3Pressable>
                      </View>
                    </M3Pressable>
                  ))}
                  {filteredAnnotations.length === 0 && (
                    <View style={[styles.emptyPanelState, { backgroundColor: chromeTheme.subtleSurface, borderColor: chromeTheme.controlBorder }]}>
                      <Text style={[styles.emptyPanelTitle, { color: chromeTheme.text }]}>还没有{annotationFilter === 'all' ? '标注' : annotationLabels[annotationFilter]}</Text>
                      <Text style={[styles.emptyPanelBody, { color: chromeTheme.muted }]}>
                        书签、划线和笔记会出现在这里。
                      </Text>
                    </View>
                  )}
                </ScrollView>
              </View>
            )}

            {panel === 'settings' && (
              <View style={styles.settingsPanel}>
                <M3SegmentedControl
                  theme={panelControlTheme}
                  value={preferences.readingMode}
                  options={(['scroll', 'page'] as const).map((mode) => ({
                    value: mode,
                    title: readingModeLabels[mode],
                  }))}
                  onChange={(readingMode) => updatePreference({ ...preferences, readingMode })}
                />
                <View style={styles.themeRow}>
                  {brand.readerThemeOrder.map((theme) => (
                    <M3Pressable
                      key={theme}
                      captureTouches
                      onPress={() => updatePreference({ ...preferences, readerTheme: theme })}
                      feedback={preferences.readerTheme === theme ? 'subtle' : 'standard'}
                      accessibilityRole="button"
                      accessibilityState={{ selected: preferences.readerTheme === theme }}
                      style={[
                        styles.themeChip,
                        {
                          backgroundColor: preferences.readerTheme === theme ? brand.readerThemes[theme].primaryContainer : brand.readerThemes[theme].surfaceContainer,
                          borderColor: preferences.readerTheme === theme ? brand.readerThemes[theme].accent : brand.readerThemes[theme].line,
                        },
                      ]}>
                      <Image source={readerThemeAssets[theme].cover} contentFit="cover" style={styles.themeChipImage} />
                      <View style={[styles.themeChipOverlay, theme === 'night' && styles.themeChipDeepOverlay, preferences.readerTheme === theme && styles.activeThemeChipOverlay]} />
                      {preferences.readerTheme === theme ? (
                        <View style={[styles.themeChipCheck, { backgroundColor: brand.readerThemes[theme].accent }]}>
                          <MaterialSymbol name="check" color={brand.readerThemes[theme].accentText} description="当前阅读主题" decorative size={14} />
                        </View>
                      ) : null}
                      <Text style={[styles.themeChipText, { color: preferences.readerTheme === theme ? brand.readerThemes[theme].onPrimaryContainer : brand.readerThemes[theme].text }]}>
                        {themeLabels[theme]}
                      </Text>
                    </M3Pressable>
                  ))}
                </View>
                <View style={styles.fontRow}>
                  {readerFontFamilyOrder.map((fontFamily) => {
                    const active = preferences.fontFamily === fontFamily;
                    const foreground = active ? chromeTheme.accentText : chromeTheme.text;
                    return (
                      <M3Pressable
                        key={fontFamily}
                        captureTouches
                        onPress={() => updatePreference({ ...preferences, fontFamily })}
                        feedback={active ? 'subtle' : 'standard'}
                        accessibilityRole="button"
                        accessibilityLabel={`字体 ${readerFontFamilies[fontFamily].label}`}
                        accessibilityState={{ selected: active }}
                        style={[
                          styles.fontChip,
                          {
                            backgroundColor: active ? chromeTheme.accent : chromeTheme.subtleSurface,
                            borderColor: active ? chromeTheme.accent : chromeTheme.controlBorder,
                          },
                        ]}>
                        <Text
                          numberOfLines={1}
                          style={[
                            styles.fontChipSample,
                            {
                              color: foreground,
                              fontFamily: readerNativeFontFamily(fontFamily),
                              fontWeight: '700',
                            },
                          ]}>
                          {readerFontFamilies[fontFamily].sample}
                        </Text>
                        <Text numberOfLines={1} style={[styles.fontChipLabel, { color: foreground }]}>
                          {readerFontFamilies[fontFamily].label}
                        </Text>
                      </M3Pressable>
                    );
                  })}
                </View>
                <M3Stepper
                  theme={panelControlTheme}
                  label="字号"
                  value={String(preferences.fontSize)}
                  compact
                  onMinus={() => updatePreference({ ...preferences, fontSize: Math.max(15, preferences.fontSize - 1) })}
                  onPlus={() => updatePreference({ ...preferences, fontSize: Math.min(28, preferences.fontSize + 1) })}
                />
                <M3Stepper
                  theme={panelControlTheme}
                  label="行距"
                  value={preferences.lineHeight.toFixed(1)}
                  compact
                  onMinus={() => updatePreference({ ...preferences, lineHeight: Math.max(1.35, preferences.lineHeight - 0.1) })}
                  onPlus={() => updatePreference({ ...preferences, lineHeight: Math.min(2.2, preferences.lineHeight + 0.1) })}
                />
              </View>
            )}
          </AdaptiveSurface>
        </Animated.View>
      )}

      {noteSelection && (
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          pointerEvents="box-none"
          style={[styles.noteComposerLayer, { paddingBottom: noteComposerBottomInset }]}>
          <Pressable accessibilityRole="button" accessibilityLabel="关闭笔记" onPress={dismissSelectionNote} style={styles.noteComposerBackdrop} />
          <Animated.View
            entering={reduceMotion ? FadeIn.duration(80) : m3Motion.fadeShortIn()}
            exiting={reduceMotion ? FadeOut.duration(80) : m3Motion.fadeShortOut()}
            style={[styles.noteComposerCard, noteWindowDragStyle, { backgroundColor: readerTheme.surfaceSolid, borderColor: readerTheme.line }]}>
            <View {...noteWindowPanResponder.panHandlers} style={styles.noteComposerHeader}>
              <View style={styles.noteComposerTitleRow}>
                <MaterialSymbol name="note" color={readerTheme.accent} description="笔记" decorative size={20} />
                <Text style={[styles.noteComposerTitle, { color: readerTheme.text }]}>添加笔记</Text>
              </View>
              <IconButton
                icon="close"
                label="关闭"
                tone="quiet"
                size="icon"
                tintColor={readerTheme.text}
                onPress={dismissSelectionNote}
                style={[styles.closeButton, { backgroundColor: readerTheme.surfaceContainer, borderColor: readerTheme.line }]}
              />
            </View>
            <View style={[styles.selectionQuoteCard, { backgroundColor: readerTheme.surfaceContainer, borderColor: readerTheme.line }]}>
              <Text style={[styles.selectionQuoteLabel, { color: readerTheme.accent }]}>选中原文</Text>
              <Text numberOfLines={4} style={[styles.selectionQuoteText, { color: readerTheme.text }]}>
                {noteSelection.selectedText}
              </Text>
            </View>
            <TextInput
              autoFocus
              value={noteDraft}
              onChangeText={setNoteDraft}
              placeholder="写下这段文字的想法"
              placeholderTextColor={readerTheme.muted}
              multiline
              style={[styles.panelInput, styles.noteComposerInput, { backgroundColor: readerTheme.surfaceContainer, borderColor: readerTheme.line, color: readerTheme.text }]}
            />
            <View style={styles.noteComposerActions}>
              <Pressable
                onPress={dismissSelectionNote}
                accessibilityLabel="取消笔记"
                accessibilityRole="button"
                hitSlop={6}
                style={[styles.noteComposerCancelButton, { backgroundColor: readerTheme.surfaceContainer, borderColor: readerTheme.line }]}>
                <Text style={[styles.noteComposerCancelText, { color: readerTheme.text }]}>取消</Text>
              </Pressable>
              <Pressable
                onPress={saveNote}
                disabled={!noteDraft.trim()}
                accessibilityLabel="保存笔记"
                accessibilityRole="button"
                hitSlop={6}
                style={[styles.noteComposerSaveButton, !noteDraft.trim() && styles.disabledActionButton, { backgroundColor: readerTheme.accent }]}>
                <Text style={[styles.saveNoteText, { color: readerTheme.accentText }]}>保存</Text>
              </Pressable>
            </View>
          </Animated.View>
        </KeyboardAvoidingView>
      )}

      {activeNoteAnchor && (
        <View pointerEvents="box-none" style={styles.notePopoverLayer}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="关闭笔记列表"
            pointerEvents="box-only"
            onPress={() => {
              setActiveNoteAnchorKey(null);
              setActiveNoteAnchorPoint(null);
            }}
            style={styles.notePopoverBackdrop}
          />
          <Animated.View
            pointerEvents="auto"
            entering={reduceMotion ? FadeIn.duration(80) : m3Motion.fadeShortIn()}
            exiting={reduceMotion ? FadeOut.duration(80) : m3Motion.fadeShortOut()}
            style={[
              styles.notePopoverCard,
              notePopoverStyle,
              noteWindowDragStyle,
              { backgroundColor: readerTheme.surfaceSolid, borderColor: readerTheme.line },
            ]}>
            <View {...noteWindowPanResponder.panHandlers} style={styles.noteComposerHeader}>
              <View style={styles.noteComposerTitleRow}>
                <MaterialSymbol name="note" color={readerTheme.accent} description="笔记" decorative size={20} />
                <Text style={[styles.noteComposerTitle, { color: readerTheme.text }]}>
                  {activeNoteAnchor.annotations.length} 条笔记
                </Text>
              </View>
              <IconButton
                icon="close"
                label="关闭"
                tone="quiet"
                size="icon"
                tintColor={readerTheme.text}
                onPress={() => {
                  setActiveNoteAnchorKey(null);
                  setActiveNoteAnchorPoint(null);
                }}
                style={[styles.closeButton, { backgroundColor: readerTheme.surfaceContainer, borderColor: readerTheme.line }]}
              />
            </View>
            <View style={[styles.selectionQuoteCard, { backgroundColor: readerTheme.surfaceContainer, borderColor: readerTheme.line }]}>
              <Text style={[styles.selectionQuoteLabel, { color: readerTheme.accent }]}>原文</Text>
              <Text numberOfLines={4} style={[styles.selectionQuoteText, { color: readerTheme.text }]}>
                {activeNoteAnchor.selectedText}
              </Text>
            </View>
            <ScrollView style={styles.noteListScroll} contentContainerStyle={styles.noteListContent}>
              {activeNoteAnchor.annotations.map((annotation) => (
                <View key={annotation.id} style={[styles.noteListItem, { borderColor: readerTheme.line }]}>
                  <Text style={[styles.noteListTime, { color: readerTheme.muted }]}>{formatAnnotationTime(annotation.updatedAt)}</Text>
                  <Text style={[styles.noteListText, { color: readerTheme.text }]}>{annotation.noteText || annotation.selectedText}</Text>
                </View>
              ))}
            </ScrollView>
            <View style={styles.noteComposerActions}>
              <Pressable
                onPress={() => {
                  setActiveNoteAnchorKey(null);
                  setActiveNoteAnchorPoint(null);
                  setAnnotationFilter('note');
                  setPanel('notes');
                  setChromeVisible(true);
                }}
                accessibilityLabel="查看全部标注"
                accessibilityRole="button"
                hitSlop={6}
                style={[styles.noteComposerCancelButton, { backgroundColor: readerTheme.surfaceContainer, borderColor: readerTheme.line }]}>
                <Text style={[styles.noteComposerCancelText, { color: readerTheme.text }]}>全部标注</Text>
              </Pressable>
              <Pressable
                onPress={startNoteForActiveAnchor}
                accessibilityLabel="继续写笔记"
                accessibilityRole="button"
                hitSlop={6}
                style={[styles.noteComposerSaveButton, { backgroundColor: readerTheme.accent }]}>
                <Text style={[styles.saveNoteText, { color: readerTheme.accentText }]}>写一条</Text>
              </Pressable>
            </View>
          </Animated.View>
        </View>
      )}

      {notice && (
        <Animated.View
          entering={reduceMotion ? FadeIn.duration(80) : m3Motion.fadeShortIn()}
          exiting={reduceMotion ? FadeOut.duration(80) : m3Motion.fadeShortOut()}
          style={[styles.noticeToast, { top: Math.max(96, insets.top + 74) }]}>
          <Text style={styles.noticeToastText}>{notice}</Text>
        </Animated.View>
      )}

    </View>
  );
}

function panelTitle(panel: Exclude<Panel, null>) {
  return panel === 'toc' ? '目录' : panel === 'search' ? '搜索' : panel === 'settings' ? '样式' : '标注';
}

function panelIcon(panel: Exclude<Panel, null>): MaterialSymbolName {
  switch (panel) {
    case 'toc':
      return 'list.bullet';
    case 'search':
      return 'magnifyingglass';
    case 'settings':
      return 'textformat.size';
    case 'notes':
      return 'note';
  }
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
  },
  readerCanvas: {
    flex: 1,
  },
  readerView: {
    flex: 1,
  },
  scrollReaderContent: {
    paddingBottom: 72,
  },
  scrollChapter: {
    minHeight: 360,
    paddingVertical: 34,
    gap: 22,
  },
  scrollChapterHeading: {
    gap: 9,
    paddingBottom: 8,
  },
  scrollChapterKicker: {
    fontSize: 12,
    lineHeight: 17,
    fontWeight: '900',
    letterSpacing: 0,
  },
  scrollChapterTitle: {
    fontSize: 25,
    lineHeight: 33,
    fontWeight: '900',
    letterSpacing: 0,
  },
  scrollChapterRule: {
    width: 48,
    height: 3,
    borderRadius: brand.radius.round,
    opacity: 0.84,
  },
  scrollParagraphStack: {
    gap: 13,
  },
  scrollParagraph: {
    fontSize: 19,
    lineHeight: 32,
    fontWeight: '500',
    letterSpacing: 0,
  },
  scrollChapterLoading: {
    minHeight: 160,
    borderTopWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  selectionToolbar: {
    position: 'absolute',
    zIndex: 80,
    elevation: 18,
    minHeight: 44,
    borderRadius: brand.radius.round,
    borderCurve: 'continuous',
    borderWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
    overflow: 'hidden',
    boxShadow: '0 12px 24px rgba(18, 20, 15, 0.18)',
  },
  selectionToolButton: {
    flex: 1,
    minHeight: 44,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
    paddingHorizontal: 10,
  },
  selectionToolText: {
    fontSize: 13,
    fontWeight: '900',
    letterSpacing: 0,
  },
  selectionToolDivider: {
    width: StyleSheet.hairlineWidth,
    height: 24,
  },
  noteComposerLayer: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    zIndex: 120,
    elevation: 24,
    justifyContent: 'flex-end',
    paddingHorizontal: 12,
    paddingTop: 72,
  },
  noteComposerBackdrop: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    backgroundColor: 'rgba(8, 10, 7, 0.12)',
  },
  notePopoverLayer: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    zIndex: 130,
    elevation: 28,
  },
  notePopoverBackdrop: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    backgroundColor: 'rgba(36, 26, 18, 0.08)',
    zIndex: 0,
  },
  notePopoverCard: {
    position: 'absolute',
    zIndex: 1,
    elevation: 30,
    borderRadius: brand.radius.large,
    borderCurve: 'continuous',
    borderWidth: 1,
    padding: 12,
    gap: 9,
    boxShadow: '0 12px 30px rgba(36, 26, 18, 0.18)',
  },
  noteComposerCard: {
    alignSelf: 'center',
    width: '100%',
    maxWidth: 520,
    borderRadius: brand.radius.extraLarge,
    borderCurve: 'continuous',
    borderWidth: 1,
    padding: 13,
    gap: 10,
    boxShadow: '0 14px 34px rgba(8, 10, 7, 0.20)',
  },
  noteListCard: {
    alignSelf: 'center',
    width: '100%',
    maxWidth: 520,
    maxHeight: '52%',
    borderRadius: brand.radius.extraLarge,
    borderCurve: 'continuous',
    borderWidth: 1,
    padding: 13,
    gap: 10,
    boxShadow: '0 14px 34px rgba(8, 10, 7, 0.20)',
  },
  noteComposerHeader: {
    minHeight: 44,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  noteComposerTitleRow: {
    flex: 1,
    minWidth: 0,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  noteComposerTitle: {
    fontSize: 17,
    fontWeight: '900',
    letterSpacing: 0,
  },
  noteComposerInput: {
    minHeight: 96,
    paddingTop: 12,
    textAlignVertical: 'top',
  },
  noteComposerActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 10,
  },
  noteListScroll: {
    maxHeight: 220,
  },
  noteListContent: {
    gap: 10,
    paddingBottom: 2,
  },
  noteListItem: {
    borderTopWidth: 1,
    paddingTop: 10,
    gap: 5,
  },
  noteListTime: {
    fontSize: 11,
    lineHeight: 15,
    fontWeight: '800',
    letterSpacing: 0,
  },
  noteListText: {
    fontSize: 15,
    lineHeight: 22,
    fontWeight: '800',
    letterSpacing: 0,
  },
  noteComposerCancelButton: {
    minHeight: 44,
    borderRadius: brand.radius.round,
    borderCurve: 'continuous',
    borderWidth: 1,
    paddingHorizontal: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  noteComposerCancelText: {
    fontWeight: '900',
    letterSpacing: 0,
  },
  noteComposerSaveButton: {
    minHeight: 44,
    minWidth: 72,
    borderRadius: brand.radius.round,
    paddingHorizontal: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  disabledActionButton: {
    opacity: 0.48,
  },
  stateWrap: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: 20,
  },
  topChrome: {
    position: 'absolute',
    left: 18,
    right: 18,
    top: 48,
    zIndex: 40,
    elevation: 16,
  },
  topBar: {
    minHeight: 56,
    borderRadius: brand.radius.large,
    borderCurve: 'continuous',
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    paddingHorizontal: 9,
    gap: 12,
    boxShadow: '0 12px 26px rgba(18, 20, 15, 0.16)',
  },
  backButton: {
    width: 42,
    minWidth: 42,
    minHeight: 42,
    paddingHorizontal: 0,
    borderRadius: brand.radius.round,
  },
  titleStack: {
    flex: 1,
    gap: 3,
  },
  chromeTitle: {
    color: brand.colors.ink,
    fontSize: 14,
    fontWeight: '900',
    letterSpacing: 0,
  },
  chromeMeta: {
    color: brand.colors.muted,
    fontSize: 12,
    fontWeight: '800',
  },
  chapterCount: {
    color: brand.colors.copper,
    fontSize: 12,
    fontWeight: '900',
    fontVariant: ['tabular-nums'],
  },
  bottomChrome: {
    position: 'absolute',
    left: 18,
    right: 18,
    bottom: 18,
    zIndex: 40,
    elevation: 16,
  },
  readerDock: {
    borderRadius: brand.radius.extraLarge,
    borderCurve: 'continuous',
    borderWidth: 1,
    padding: 8,
    gap: 7,
    boxShadow: '0 16px 34px rgba(18, 20, 15, 0.22)',
  },
  chapterStrip: {
    minHeight: 46,
    borderRadius: brand.radius.medium,
    borderCurve: 'continuous',
    borderWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 5,
    paddingVertical: 5,
  },
  chapterTextButton: {
    minWidth: 58,
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: brand.radius.round,
    borderCurve: 'continuous',
  },
  disabledChapterButton: {
    opacity: 0.36,
  },
  chapterTextButtonText: {
    fontSize: 11,
    fontWeight: '900',
    letterSpacing: 0,
  },
  chapterCenter: {
    flex: 1,
    minWidth: 0,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
  },
  chapterCenterTitle: {
    fontSize: 13,
    fontWeight: '900',
    letterSpacing: 0,
  },
  chapterCenterMeta: {
    fontSize: 11,
    fontWeight: '800',
    fontVariant: ['tabular-nums'],
    letterSpacing: 0,
  },
  readerToolRow: {
    flexDirection: 'row',
    flexWrap: 'nowrap',
    justifyContent: 'space-between',
    gap: 6,
  },
  readerToolChip: {
    flex: 1,
    minWidth: 0,
    minHeight: 46,
    borderRadius: brand.radius.medium,
    borderCurve: 'continuous',
    borderWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
    paddingHorizontal: 8,
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    borderColor: 'rgba(255, 255, 255, 0.11)',
  },
  readerToolChipPrimary: {
    flex: 1.35,
  },
  readerToolChipText: {
    fontSize: 12,
    lineHeight: 16,
    fontWeight: '900',
    letterSpacing: 0,
  },
  panel: {
    position: 'absolute',
    left: 18,
    right: 18,
    bottom: 16,
    maxHeight: '74%',
  },
  panelSurface: {
    borderRadius: brand.radius.extraLarge,
    borderCurve: 'continuous',
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingTop: 10,
    paddingBottom: 14,
    gap: 12,
    boxShadow: '0 18px 38px rgba(18, 20, 15, 0.24)',
  },
  panelSurfaceFill: {
    flex: 1,
  },
  panelHandle: {
    width: 42,
    height: 4,
    borderRadius: brand.radius.round,
    alignSelf: 'center',
    opacity: 0.84,
  },
  panelHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  panelTitleStack: {
    flex: 1,
    minWidth: 0,
  },
  panelTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  panelTitle: {
    color: brand.colors.ink,
    fontSize: 19,
    lineHeight: 24,
    fontWeight: '900',
    letterSpacing: 0,
  },
  closeButton: {
    width: 44,
    minWidth: 44,
    minHeight: 44,
    borderRadius: brand.radius.round,
    borderCurve: 'continuous',
    alignItems: 'center',
    justifyContent: 'center',
  },
  panelTabs: {
    minHeight: 44,
    borderRadius: brand.radius.medium,
    borderCurve: 'continuous',
    borderWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    padding: 5,
  },
  panelTab: {
    flex: 1,
    minWidth: 0,
    minHeight: 34,
    borderRadius: brand.radius.small,
    borderCurve: 'continuous',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    paddingHorizontal: 6,
  },
  panelTabText: {
    fontSize: 11,
    lineHeight: 15,
    fontWeight: '900',
    letterSpacing: 0,
  },
  panelBody: {
    gap: 12,
  },
  panelBodyFill: {
    flex: 1,
    minHeight: 0,
  },
  panelInput: {
    minHeight: 48,
    borderRadius: 18,
    borderCurve: 'continuous',
    backgroundColor: brand.colors.paperElevated,
    borderColor: brand.colors.line,
    borderWidth: 1,
    color: brand.colors.ink,
    paddingHorizontal: 12,
    fontSize: 15,
    fontWeight: '800',
  },
  noteInput: {
    minHeight: 84,
    paddingTop: 12,
    textAlignVertical: 'top',
  },
  panelList: {
    gap: 10,
    paddingBottom: 12,
  },
  panelScroll: {
    flex: 1,
    minHeight: 0,
  },
  emptyPanelState: {
    borderRadius: brand.radius.large,
    borderCurve: 'continuous',
    borderWidth: 1,
    padding: 16,
    gap: 5,
  },
  emptyPanelTitle: {
    color: brand.colors.ink,
    fontSize: 15,
    fontWeight: '900',
    letterSpacing: 0,
  },
  emptyPanelBody: {
    color: brand.colors.muted,
    fontSize: 12,
    lineHeight: 18,
    fontWeight: '700',
  },
  panelRow: {
    borderRadius: 18,
    borderCurve: 'continuous',
    backgroundColor: 'rgba(247, 248, 251, 0.88)',
    borderWidth: 1,
    borderColor: brand.colors.line,
    padding: 12,
    gap: 6,
  },
  tocRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
  },
  tocIndex: {
    width: 30,
    color: brand.colors.muted,
    fontSize: 12,
    lineHeight: 20,
    fontWeight: '900',
    letterSpacing: 0,
  },
  tocContent: {
    flex: 1,
    minWidth: 0,
    gap: 5,
  },
  tocTitleRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
  },
  panelRowTitle: {
    color: brand.colors.ink,
    flex: 1,
    fontSize: 15,
    lineHeight: 20,
    fontWeight: '800',
    letterSpacing: 0,
  },
  panelRowMeta: {
    color: 'rgba(247, 240, 228, 0.62)',
    fontSize: 12,
    lineHeight: 17,
  },
  currentBadge: {
    borderRadius: brand.radius.round,
    backgroundColor: brand.chrome.accent,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  currentBadgeText: {
    color: brand.chrome.accentText,
    fontSize: 10,
    fontWeight: '900',
    letterSpacing: 0,
  },
  searchMatchText: {
    color: brand.chrome.accentText,
    backgroundColor: brand.chrome.accent,
    fontWeight: '900',
  },
  saveNoteButton: {
    alignSelf: 'flex-start',
    minHeight: 44,
    backgroundColor: brand.chrome.accent,
    borderRadius: brand.radius.round,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  saveNoteText: {
    color: brand.chrome.accentText,
    fontWeight: '900',
    letterSpacing: 0,
  },
  annotationQuickActions: {
    flexDirection: 'row',
    gap: 10,
  },
  annotationActionCard: {
    flex: 1,
    minHeight: 68,
    borderRadius: brand.radius.large,
    borderCurve: 'continuous',
    borderWidth: 1,
    paddingHorizontal: 13,
    paddingVertical: 12,
    justifyContent: 'center',
    gap: 4,
  },
  annotationActionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
  },
  annotationActionTitle: {
    color: brand.colors.ink,
    fontSize: 15,
    fontWeight: '900',
    letterSpacing: 0,
  },
  annotationActionBody: {
    color: brand.colors.muted,
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 0,
  },
  selectionQuoteCard: {
    borderRadius: brand.radius.medium,
    borderCurve: 'continuous',
    borderWidth: 0,
    borderLeftWidth: 3,
    paddingHorizontal: 10,
    paddingVertical: 8,
    gap: 4,
  },
  selectionQuoteLabel: {
    fontSize: 10,
    fontWeight: '900',
    letterSpacing: 0,
  },
  selectionQuoteText: {
    fontSize: 13,
    lineHeight: 19,
    fontWeight: '700',
    letterSpacing: 0,
  },
  filterRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  annotationHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  annotationType: {
    color: brand.colors.copper,
    fontSize: 10,
    fontWeight: '900',
    letterSpacing: 0,
  },
  annotationChapter: {
    color: brand.colors.muted,
    flex: 1,
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0,
  },
  annotationActions: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  annotationHint: {
    color: brand.colors.muted,
    fontSize: 11,
    fontWeight: '800',
  },
  deleteText: {
    color: brand.colors.island,
    fontWeight: '900',
  },
  settingsPanel: {
    gap: 14,
  },
  themeRow: {
    flexDirection: 'row',
    gap: 10,
  },
  fontRow: {
    flexDirection: 'row',
    gap: 8,
  },
  fontChip: {
    flex: 1,
    minHeight: 54,
    borderRadius: brand.radius.medium,
    borderCurve: 'continuous',
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
    paddingHorizontal: 6,
  },
  fontChipSample: {
    fontSize: 16,
    lineHeight: 21,
    letterSpacing: 0,
  },
  fontChipLabel: {
    fontSize: 10,
    lineHeight: 13,
    fontWeight: '900',
    letterSpacing: 0,
  },
  themeChip: {
    flex: 1,
    minHeight: 46,
    borderRadius: brand.radius.large,
    borderCurve: 'continuous',
    borderWidth: 2,
    overflow: 'hidden',
    justifyContent: 'center',
    alignItems: 'center',
  },
  themeChipCheck: {
    position: 'absolute',
    top: 5,
    right: 5,
    width: 22,
    height: 22,
    borderRadius: brand.radius.round,
    borderCurve: 'continuous',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 2,
  },
  themeChipImage: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    bottom: 0,
    opacity: 0.44,
  },
  themeChipOverlay: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    bottom: 0,
    backgroundColor: 'rgba(255, 255, 255, 0.18)',
  },
  activeThemeChipOverlay: {
    backgroundColor: 'rgba(234, 221, 255, 0.36)',
  },
  themeChipDeepOverlay: {
    backgroundColor: 'rgba(9, 15, 20, 0.22)',
  },
  themeChipText: {
    fontWeight: '900',
    textTransform: 'capitalize',
    letterSpacing: 0,
    zIndex: 1,
  },
  noticeToast: {
    position: 'absolute',
    left: 24,
    right: 24,
    top: 122,
    minHeight: 46,
    borderRadius: brand.radius.extraLarge,
    borderCurve: 'continuous',
    backgroundColor: brand.colors.ink,
    borderWidth: 1,
    borderColor: 'rgba(255, 253, 247, 0.12)',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
    paddingVertical: 10,
    boxShadow: brand.shadow.chrome,
  },
  noticeToastText: {
    color: brand.colors.white,
    textAlign: 'center',
    fontSize: 14,
    lineHeight: 19,
    fontWeight: '900',
    letterSpacing: 0,
  },
});
