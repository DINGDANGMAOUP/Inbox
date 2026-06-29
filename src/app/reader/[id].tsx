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
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import Animated, { FadeIn, FadeOut, SlideInDown, SlideOutDown } from 'react-native-reanimated';
import WebView, { type WebViewMessageEvent } from 'react-native-webview';

import { AdaptiveSurface } from '@/components/reader/adaptive-surface';
import { IconButton } from '@/components/reader/icon-button';
import { brand } from '@/constants/brand';
import { themeAssets } from '@/constants/theme-assets';
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
import type { Annotation, Book, Chapter, ReaderPreferences, SearchResult } from '@/types/reader';

type Panel = 'toc' | 'search' | 'notes' | 'settings' | null;
type AnnotationFilter = 'all' | Annotation['type'];

const themeValues: Record<ReaderPreferences['theme'], { bg: string; text: string; muted: string }> = {
  mist: { bg: '#E8EBF2', text: '#263846', muted: '#667381' },
  deep: { bg: brand.colors.readingInk, text: '#E8EBF2', muted: '#AEB8C2' },
  reading: { bg: brand.colors.readingPaper, text: '#26313A', muted: '#7C817E' },
};

const annotationLabels: Record<Annotation['type'], string> = {
  bookmark: '书签',
  highlight: '划线',
  note: '笔记',
};

const themeLabels: Record<ReaderPreferences['theme'], string> = {
  mist: '雾蓝',
  deep: '深海',
  reading: '阅读',
};

