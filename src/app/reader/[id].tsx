import { Link, router, useLocalSearchParams } from 'expo-router';
import { Image } from 'expo-image';
import { useSQLiteContext } from 'expo-sqlite';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AccessibilityInfo,
  ActivityIndicator,
  Alert,
  BackHandler,
  Keyboard,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import Animated, { FadeIn, FadeOut, SlideInDown, SlideInUp, SlideOutDown, SlideOutUp } from 'react-native-reanimated';
import WebView, { type WebViewMessageEvent } from 'react-native-webview';

import { AdaptiveSurface } from '@/components/reader/adaptive-surface';
import { IconButton } from '@/components/reader/icon-button';
import { M3FilterChip, M3Screen, M3SegmentedControl, M3StatePanel, M3Stepper } from '@/components/reader/m3';
import { M3Pressable } from '@/components/reader/m3-pressable';
import { MaterialSymbol, type MaterialSymbolName } from '@/components/reader/material-symbol';
import { brand } from '@/constants/brand';
import { motion } from '@/constants/motion';
import { readerThemeAssets } from '@/constants/theme-assets';
import {
  createAnnotation,
  deleteAnnotation,
  getReaderPreferences,
  listAnnotations,
  openBook,
  saveProgress,
  searchBook,
  updateReaderPreferences,
} from '@/lib/reader-service';
import { cleanChapterTitle } from '@/lib/text-utils';
import type { Annotation, Book, Chapter, ReaderPreferences, ReaderTheme, SearchResult } from '@/types/reader';

type Panel = 'toc' | 'search' | 'notes' | 'settings' | null;
type AnnotationFilter = 'all' | Annotation['type'];

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

function parseAnnotationPosition(position: string) {
  try {
    const parsed = JSON.parse(position) as { chapterId?: string; offset?: number; quote?: string };
    return parsed;
  } catch {
    return {};
  }
}

function ratioFromOffset(chapter: Chapter | undefined, offset?: number) {
  if (!chapter || typeof offset !== 'number' || offset < 0) {
    return 0;
  }

  const contentLength = Math.max(1, chapter.textContent.length);
  return Math.max(0, Math.min(0.96, offset / contentLength));
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

function renderTextBlock(block: string) {
  const trimmed = cleanInlineContent(block);
  if (!trimmed || /^内容[:：]?$/i.test(trimmed)) {
    return null;
  }

  const catalogue = trimmed.match(/^<\s*目录\s*>\s*(.+)$/);
  if (catalogue?.[1]) {
    return `<p class="section-path">${escapeHtml(catalogue[1]).replace(/\\/g, ' / ')}</p>`;
  }

  const heading = trimmed.match(/^<\s*(?:篇名|卷名|章名|标题|title)\s*>\s*(.+)$/i);
  if (heading?.[1]) {
    return `<h2>${escapeHtml(cleanChapterTitle(heading[1], '正文'))}</h2>`;
  }

  const content = trimmed.replace(/^内容[:：]\s*/i, '').trim();
  if (!content) {
    return null;
  }

  return `<p>${escapeHtml(content).replace(/\n/g, '<br>')}</p>`;
}

function readerHtmlForText(chapter: Chapter, preferences: ReaderPreferences) {
  const theme = brand.readerThemes[preferences.readerTheme];
  const paragraphs = chapter.textContent
    .replace(/\\r/g, '\n')
    .replace(/\r/g, '\n')
    .split(/\n{1,}/)
    .map(renderTextBlock)
    .filter(Boolean)
    .join('\n');

  return `<!doctype html>
<html>
<head>
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0">
  <style>
    body {
      margin: 0;
      padding: 112px ${preferences.margin}px 280px;
      background: var(--reader-bg, ${theme.background});
      color: var(--reader-text, ${theme.text});
      font-family: "Songti SC", "Noto Serif CJK SC", "Noto Serif", Georgia, serif;
      font-size: var(--reader-font-size, ${preferences.fontSize}px);
      line-height: var(--reader-line-height, ${preferences.lineHeight});
      letter-spacing: 0;
      text-rendering: optimizeLegibility;
      box-sizing: border-box;
      max-width: 720px;
      margin-left: auto;
      margin-right: auto;
    }
    p { margin: 0 0 1.12em; }
    h2 {
      margin: 1.25em 0 0.75em;
      font-size: 1.28em;
      line-height: 1.28;
    }
    .section-path {
      margin: 1.4em 0 0.65em;
      color: var(--reader-muted, ${theme.muted});
      font-size: 0.82em;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      font-weight: 700;
    }
    ::selection { background: rgba(167, 121, 78, 0.28); }
  </style>
</head>
<body>
  ${paragraphs}
  ${readerScript()}
</body>
</html>`;
}

function escapeHtml(input: string) {
  return input
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function readerScript() {
  return `<script>
    window.__INBOX_CAPTURE_SELECTION = function() {
      var selection = window.getSelection();
      var selectedText = selection ? selection.toString().trim() : "";
      window.ReactNativeWebView.postMessage(JSON.stringify({
        type: selectedText ? "selection" : "selection-empty",
        selectedText: selectedText,
        offset: selectedText ? document.body.innerText.indexOf(selectedText) : -1
      }));
    };
    window.addEventListener("scroll", function() {
      var max = Math.max(1, document.documentElement.scrollHeight - window.innerHeight);
      window.ReactNativeWebView.postMessage(JSON.stringify({
        type: "progress",
        ratio: Math.min(1, Math.max(0, window.scrollY / max))
      }));
    }, { passive: true });
  </script>`;
}

function preferenceScript(preferences: ReaderPreferences, restoreRatio: number, reduceMotion: boolean, readerUiActive: boolean) {
  const theme = brand.readerThemes[preferences.readerTheme];
  return `
    (function() {
      var mode = "${preferences.readingMode}";
      var margin = ${preferences.margin};
      var reduceMotion = ${reduceMotion ? 'true' : 'false'};
      var restoreRatio = ${restoreRatio};
      window.__INBOX_UI_ACTIVE__ = ${readerUiActive ? 'true' : 'false'};

      function postMessage(payload) {
        window.ReactNativeWebView.postMessage(JSON.stringify(payload));
      }

      function pageStep() {
        return Math.max(1, window.innerWidth);
      }

      function maxHorizontalScroll() {
        return Math.max(0, document.documentElement.scrollWidth - window.innerWidth);
      }

      function maxVerticalScroll() {
        return Math.max(1, document.documentElement.scrollHeight - window.innerHeight);
      }

      function pageCount() {
        return Math.max(1, Math.round(maxHorizontalScroll() / pageStep()) + 1);
      }

      function pageIndex() {
        return Math.min(pageCount() - 1, Math.max(0, Math.round(window.scrollX / pageStep())));
      }

      function reportProgress() {
        if (mode === "page") {
          var total = pageCount();
          var page = pageIndex();
          postMessage({
            type: "progress",
            ratio: total <= 1 ? 0 : page / Math.max(1, total - 1),
            pageIndex: page + 1,
            pageCount: total
          });
          return;
        }

        postMessage({
          type: "progress",
          ratio: Math.min(1, Math.max(0, window.scrollY / maxVerticalScroll()))
        });
      }

      function applyMode() {
        document.documentElement.style.setProperty("--reader-font-size", "${preferences.fontSize}px");
        document.documentElement.style.setProperty("--reader-line-height", "${preferences.lineHeight}");
        document.documentElement.style.setProperty("--reader-bg", "${theme.background}");
        document.documentElement.style.setProperty("--reader-text", "${theme.text}");
        document.documentElement.style.background = "${theme.background}";
        document.body.style.background = "${theme.background}";
        document.body.style.color = "${theme.text}";
        document.body.style.fontSize = "${preferences.fontSize}px";
        document.body.style.lineHeight = "${preferences.lineHeight}";
        document.body.style.boxSizing = "border-box";
        document.body.style.paddingLeft = margin + "px";
        document.body.style.paddingRight = margin + "px";

        if (mode === "page") {
          document.documentElement.style.height = "100%";
          document.documentElement.style.overflowX = "hidden";
          document.documentElement.style.overflowY = "hidden";
          document.body.style.minHeight = "100vh";
          document.body.style.height = "100vh";
          document.body.style.overflow = "visible";
          document.body.style.paddingTop = "112px";
          document.body.style.paddingBottom = "118px";
          document.body.style.columnWidth = Math.max(220, window.innerWidth - margin * 2) + "px";
          document.body.style.columnGap = margin * 2 + "px";
          document.body.style.webkitColumnWidth = Math.max(220, window.innerWidth - margin * 2) + "px";
          document.body.style.webkitColumnGap = margin * 2 + "px";
          return;
        }

        document.documentElement.style.height = "auto";
        document.documentElement.style.overflowX = "hidden";
        document.documentElement.style.overflowY = "auto";
        document.body.style.minHeight = "auto";
        document.body.style.height = "auto";
        document.body.style.overflow = "visible";
        document.body.style.paddingTop = "132px";
        document.body.style.paddingBottom = "330px";
        document.body.style.columnWidth = "auto";
        document.body.style.columnGap = "normal";
        document.body.style.webkitColumnWidth = "auto";
        document.body.style.webkitColumnGap = "normal";
      }

      window.__INBOX_GO_PAGE = function(delta) {
        if (mode !== "page") {
          return;
        }
        var total = pageCount();
        var next = pageIndex() + delta;
        if (next < 0) {
          postMessage({ type: "pageBoundary", direction: "prev" });
          return;
        }
        if (next >= total) {
          postMessage({ type: "pageBoundary", direction: "next" });
          return;
        }
        window.scrollTo({ left: next * pageStep(), top: 0, behavior: "auto" });
        setTimeout(reportProgress, 40);
      };

      window.__INBOX_REPORT_PROGRESS = reportProgress;

      if (!window.__INBOX_SCRIPT_READY__) {
        window.__INBOX_SCRIPT_READY__ = true;
        var progressTimer = null;
        var lastTouchAt = 0;

        function tapRatio(point) {
          var screenWidth = window.screen && window.screen.width ? window.screen.width : 0;
          if (point && Number.isFinite(point.screenX) && screenWidth > 0) {
            return Math.min(1, Math.max(0, point.screenX / screenWidth));
          }

          return Math.min(1, Math.max(0, point.clientX / Math.max(1, window.innerWidth)));
        }

        function handleReaderTap(event, point) {
          var target = event.target;
          if (target && target.closest && target.closest("a")) {
            return;
          }
          var selection = window.getSelection ? window.getSelection().toString().trim() : "";
          if (selection) {
            return;
          }
          if (window.__INBOX_UI_ACTIVE__) {
            postMessage({ type: "dismissChrome" });
            return;
          }
          if (mode === "page") {
            var ratio = tapRatio(point);
            if (ratio < 0.28) {
              window.__INBOX_GO_PAGE(-1);
              return;
            }
            if (ratio > 0.72) {
              window.__INBOX_GO_PAGE(1);
              return;
            }
          }
          postMessage({ type: "toggleChrome" });
        }

        document.addEventListener("touchend", function(event) {
          var touch = event.changedTouches && event.changedTouches[0];
          if (!touch) {
            return;
          }
          lastTouchAt = Date.now();
          handleReaderTap(event, touch);
        }, { passive: true, capture: true });

        document.addEventListener("click", function(event) {
          if (Date.now() - lastTouchAt < 450) {
            return;
          }
          handleReaderTap(event, event);
        });
        window.addEventListener("scroll", function() {
          if (progressTimer) {
            clearTimeout(progressTimer);
          }
          progressTimer = setTimeout(reportProgress, 80);
        }, { passive: true });
        window.addEventListener("resize", function() {
          var ratio = mode === "page" ? (pageCount() <= 1 ? 0 : pageIndex() / Math.max(1, pageCount() - 1)) : window.scrollY / maxVerticalScroll();
          applyMode();
          setTimeout(function() {
            if (mode === "page") {
              window.scrollTo({ left: Math.round(ratio * Math.max(1, pageCount() - 1)) * pageStep(), top: 0, behavior: "auto" });
            } else {
              window.scrollTo({ left: 0, top: ratio * maxVerticalScroll(), behavior: "auto" });
            }
            reportProgress();
          }, 80);
        });
      }

      applyMode();
      setTimeout(function() {
        if (mode === "page") {
          var targetPage = Math.round(restoreRatio * Math.max(1, pageCount() - 1));
          window.scrollTo({ left: targetPage * pageStep(), top: 0, behavior: "auto" });
        } else {
          window.scrollTo({ left: 0, top: restoreRatio * maxVerticalScroll(), behavior: "auto" });
        }
        reportProgress();
      }, 180);
    })();
    true;
  `;
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
      onPress={onPress}
      feedback={active ? 'subtle' : 'standard'}
      style={[
        styles.readerToolChip,
        primary && styles.readerToolChipPrimary,
        { backgroundColor, borderColor: active ? chromeTheme.accent : chromeTheme.controlBorder },
      ]}>
      <MaterialSymbol name={icon} color={color} description={label} size={17} />
      <Text numberOfLines={1} style={[styles.readerToolChipText, { color }]}>
        {label}
      </Text>
    </M3Pressable>
  );
}

export default function ReaderScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const db = useSQLiteContext();
  const webViewRef = useRef<WebView>(null);
  const lastProgressSave = useRef(0);
  const [book, setBook] = useState<Book | null>(null);
  const [chapters, setChapters] = useState<Chapter[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [restoreRatio, setRestoreRatio] = useState(0);
  const [preferences, setPreferences] = useState<ReaderPreferences>({
    appThemeMode: 'system',
    readerTheme: 'paper',
    fontSize: 19,
    lineHeight: 1.7,
    margin: 22,
    readingMode: 'scroll',
  });
  const [annotations, setAnnotations] = useState<Annotation[]>([]);
  const [panel, setPanel] = useState<Panel>(null);
  const [annotationFilter, setAnnotationFilter] = useState<AnnotationFilter>('all');
  const [chromeVisible, setChromeVisible] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [noteDraft, setNoteDraft] = useState('');
  const [loading, setLoading] = useState(true);
  const [reduceMotion, setReduceMotion] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [pageStatus, setPageStatus] = useState({ pageIndex: 1, pageCount: 1 });

  const currentChapter = chapters[currentIndex];
  const themeToken = brand.readerThemes[preferences.readerTheme];
  const readerTheme = themeToken;
  const chromePanelSurface = preferences.readerTheme === 'night' ? '#171A18' : '#151611';
  const chromeSubtleSurface = preferences.readerTheme === 'night' ? 'rgba(255, 255, 255, 0.075)' : 'rgba(255, 255, 255, 0.08)';
  const chromeBorder = preferences.readerTheme === 'night' ? 'rgba(255, 255, 255, 0.13)' : 'rgba(255, 255, 255, 0.11)';
  const chromeTheme = {
    surface: chromePanelSurface,
    panelSurface: chromePanelSurface,
    subtleSurface: chromeSubtleSurface,
    border: chromeBorder,
    controlBorder: chromeBorder,
    text: '#F7F0E4',
    muted: 'rgba(247, 240, 228, 0.62)',
    accent: '#E7D9B7',
    accentText: '#171811',
    primaryContainer: '#E7D9B7',
    onPrimaryContainer: '#171811',
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
    () => annotations.find((annotation) => annotation.type === 'bookmark' && annotation.chapterId === currentChapter?.id),
    [annotations, currentChapter?.id]
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

  const closePanel = useCallback(() => {
    Keyboard.dismiss();
    setPanel(null);
  }, []);

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
    setBook(nextBook);
    setChapters(nextChapters);
    setPreferences(nextPreferences);
    setAnnotations(nextAnnotations);
    setCurrentIndex(progressIndex >= 0 ? progressIndex : 0);
    setRestoreRatio(progress?.scroll_ratio ?? 0);
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
    if (!panel) {
      return;
    }

    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      closePanel();
      return true;
    });

    return () => subscription.remove();
  }, [closePanel, panel]);

  useEffect(() => {
    const handle = setTimeout(() => {
      if (!book || !searchQuery.trim()) {
        setSearchResults([]);
        return;
      }

      searchBook(db, book.id, searchQuery).then(setSearchResults);
    }, 180);

    return () => clearTimeout(handle);
  }, [book, db, searchQuery]);

  const commitProgress = useCallback(
    async (ratio: number, force = false) => {
      if (!book || !currentChapter) {
        return;
      }

      const now = Date.now();
      if (!force && now - lastProgressSave.current < 1200) {
        return;
      }

      lastProgressSave.current = now;
      await saveProgress(db, book.id, currentChapter.id, ratio);
    },
    [book, currentChapter, db]
  );

  const goToChapter = useCallback(
    (index: number, ratio = 0) => {
      if (!book || !chapters[index]) {
        return;
      }
      setCurrentIndex(index);
      setRestoreRatio(ratio);
      setPageStatus({ pageIndex: 1, pageCount: 1 });
      setPanel(null);
      saveProgress(db, book.id, chapters[index].id, ratio);
    },
    [book, chapters, db]
  );

  const goToSearchResult = useCallback(
    (result: SearchResult) => {
      const chapterIndex = chapters.findIndex((chapter) => chapter.id === result.chapterId);
      if (chapterIndex < 0) {
        showNotice('没有找到匹配章节');
        return;
      }

      goToChapter(chapterIndex, ratioFromOffset(chapters[chapterIndex], result.matchOffset));
      showNotice('已跳到命中位置');
    },
    [chapters, goToChapter, showNotice]
  );

  const goToAnnotation = useCallback(
    (annotation: Annotation) => {
      const chapterIndex = chapters.findIndex((chapter) => chapter.id === annotation.chapterId);
      if (chapterIndex < 0) {
        showNotice('没有找到标注所在章节');
        return;
      }

      const position = parseAnnotationPosition(annotation.position);
      goToChapter(chapterIndex, ratioFromOffset(chapters[chapterIndex], position.offset));
      showNotice(`已跳到${annotationLabels[annotation.type]}`);
    },
    [chapters, goToChapter, showNotice]
  );

  const handleWebMessage = useCallback(
    async (event: WebViewMessageEvent) => {
      let payload: { type?: string; ratio?: number; selectedText?: string; offset?: number; pageIndex?: number; pageCount?: number; direction?: 'prev' | 'next' };
      try {
        payload = JSON.parse(event.nativeEvent.data);
      } catch {
        return;
      }

      if (payload.type === 'toggleChrome') {
        setChromeVisible((visible) => !visible);
      }

      if (payload.type === 'dismissChrome') {
        Keyboard.dismiss();
        setPanel(null);
        setChromeVisible(false);
      }

      if (payload.type === 'progress' && typeof payload.ratio === 'number') {
        if (preferences.readingMode === 'page' && (typeof payload.pageIndex !== 'number' || typeof payload.pageCount !== 'number')) {
          return;
        }
        if (typeof payload.pageIndex === 'number' && typeof payload.pageCount === 'number') {
          setPageStatus({
            pageIndex: Math.max(1, payload.pageIndex),
            pageCount: Math.max(1, payload.pageCount),
          });
        }
        commitProgress(payload.ratio);
      }

      if (payload.type === 'pageBoundary' && payload.direction === 'prev') {
        showNotice(currentIndex > 0 ? '已经是本章第一页，点上一章切换章节' : '已经是第一章');
      }

      if (payload.type === 'pageBoundary' && payload.direction === 'next') {
        showNotice(currentIndex < chapters.length - 1 ? '本章已结束，点下一章继续' : '已经读到最后一章');
      }

      if (payload.type === 'selection-empty') {
        showNotice('先选择正文中的文字，再点划线');
      }

      if (payload.type === 'selection' && book && currentChapter && payload.selectedText) {
        await createAnnotation(db, {
          bookId: book.id,
          chapterId: currentChapter.id,
          type: 'highlight',
          selectedText: payload.selectedText,
          color: '#f6d46a',
          position: JSON.stringify({ offset: payload.offset ?? -1, quote: payload.selectedText.slice(0, 140) }),
        });
        setAnnotations(await listAnnotations(db, book.id));
        showNotice('已保存划线');
        setPanel('notes');
      }
    },
    [book, chapters.length, commitProgress, currentChapter, currentIndex, db, preferences.readingMode, showNotice]
  );

  const readerUiActive = chromeVisible || panel !== null;
  const injectedJavaScript = useMemo(
    () => preferenceScript(preferences, restoreRatio, reduceMotion, readerUiActive),
    [preferences, readerUiActive, reduceMotion, restoreRatio]
  );

  useEffect(() => {
    webViewRef.current?.injectJavaScript(`window.__INBOX_UI_ACTIVE__ = ${readerUiActive ? 'true' : 'false'}; true;`);
  }, [readerUiActive]);

  const saveNote = useCallback(async () => {
    if (!book || !currentChapter || !noteDraft.trim()) {
      return;
    }

    await createAnnotation(db, {
      bookId: book.id,
      chapterId: currentChapter.id,
      type: 'note',
      noteText: noteDraft.trim(),
      position: JSON.stringify({ chapterId: currentChapter.id }),
    });
    setNoteDraft('');
    setAnnotations(await listAnnotations(db, book.id));
    showNotice('笔记已保存');
    setPanel('notes');
  }, [book, currentChapter, db, noteDraft, showNotice]);

  const addBookmark = useCallback(async () => {
    if (!book || !currentChapter) {
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
      chapterId: currentChapter.id,
      type: 'bookmark',
      selectedText: currentChapter.title,
      position: JSON.stringify({ chapterId: currentChapter.id }),
    });
    setAnnotations(await listAnnotations(db, book.id));
    showNotice('已加入本章书签');
    setPanel('notes');
  }, [book, currentBookmark, currentChapter, db, showNotice]);

  const updatePreference = useCallback(
    async (next: ReaderPreferences) => {
      setPreferences(next);
      setPageStatus({ pageIndex: 1, pageCount: 1 });
      await updateReaderPreferences(db, next);
    },
    [db]
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

  if (!book || !currentChapter) {
    return (
      <M3Screen key={`reader-missing-${preferences.readerTheme}`} theme={themeToken} backgroundSource={readerThemeAssets[preferences.readerTheme].background}>
        <View style={styles.stateWrap}>
          <M3StatePanel
            theme={themeToken}
            title="未找到这本书"
            body="这本书可能已被删除，或本机数据库仍在整理。"
            artwork={<MaterialSymbol name="error" color={themeToken.accent} description="未找到这本书" size={28} />}>
            <IconButton
              icon="chevron.left"
              label="返回书架"
              tone="quiet"
              tintColor={themeToken.text}
              style={{ backgroundColor: themeToken.surfaceContainerHigh, borderColor: themeToken.line }}
              onPress={() => router.back()}
            />
          </M3StatePanel>
        </View>
      </M3Screen>
    );
  }

  const readerSource =
    currentChapter.htmlPath && book.format === 'epub'
      ? { uri: currentChapter.htmlPath }
      : { html: readerHtmlForText(currentChapter, preferences) };

  return (
    <View style={[styles.screen, { backgroundColor: readerTheme.background }]}>
      <Link.AppleZoomTarget>
        <View style={styles.readerCanvas}>
          <WebView
            key={`${currentChapter.id}-${preferences.readerTheme}-${preferences.fontSize}-${preferences.lineHeight}-${preferences.margin}-${preferences.readingMode}`}
            ref={webViewRef}
            originWhitelist={['*']}
            source={readerSource}
            onMessage={handleWebMessage}
            injectedJavaScript={injectedJavaScript}
            javaScriptEnabled
            showsVerticalScrollIndicator={false}
            style={[styles.webView, { backgroundColor: readerTheme.background }]}
          />
        </View>
      </Link.AppleZoomTarget>

      {chromeVisible && (
        <Animated.View
          entering={reduceMotion ? FadeIn.duration(80) : SlideInUp.duration(motion.duration.medium)}
          exiting={reduceMotion ? FadeOut.duration(80) : SlideOutUp.duration(motion.duration.short)}
          style={styles.topChrome}>
          <AdaptiveSurface style={[styles.topBar, { backgroundColor: chromeTheme.surface, borderColor: chromeTheme.border }]}>
            <IconButton
              icon="chevron.left"
              label="返回"
              tone="quiet"
              size="icon"
              tintColor={chromeTheme.text}
              style={[styles.backButton, { backgroundColor: chromeTheme.subtleSurface, borderColor: chromeTheme.controlBorder }]}
              onPress={() => router.back()}
            />
            <View style={styles.titleStack}>
              <Text numberOfLines={1} style={[styles.chromeTitle, { color: chromeTheme.text }]}>
                {bookTitleLabel(book.title)}
              </Text>
              <Text numberOfLines={1} style={[styles.chromeMeta, { color: chromeTheme.muted }]}>
                {chapterLabel(currentChapter.title)}
                {preferences.readingMode === 'page' && pageStatus.pageCount > 1 ? ` · ${pageStatus.pageIndex}/${pageStatus.pageCount} 页` : ''}
              </Text>
            </View>
            <Text style={[styles.chapterCount, { color: chromeTheme.accent }]}>
              {currentIndex + 1}/{chapters.length}
            </Text>
          </AdaptiveSurface>
        </Animated.View>
      )}

      {chromeVisible && (
        <Animated.View
          entering={reduceMotion ? FadeIn.duration(80) : SlideInDown.duration(motion.duration.medium)}
          exiting={SlideOutDown.duration(motion.duration.short)}
          style={styles.bottomChrome}>
          <AdaptiveSurface style={[styles.readerDock, { backgroundColor: chromeTheme.surface, borderColor: chromeTheme.border }]}>
            <View style={[styles.chapterStrip, { backgroundColor: chromeTheme.subtleSurface, borderColor: chromeTheme.controlBorder }]}>
              <M3Pressable
                disabled={currentIndex === 0}
                onPress={() => goToChapter(Math.max(0, currentIndex - 1), preferences.readingMode === 'page' ? 1 : 0)}
                feedback="subtle"
                style={[styles.chapterTextButton, currentIndex === 0 && styles.disabledChapterButton]}>
                <Text style={[styles.chapterTextButtonText, { color: chromeTheme.text }]}>上一章</Text>
              </M3Pressable>
              <M3Pressable onPress={() => setPanel(panel === 'toc' ? null : 'toc')} feedback="subtle" style={styles.chapterCenter}>
                <Text numberOfLines={1} style={[styles.chapterCenterTitle, { color: chromeTheme.text }]}>
                  {chapterLabel(currentChapter.title)}
                </Text>
                <Text style={[styles.chapterCenterMeta, { color: chromeTheme.muted }]}>
                  {currentIndex + 1}/{chapters.length}
                  {preferences.readingMode === 'page' && pageStatus.pageCount > 1 ? ` · ${pageStatus.pageIndex}/${pageStatus.pageCount} 页` : ''}
                </Text>
              </M3Pressable>
              <M3Pressable
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
          entering={reduceMotion ? FadeIn.duration(80) : SlideInDown.duration(motion.duration.medium)}
          exiting={SlideOutDown.duration(motion.duration.short)}
          style={styles.panel}>
          <AdaptiveSurface style={[styles.panelSurface, { backgroundColor: chromeTheme.panelSurface, borderColor: chromeTheme.border }]}>
            <View style={[styles.panelHandle, { backgroundColor: chromeTheme.controlBorder }]} />
            <View style={styles.panelHeader}>
              <View style={styles.panelTitleStack}>
                <View style={styles.panelTitleRow}>
                  <MaterialSymbol name={panelIcon(panel)} color={chromeTheme.accent} description={panelTitle(panel)} size={20} />
                  <Text style={[styles.panelTitle, { color: chromeTheme.text }]}>{panelTitle(panel)}</Text>
                </View>
              </View>
              <M3Pressable
                accessibilityRole="button"
                accessibilityLabel="关闭"
                hitSlop={10}
                onPress={closePanel}
                feedback="subtle"
                style={[styles.closeButton, { backgroundColor: chromeTheme.subtleSurface }]}>
                <MaterialSymbol name="close" color={chromeTheme.text} description="关闭" size={18} />
              </M3Pressable>
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
              <View style={styles.panelBody}>
                <TextInput
                  value={searchQuery}
                  onChangeText={setSearchQuery}
                  placeholder="搜索这本书里的文字"
                  placeholderTextColor={chromeTheme.muted}
                  returnKeyType="search"
                  onSubmitEditing={Keyboard.dismiss}
                  style={[styles.panelInput, { backgroundColor: chromeTheme.subtleSurface, borderColor: chromeTheme.controlBorder, color: chromeTheme.text }]}
                />
                <ScrollView contentContainerStyle={styles.panelList}>
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
                    onPress={addBookmark}
                    feedback={currentBookmark ? 'subtle' : 'standard'}
                    accessibilityRole="button"
                    accessibilityState={{ selected: Boolean(currentBookmark) }}
                    style={[
                      styles.annotationActionCard,
                      { backgroundColor: currentBookmark ? chromeTheme.accent : chromeTheme.subtleSurface, borderColor: chromeTheme.controlBorder },
                    ]}>
                    <View style={styles.annotationActionHeader}>
                      <MaterialSymbol name={currentBookmark ? 'check.circle' : 'bookmark'} color={currentBookmark ? chromeTheme.accentText : chromeTheme.accent} description="本章书签" size={18} />
                      <Text style={[styles.annotationActionTitle, { color: currentBookmark ? chromeTheme.accentText : chromeTheme.text }]}>
                        {currentBookmark ? '取消书签' : '本章书签'}
                      </Text>
                    </View>
                    <Text style={[styles.annotationActionBody, { color: currentBookmark ? chromeTheme.accentText : chromeTheme.muted }]}>
                      {currentBookmark ? '已标记当前章' : '收藏当前位置'}
                    </Text>
                  </M3Pressable>
                  <M3Pressable
                    onPress={() => webViewRef.current?.injectJavaScript('window.__INBOX_CAPTURE_SELECTION && window.__INBOX_CAPTURE_SELECTION(); true;')}
                    feedback="standard"
                    accessibilityRole="button"
                    style={[styles.annotationActionCard, { backgroundColor: chromeTheme.subtleSurface, borderColor: chromeTheme.controlBorder }]}>
                    <View style={styles.annotationActionHeader}>
                      <MaterialSymbol name="highlighter" color={chromeTheme.accent} description="划线" size={18} />
                      <Text style={[styles.annotationActionTitle, { color: chromeTheme.text }]}>划线</Text>
                    </View>
                    <Text style={[styles.annotationActionBody, { color: chromeTheme.muted }]}>先选中文字</Text>
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
                <M3Pressable onPress={saveNote} feedback="standard" style={styles.saveNoteButton}>
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
                      <Text style={[styles.emptyPanelBody, { color: chromeTheme.muted }]}>书签、划线和笔记会出现在这里。</Text>
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
                          <MaterialSymbol name="check" color={brand.readerThemes[theme].accentText} description="当前阅读主题" size={14} />
                        </View>
                      ) : null}
                      <Text style={[styles.themeChipText, { color: preferences.readerTheme === theme ? brand.readerThemes[theme].onPrimaryContainer : brand.readerThemes[theme].text }]}>
                        {themeLabels[theme]}
                      </Text>
                    </M3Pressable>
                  ))}
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

      {notice && (
        <Animated.View entering={FadeIn.duration(reduceMotion ? 80 : motion.duration.short)} exiting={FadeOut.duration(motion.duration.short)} style={styles.noticeToast}>
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
  webView: {
    flex: 1,
  },
  stateWrap: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: 20,
  },
  topChrome: {
    position: 'absolute',
    left: 16,
    right: 16,
    top: 48,
  },
  topBar: {
    minHeight: 56,
    borderRadius: 24,
    borderCurve: 'continuous',
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    paddingHorizontal: 9,
    gap: 12,
    boxShadow: '0 18px 38px rgba(0, 0, 0, 0.22)',
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
    left: 16,
    right: 16,
    bottom: 18,
  },
  readerDock: {
    borderRadius: 28,
    borderCurve: 'continuous',
    borderWidth: 1,
    padding: 8,
    gap: 7,
    boxShadow: '0 22px 46px rgba(0, 0, 0, 0.28)',
  },
  chapterStrip: {
    minHeight: 46,
    borderRadius: 20,
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
    minHeight: 34,
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
    minHeight: 42,
    borderRadius: brand.radius.round,
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
    left: 14,
    right: 14,
    bottom: 16,
    maxHeight: '74%',
  },
  panelSurface: {
    borderRadius: 28,
    borderCurve: 'continuous',
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingTop: 10,
    paddingBottom: 14,
    gap: 12,
    boxShadow: '0 24px 52px rgba(0, 0, 0, 0.30)',
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
    width: 38,
    minWidth: 38,
    minHeight: 38,
    borderRadius: brand.radius.round,
    borderCurve: 'continuous',
    alignItems: 'center',
    justifyContent: 'center',
  },
  panelBody: {
    gap: 12,
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
    backgroundColor: '#E7D9B7',
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  currentBadgeText: {
    color: '#171811',
    fontSize: 10,
    fontWeight: '900',
    letterSpacing: 0,
  },
  searchMatchText: {
    color: '#171811',
    backgroundColor: '#E7D9B7',
    fontWeight: '900',
  },
  saveNoteButton: {
    alignSelf: 'flex-start',
    backgroundColor: '#E7D9B7',
    borderRadius: brand.radius.round,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  saveNoteText: {
    color: '#171811',
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