const readingModeLabels: Record<ReaderPreferences['readingMode'], string> = {
  scroll: '连续滚动',
  page: '横向翻页',
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
  const theme = themeValues[preferences.theme];
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
      padding: 132px ${preferences.margin}px 330px;
      background: var(--reader-bg, ${theme.bg});
      color: var(--reader-text, ${theme.text});
      font-family: "Songti SC", "Noto Serif CJK SC", "Noto Serif", Georgia, serif;
      font-size: var(--reader-font-size, ${preferences.fontSize}px);
      line-height: var(--reader-line-height, ${preferences.lineHeight});
      letter-spacing: 0;
      text-rendering: optimizeLegibility;
    }
    p { margin: 0 0 1.08em; }
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
  const theme = themeValues[preferences.theme];
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
        document.documentElement.style.setProperty("--reader-bg", "${theme.bg}");
        document.documentElement.style.setProperty("--reader-text", "${theme.text}");
        document.documentElement.style.background = "${theme.bg}";
        document.body.style.background = "${theme.bg}";
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
    theme: 'mist',
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
  const readerTheme = themeValues[preferences.theme];
  const isDeepTheme = preferences.theme === 'deep';
  const chromeTheme = {
    surface: isDeepTheme ? 'rgba(31, 44, 55, 0.92)' : brand.colors.paperElevated,
    panelSurface: isDeepTheme ? '#1F2C37' : brand.colors.paperElevated,
    subtleSurface: isDeepTheme ? 'rgba(232, 235, 242, 0.08)' : 'rgba(48, 67, 82, 0.065)',
    border: isDeepTheme ? 'rgba(232, 235, 242, 0.14)' : 'rgba(255, 255, 255, 0.64)',
    controlBorder: isDeepTheme ? 'rgba(232, 235, 242, 0.12)' : 'rgba(48, 67, 82, 0.10)',
    text: isDeepTheme ? brand.colors.white : brand.colors.ink,
    muted: isDeepTheme ? 'rgba(232, 235, 242, 0.70)' : brand.colors.muted,
    accent: isDeepTheme ? '#D7D2CC' : brand.colors.copper,
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
      <View style={[styles.loading, { backgroundColor: readerTheme.bg }]}>
        <ActivityIndicator color={readerTheme.text} />
        <Text style={[styles.loadingText, { color: readerTheme.text }]}>正在打开阅读器</Text>
      </View>
    );
  }

  if (!book || !currentChapter) {
    return (
      <View style={[styles.loading, { backgroundColor: readerTheme.bg }]}>
        <Text style={[styles.loadingText, { color: readerTheme.text }]}>未找到这本书</Text>
      </View>
    );
  }

  const readerSource =
    currentChapter.htmlPath && book.format === 'epub'
      ? { uri: currentChapter.htmlPath }
      : { html: readerHtmlForText(currentChapter, preferences) };

  return (
    <View style={[styles.screen, { backgroundColor: readerTheme.bg }]}>
      <Link.AppleZoomTarget>
        <View style={styles.readerCanvas}>
          <WebView
            key={`${currentChapter.id}-${preferences.theme}-${preferences.fontSize}-${preferences.lineHeight}-${preferences.margin}-${preferences.readingMode}`}
            ref={webViewRef}
            originWhitelist={['*']}
            source={readerSource}
            onMessage={handleWebMessage}
            injectedJavaScript={injectedJavaScript}
            javaScriptEnabled
            showsVerticalScrollIndicator={false}
            style={[styles.webView, { backgroundColor: readerTheme.bg }]}
          />
        </View>
      </Link.AppleZoomTarget>

      {chromeVisible && (
        <Animated.View
          entering={FadeIn.duration(reduceMotion ? 80 : 160)}
          exiting={FadeOut.duration(140)}
          style={styles.topChrome}>
          <AdaptiveSurface style={[styles.topBar, { backgroundColor: chromeTheme.surface, borderColor: chromeTheme.border }]}>
            <Pressable
              onPress={() => router.back()}
              style={({ pressed }) => [styles.backButton, { backgroundColor: chromeTheme.subtleSurface }, pressed && styles.pressed]}>
              <Text style={[styles.backText, { color: chromeTheme.text }]}>返回</Text>
            </Pressable>
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
          entering={reduceMotion ? FadeIn.duration(80) : SlideInDown.duration(180)}
          exiting={SlideOutDown.duration(150)}
          style={styles.bottomChrome}>
          <AdaptiveSurface style={[styles.readerDock, { backgroundColor: chromeTheme.surface, borderColor: chromeTheme.border }]}>
            <View style={[styles.chapterStrip, { backgroundColor: chromeTheme.subtleSurface, borderColor: chromeTheme.controlBorder }]}>
              <Pressable
                disabled={currentIndex === 0}
                onPress={() => goToChapter(Math.max(0, currentIndex - 1), preferences.readingMode === 'page' ? 1 : 0)}
                style={({ pressed }) => [styles.chapterTextButton, currentIndex === 0 && styles.disabledChapterButton, pressed && styles.pressed]}>
                <Text style={[styles.chapterTextButtonText, { color: chromeTheme.text }]}>上一章</Text>
              </Pressable>
              <Pressable onPress={() => setPanel(panel === 'toc' ? null : 'toc')} style={({ pressed }) => [styles.chapterCenter, pressed && styles.pressed]}>
                <Text numberOfLines={1} style={[styles.chapterCenterTitle, { color: chromeTheme.text }]}>
                  {chapterLabel(currentChapter.title)}
                </Text>
                <Text style={[styles.chapterCenterMeta, { color: chromeTheme.muted }]}>
                  {currentIndex + 1}/{chapters.length}
                  {preferences.readingMode === 'page' && pageStatus.pageCount > 1 ? ` · ${pageStatus.pageIndex}/${pageStatus.pageCount} 页` : ''}
                </Text>
              </Pressable>
              <Pressable
                disabled={currentIndex >= chapters.length - 1}
                onPress={() => goToChapter(Math.min(chapters.length - 1, currentIndex + 1), 0)}
                style={({ pressed }) => [styles.chapterTextButton, currentIndex >= chapters.length - 1 && styles.disabledChapterButton, pressed && styles.pressed]}>
                <Text style={[styles.chapterTextButtonText, { color: chromeTheme.text }]}>下一章</Text>
              </Pressable>
            </View>
            <View style={styles.toolRow}>
              <IconButton
                style={[
                  styles.dockButton,
                  { backgroundColor: panel === 'toc' ? chromeTheme.accent : chromeTheme.subtleSurface, borderColor: chromeTheme.controlBorder },
                ]}
                tintColor={panel === 'toc' ? (isDeepTheme ? brand.colors.ink : brand.colors.white) : chromeTheme.text}
                icon="list.bullet"
                label="目录"
                onPress={() => setPanel(panel === 'toc' ? null : 'toc')}
              />
              <IconButton
                style={[
                  styles.dockButton,
                  { backgroundColor: panel === 'search' ? chromeTheme.accent : chromeTheme.subtleSurface, borderColor: chromeTheme.controlBorder },
                ]}
                tintColor={panel === 'search' ? (isDeepTheme ? brand.colors.ink : brand.colors.white) : chromeTheme.text}
                icon="magnifyingglass"
                label="搜索"
                onPress={() => setPanel(panel === 'search' ? null : 'search')}
              />
              <IconButton
                style={[
                  styles.dockButton,
                  { backgroundColor: panel === 'notes' ? chromeTheme.accent : chromeTheme.subtleSurface, borderColor: chromeTheme.controlBorder },
                ]}
                tintColor={panel === 'notes' ? (isDeepTheme ? brand.colors.ink : brand.colors.white) : chromeTheme.text}
                icon="note"
                label="标注"
                onPress={() => setPanel(panel === 'notes' ? null : 'notes')}
              />
              <IconButton
                style={[
                  styles.dockButton,
                  { backgroundColor: panel === 'settings' ? chromeTheme.accent : chromeTheme.subtleSurface, borderColor: chromeTheme.controlBorder },
                ]}
                tintColor={panel === 'settings' ? (isDeepTheme ? brand.colors.ink : brand.colors.white) : chromeTheme.text}
                icon="textformat.size"
                label="样式"
                onPress={() => setPanel(panel === 'settings' ? null : 'settings')}
              />
            </View>
          </AdaptiveSurface>
        </Animated.View>
      )}

      {panel && (
        <Animated.View
          entering={reduceMotion ? FadeIn.duration(80) : SlideInDown.duration(180)}
          exiting={SlideOutDown.duration(140)}
          style={styles.panel}>
          <AdaptiveSurface style={[styles.panelSurface, { backgroundColor: chromeTheme.panelSurface, borderColor: chromeTheme.border }]}>
            <View style={styles.panelHeader}>
              <Text style={[styles.panelTitle, { color: chromeTheme.text }]}>
                {panel === 'toc' ? '目录' : panel === 'search' ? '书内搜索' : panel === 'settings' ? '阅读样式' : '标注与笔记'}
              </Text>
              <Pressable hitSlop={10} onPress={closePanel} style={({ pressed }) => [styles.closeButton, pressed && styles.pressed]}>
                <Text style={[styles.closeText, { color: chromeTheme.muted }]}>关闭</Text>
              </Pressable>
            </View>

            {panel === 'toc' && (
              <View style={styles.panelBody}>
                <Text style={[styles.panelSummary, { color: chromeTheme.muted }]}>
                  共 {chapters.length} 章 · 当前 {currentIndex + 1}/{chapters.length}
                </Text>
                <ScrollView contentContainerStyle={styles.panelList}>
                  {chapters.map((chapter, index) => {
                    const active = index === currentIndex;
                    return (
                      <Pressable
                        key={chapter.id}
                        onPress={() => goToChapter(index)}
                        style={[styles.panelRow, styles.tocRow, active && styles.activePanelRow]}>
                        <Text style={[styles.tocIndex, active && styles.activeTocIndex]}>{String(index + 1).padStart(2, '0')}</Text>
                        <View style={styles.tocContent}>
                          <View style={styles.tocTitleRow}>
                            <Text numberOfLines={2} style={[styles.panelRowTitle, active && styles.activePanelRowTitle]}>
                              {chapterLabel(chapter.title)}
                            </Text>
                            {active && (
                              <View style={styles.currentBadge}>
                                <Text style={styles.currentBadgeText}>当前</Text>
                              </View>
                            )}
                          </View>
                          <Text style={styles.panelRowMeta}>{chapter.wordCount.toLocaleString()} 字</Text>
                        </View>
                      </Pressable>
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
                    <Pressable
                      key={`${result.chapterId}-${result.matchOffset}`}
                      onPress={() => goToSearchResult(result)}
                      style={[styles.panelRow, { backgroundColor: chromeTheme.subtleSurface, borderColor: chromeTheme.controlBorder }]}>
                      <Text style={[styles.panelRowTitle, { color: chromeTheme.text }]}>{chapterLabel(result.chapterTitle)}</Text>
                      <SearchExcerpt text={result.excerpt} query={searchQuery} />
                    </Pressable>
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
                  <Pressable
                    onPress={addBookmark}
                    style={[
                      styles.annotationActionCard,
                      { backgroundColor: currentBookmark ? chromeTheme.accent : chromeTheme.subtleSurface, borderColor: chromeTheme.controlBorder },
                    ]}>
                    <Text style={[styles.annotationActionTitle, { color: currentBookmark ? (isDeepTheme ? brand.colors.ink : brand.colors.white) : chromeTheme.text }]}>
                      {currentBookmark ? '取消书签' : '本章书签'}
                    </Text>
                    <Text style={[styles.annotationActionBody, { color: currentBookmark ? (isDeepTheme ? brand.colors.ink : brand.colors.white) : chromeTheme.muted }]}>
                      {currentBookmark ? '已标记当前章' : '收藏当前位置'}
                    </Text>
                  </Pressable>
                  <Pressable
                    onPress={() => webViewRef.current?.injectJavaScript('window.__INBOX_CAPTURE_SELECTION && window.__INBOX_CAPTURE_SELECTION(); true;')}
                    style={[styles.annotationActionCard, { backgroundColor: chromeTheme.subtleSurface, borderColor: chromeTheme.controlBorder }]}>
                    <Text style={[styles.annotationActionTitle, { color: chromeTheme.text }]}>划线</Text>
                    <Text style={[styles.annotationActionBody, { color: chromeTheme.muted }]}>先选中文字</Text>
                  </Pressable>
                </View>
                <TextInput
                  value={noteDraft}
                  onChangeText={setNoteDraft}
                  placeholder="为本章写一条笔记"
                  placeholderTextColor={chromeTheme.muted}
                  multiline
                  style={[styles.panelInput, styles.noteInput, { backgroundColor: chromeTheme.subtleSurface, borderColor: chromeTheme.controlBorder, color: chromeTheme.text }]}
                />
                <Pressable onPress={saveNote} style={({ pressed }) => [styles.saveNoteButton, pressed && styles.pressed]}>
                  <Text style={styles.saveNoteText}>保存笔记</Text>
                </Pressable>
                <View style={styles.filterRow}>
                  {annotationFilters.map((filter) => {
                    const active = annotationFilter === filter.value;
                    return (
                      <Pressable
                        key={filter.value}
                        onPress={() => setAnnotationFilter(filter.value)}
                        style={[
                          styles.filterChip,
                          { backgroundColor: active ? chromeTheme.accent : chromeTheme.subtleSurface, borderColor: chromeTheme.controlBorder },
                        ]}>
                        <Text style={[styles.filterChipText, { color: active ? (isDeepTheme ? brand.colors.ink : brand.colors.white) : chromeTheme.text }]}>
                          {filter.label} {annotationCounts[filter.value]}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>
                <ScrollView contentContainerStyle={styles.panelList}>
                  {filteredAnnotations.map((annotation) => (
                    <Pressable
                      key={annotation.id}
                      onPress={() => goToAnnotation(annotation)}
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
                        <Pressable
                          hitSlop={8}
                          onPress={async () => {
                            await deleteAnnotation(db, annotation.id);
                            setAnnotations(await listAnnotations(db, book.id));
                          }}>
                          <Text style={[styles.deleteText, { color: chromeTheme.accent }]}>删除</Text>
                        </Pressable>
                      </View>
                    </Pressable>
                  ))}
                  {filteredAnnotations.length === 0 && (
                    <View style={[styles.emptyPanelState, { backgroundColor: chromeTheme.subtleSurface, borderColor: chromeTheme.controlBorder }]}>
                      <Text style={[styles.emptyPanelTitle, { color: chromeTheme.text }]}>还没有{annotationFilter === 'all' ? '标注' : annotationLabels[annotationFilter]}</Text>
                      <Text style={[styles.emptyPanelBody, { color: chromeTheme.muted }]}>可以在正文里添加书签、划线或笔记，之后从这里快速找回。</Text>
                    </View>
                  )}
                </ScrollView>
              </View>
            )}

            {panel === 'settings' && (
              <View style={styles.settingsPanel}>
                <View style={[styles.modeSwitch, { backgroundColor: chromeTheme.subtleSurface, borderColor: chromeTheme.controlBorder }]}>
                  {(['scroll', 'page'] as const).map((mode) => {
                    const active = preferences.readingMode === mode;
                    return (
                      <Pressable
                        key={mode}
                        onPress={() => updatePreference({ ...preferences, readingMode: mode })}
                        style={[styles.modeButton, active && { backgroundColor: chromeTheme.accent }]}>
                        <Text style={[styles.modeButtonText, { color: active ? (isDeepTheme ? brand.colors.ink : brand.colors.white) : chromeTheme.text }]}>
                          {readingModeLabels[mode]}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>
                <View style={styles.themeRow}>
                  {brand.themeOrder.map((theme) => (
                    <Pressable
                      key={theme}
                      onPress={() => updatePreference({ ...preferences, theme })}
                      style={[
                        styles.themeChip,
                        {
                          backgroundColor: themeValues[theme].bg,
                          borderColor: preferences.theme === theme ? brand.themes[theme].accent : brand.themes[theme].line,
                        },
                      ]}>
                      <Image source={themeAssets[theme].cover} contentFit="cover" style={styles.themeChipImage} />
                      <View style={[styles.themeChipOverlay, theme === 'deep' && styles.themeChipDeepOverlay]} />
                      <Text style={[styles.themeChipText, { color: themeValues[theme].text }]}>{themeLabels[theme]}</Text>
                    </Pressable>
                  ))}
                </View>
                <View style={styles.stepperRow}>
                  <Text style={[styles.stepperLabel, { color: chromeTheme.text }]}>字号 {preferences.fontSize}</Text>
                  <View style={styles.stepperButtons}>
                    <Pressable onPress={() => updatePreference({ ...preferences, fontSize: Math.max(15, preferences.fontSize - 1) })} style={styles.stepButton}>
                      <Text style={styles.stepText}>-</Text>
                    </Pressable>
                    <Pressable onPress={() => updatePreference({ ...preferences, fontSize: Math.min(28, preferences.fontSize + 1) })} style={styles.stepButton}>
                      <Text style={styles.stepText}>+</Text>
                    </Pressable>
                  </View>
                </View>
                <View style={styles.stepperRow}>
                  <Text style={[styles.stepperLabel, { color: chromeTheme.text }]}>行距 {preferences.lineHeight.toFixed(1)}</Text>
                  <View style={styles.stepperButtons}>
                    <Pressable onPress={() => updatePreference({ ...preferences, lineHeight: Math.max(1.35, preferences.lineHeight - 0.1) })} style={styles.stepButton}>
                      <Text style={styles.stepText}>-</Text>
                    </Pressable>
                    <Pressable onPress={() => updatePreference({ ...preferences, lineHeight: Math.min(2.2, preferences.lineHeight + 0.1) })} style={styles.stepButton}>
                      <Text style={styles.stepText}>+</Text>
                    </Pressable>
                  </View>
                </View>
              </View>
            )}
          </AdaptiveSurface>
        </Animated.View>
      )}

      {notice && (
        <Animated.View entering={FadeIn.duration(reduceMotion ? 80 : 140)} exiting={FadeOut.duration(120)} style={styles.noticeToast}>
          <Text style={styles.noticeToastText}>{notice}</Text>
        </Animated.View>
      )}

    </View>
  );
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
  loading: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
  },
  loadingText: {
    fontSize: 17,
    fontWeight: '900',
    letterSpacing: 0,
  },
  topChrome: {
    position: 'absolute',
    left: 14,
    right: 14,
    top: 44,
  },
  topBar: {
    minHeight: 62,
    borderRadius: brand.radius.medium,
    borderCurve: 'continuous',
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    gap: 12,
    backgroundColor: brand.colors.paperElevated,
    borderColor: 'rgba(255, 255, 255, 0.64)',
    boxShadow: brand.shadow.chrome,
  },
  backButton: {
    minHeight: 42,
    justifyContent: 'center',
    paddingHorizontal: 12,
    paddingVertical: 9,
    borderRadius: brand.radius.round,
    backgroundColor: 'rgba(48, 67, 82, 0.08)',
  },
  backText: {
    color: brand.colors.ink,
    fontSize: 14,
    fontWeight: '900',
  },
  titleStack: {
    flex: 1,
    gap: 3,
  },
  chromeTitle: {
    color: brand.colors.ink,
    fontSize: 15,
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
    left: 14,
    right: 14,
    bottom: 14,
  },
  readerDock: {
    borderRadius: brand.radius.medium,
    borderCurve: 'continuous',
    padding: 9,
    gap: 8,
    backgroundColor: brand.colors.paperElevated,
    borderColor: 'rgba(255, 255, 255, 0.64)',
    boxShadow: brand.shadow.chrome,
  },
  chapterControls: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 8,
  },
  chapterStrip: {
    minHeight: 48,
    borderRadius: brand.radius.medium,
    borderCurve: 'continuous',
    borderWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 6,
    paddingVertical: 5,
  },
  chapterTextButton: {
    minWidth: 64,
    minHeight: 36,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: brand.radius.round,
    borderCurve: 'continuous',
  },
  disabledChapterButton: {
    opacity: 0.36,
  },
  chapterTextButtonText: {
    fontSize: 12,
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
  toolRow: {
    flexDirection: 'row',
    flexWrap: 'nowrap',
    justifyContent: 'space-between',
    gap: 6,
  },
  dockButton: {
    flex: 1,
    minWidth: 0,
    minHeight: 38,
    justifyContent: 'center',
    paddingHorizontal: 6,
    backgroundColor: 'rgba(48, 67, 82, 0.065)',
    borderColor: 'rgba(48, 67, 82, 0.10)',
  },
  panel: {
    position: 'absolute',
    left: 12,
    right: 12,
    bottom: 12,
    maxHeight: '72%',
  },
  panelSurface: {
    borderRadius: brand.radius.medium,
    borderCurve: 'continuous',
    padding: 16,
    gap: 14,
    backgroundColor: brand.colors.paperElevated,
    borderColor: 'rgba(255, 255, 255, 0.70)',
    boxShadow: brand.shadow.chrome,
  },
  panelHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  panelTitle: {
    color: brand.colors.ink,
    fontSize: 20,
    fontWeight: '900',
    letterSpacing: 0,
  },
  closeButton: {
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  closeText: {
    color: brand.colors.island,
    fontWeight: '900',
  },
  panelBody: {
    gap: 12,
  },
  panelSummary: {
    color: brand.colors.muted,
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 0,
  },
  panelInput: {
    minHeight: 48,
    borderRadius: brand.radius.medium,
    borderCurve: 'continuous',
    backgroundColor: brand.colors.paperElevated,
    borderColor: brand.colors.line,
    borderWidth: 1,
    color: brand.colors.ink,
    paddingHorizontal: 12,
    fontSize: 15,
    fontWeight: '600',
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
    borderRadius: brand.radius.medium,
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
    borderRadius: brand.radius.medium,
    borderCurve: 'continuous',
    backgroundColor: 'rgba(247, 248, 251, 0.88)',
    borderWidth: 1,
    borderColor: brand.colors.line,
    padding: 12,
    gap: 6,
  },
  activePanelRow: {
    borderColor: brand.colors.island,
    backgroundColor: brand.colors.islandSoft,
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
  activeTocIndex: {
    color: brand.colors.islandDeep,
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
  activePanelRowTitle: {
    color: brand.colors.islandDeep,
  },
  panelRowMeta: {
    color: brand.colors.muted,
    fontSize: 12,
    lineHeight: 17,
  },
  currentBadge: {
    borderRadius: brand.radius.round,
    backgroundColor: brand.colors.island,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  currentBadgeText: {
    color: brand.colors.white,
    fontSize: 10,
    fontWeight: '900',
    letterSpacing: 0,
  },
  searchMatchText: {
    color: brand.colors.ink,
    backgroundColor: brand.colors.copperSoft,
    fontWeight: '900',
  },
  saveNoteButton: {
    alignSelf: 'flex-start',
    backgroundColor: brand.colors.ink,
    borderRadius: brand.radius.round,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  saveNoteText: {
    color: brand.colors.white,
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
    borderRadius: brand.radius.medium,
    borderCurve: 'continuous',
    borderWidth: 1,
    paddingHorizontal: 13,
    paddingVertical: 12,
    justifyContent: 'center',
    gap: 4,
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
  filterChip: {
    minHeight: 34,
    borderRadius: brand.radius.round,
    borderCurve: 'continuous',
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 12,
  },
  filterChipText: {
    color: brand.colors.ink,
    fontSize: 12,
    fontWeight: '900',
    letterSpacing: 0,
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
  modeSwitch: {
    minHeight: 48,
    borderRadius: brand.radius.round,
    borderCurve: 'continuous',
    borderWidth: 1,
    padding: 4,
    flexDirection: 'row',
    gap: 4,
  },
  modeButton: {
    flex: 1,
    minHeight: 38,
    borderRadius: brand.radius.round,
    borderCurve: 'continuous',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 10,
  },
  modeButtonText: {
    fontSize: 13,
    fontWeight: '900',
    letterSpacing: 0,
  },
  themeRow: {
    flexDirection: 'row',
    gap: 10,
  },
  themeChip: {
    flex: 1,
    minHeight: 46,
    borderRadius: brand.radius.medium,
    borderCurve: 'continuous',
    borderWidth: 2,
    overflow: 'hidden',
    justifyContent: 'center',
    alignItems: 'center',
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
  themeChipDeepOverlay: {
    backgroundColor: 'rgba(9, 15, 20, 0.22)',
  },
  themeChipText: {
    fontWeight: '900',
    textTransform: 'capitalize',
    letterSpacing: 0,
    zIndex: 1,
  },
  stepperRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  stepperLabel: {
    color: brand.colors.ink,
    fontWeight: '900',
    fontSize: 16,
  },
  stepperButtons: {
    flexDirection: 'row',
    gap: 8,
  },
  stepButton: {
    width: 42,
    height: 42,
    borderRadius: brand.radius.round,
    backgroundColor: brand.colors.ink,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepText: {
    color: brand.colors.white,
    fontSize: 22,
    fontWeight: '900',
  },
  noticeToast: {
    position: 'absolute',
    left: 24,
    right: 24,
    top: 122,
    minHeight: 46,
    borderRadius: brand.radius.medium,
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
  pressed: {
    opacity: 0.72,
    transform: [{ scale: 0.98 }],
  },
});
