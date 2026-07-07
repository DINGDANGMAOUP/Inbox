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
  Keyboard,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  useWindowDimensions,
} from 'react-native';
import Animated, { FadeIn, FadeOut } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import WebView, { type WebViewMessageEvent } from 'react-native-webview';

import { AdaptiveSurface } from '@/components/reader/adaptive-surface';
import { IconButton } from '@/components/reader/icon-button';
import { M3FilterChip, M3Screen, M3SegmentedControl, M3StatePanel, M3Stepper } from '@/components/reader/m3';
import { m3Motion } from '@/components/reader/motion-presets';
import { M3Pressable } from '@/components/reader/m3-pressable';
import { MaterialSymbol, type MaterialSymbolName } from '@/components/reader/material-symbol';
import { brand } from '@/constants/brand';
import { readerFontCssStack, readerFontFamilies, readerFontFamilyOrder, readerNativeFontFamily } from '@/constants/reader-fonts';
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
type ReaderPanel = Exclude<Panel, null>;
type AnnotationFilter = 'all' | Annotation['type'];
type ReaderInsets = { top: number; bottom: number };
type TextSelection = {
  selectedText: string;
  offset: number;
  x: number;
  y: number;
};
type ReaderAnnotationMark = {
  id: string;
  type: 'highlight' | 'note';
  selectedText: string;
  quote?: string;
  offset?: number;
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

function renderChapterHeading(chapter: Chapter, chapterIndex: number, chapterCount: number) {
  const title = chapterLabel(chapter.title);
  const kicker = chapterCount > 1 ? `第 ${chapterIndex + 1} / ${chapterCount} 章` : '正文';

  return `<header class="chapter-heading">
    <div class="chapter-heading-kicker">${escapeHtml(kicker)}</div>
    <h1>${escapeHtml(title)}</h1>
    <div class="chapter-heading-rule" aria-hidden="true"></div>
  </header>`;
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

function readerHtmlForText(chapter: Chapter, preferences: ReaderPreferences, readerInsets: ReaderInsets, restoreRatio: number, chapterIndex: number, chapterCount: number) {
  const theme = brand.readerThemes[preferences.readerTheme];
  const fontStack = readerFontCssStack(preferences.fontFamily);
  const initialInsets = {
    top: Math.max(32, Math.round(readerInsets.top)),
    bottom: Math.max(48, Math.round(readerInsets.bottom)),
  };
  const pageModeCss =
    preferences.readingMode === 'page'
      ? `
    html {
      height: 100%;
      overflow-x: hidden;
      overflow-y: hidden;
    }
    body {
      width: 100vw;
      max-width: none;
      min-height: 100vh;
      height: 100vh;
      margin-left: 0;
      margin-right: 0;
      padding-left: 0;
      padding-right: 0;
      overflow: visible;
      column-width: 100vw;
      column-gap: 0;
      column-fill: auto;
      -webkit-column-width: 100vw;
      -webkit-column-gap: 0;
      -webkit-column-fill: auto;
    }
    .chapter-heading,
    .book-content {
      box-sizing: border-box;
      padding-left: ${preferences.margin}px;
      padding-right: ${preferences.margin}px;
      -webkit-box-decoration-break: clone;
      box-decoration-break: clone;
    }`
      : '';
  const showChapterHeading = shouldShowChapterHeading(chapter.title, chapterCount);
  const textBlocks = chapter.textContent
    .replace(/\\r/g, '\n')
    .replace(/\r/g, '\n')
    .split(/\n{1,}/);
  let checkedOpeningBlock = false;
  const paragraphs = textBlocks
    .filter((block) => {
      if (!showChapterHeading || checkedOpeningBlock) {
        return true;
      }
      if (!cleanInlineContent(block)) {
        return true;
      }

      checkedOpeningBlock = true;
      return !isDuplicateChapterHeading(block, chapter.title);
    })
    .map(renderTextBlock)
    .filter(Boolean)
    .join('\n');

  return `<!doctype html>
<html>
<head>
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0">
  <style>
    html {
      background: ${theme.background};
    }
    body {
      margin: 0;
      padding: ${initialInsets.top}px ${preferences.margin}px ${initialInsets.bottom}px;
      background: var(--reader-bg, ${theme.background});
      color: var(--reader-text, ${theme.text});
      font-family: var(--reader-font-family, ${fontStack});
      font-size: var(--reader-font-size, ${preferences.fontSize}px);
      line-height: var(--reader-line-height, ${preferences.lineHeight});
      letter-spacing: 0;
      text-align: justify;
      text-justify: inter-character;
      text-rendering: optimizeLegibility;
      line-break: strict;
      word-break: normal;
      overflow-wrap: break-word;
      hanging-punctuation: allow-end;
      box-sizing: border-box;
      max-width: 720px;
      margin-left: auto;
      margin-right: auto;
      -webkit-user-select: none;
      user-select: none;
      -webkit-touch-callout: none;
    }
    ${pageModeCss}
    .chapter-heading {
      padding: 4.8em 0 3em;
      text-align: center;
      break-after: avoid;
      page-break-after: avoid;
    }
    .chapter-heading-kicker {
      margin-bottom: 1.4em;
      color: var(--reader-muted, ${theme.muted});
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      font-size: 0.68em;
      font-weight: 800;
      letter-spacing: 0.18em;
      line-height: 1.2;
    }
    .chapter-heading h1 {
      max-width: 18em;
      margin: 0 auto;
      font-size: 1.74em;
      font-weight: 600;
      line-height: 1.28;
      letter-spacing: 0.05em;
      text-align: center;
      text-indent: 0;
      text-wrap: balance;
    }
    .chapter-heading-rule {
      width: 3.2em;
      height: 1px;
      margin: 1.6em auto 0;
      background: currentColor;
      opacity: 0.28;
    }
    .book-content p {
      margin: 0;
      text-indent: 2em;
    }
    .book-content h2 {
      margin: 2.4em 0 1.1em;
      font-size: 1.2em;
      font-weight: 600;
      line-height: 1.28;
      text-align: center;
      text-indent: 0;
      text-wrap: balance;
    }
    .book-content .section-path {
      margin: 2em 0 1em;
      color: var(--reader-muted, ${theme.muted});
      font-size: 0.82em;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      font-weight: 700;
      text-align: center;
      text-indent: 0;
    }
    .inbox-custom-selection {
      background: rgba(167, 121, 78, 0.28);
      border-radius: 0.16em;
      -webkit-box-decoration-break: clone;
      box-decoration-break: clone;
    }
    .inbox-saved-annotation {
      border-radius: 0.12em;
      cursor: pointer;
      -webkit-box-decoration-break: clone;
      box-decoration-break: clone;
    }
    .inbox-saved-highlight {
      background: rgba(216, 235, 213, 0.36);
      text-decoration: underline;
      text-decoration-color: rgba(47, 107, 79, 0.72);
      text-decoration-thickness: 2px;
      text-underline-offset: 0.18em;
    }
    .inbox-saved-note {
      background: rgba(226, 230, 189, 0.28);
      text-decoration: underline dotted;
      text-decoration-color: rgba(94, 96, 67, 0.82);
      text-decoration-thickness: 2px;
      text-underline-offset: 0.2em;
    }
  </style>
</head>
<body>
  ${showChapterHeading ? renderChapterHeading(chapter, chapterIndex, chapterCount) : ''}
  <main id="book-content" class="book-content">
    ${paragraphs}
  </main>
  ${initialReaderPositionScript(preferences, restoreRatio)}
  ${readerScript()}
</body>
</html>`;
}

function initialReaderPositionScript(preferences: ReaderPreferences, restoreRatio: number) {
  return `<script>
    (function() {
      var mode = "${preferences.readingMode}";
      var restoreRatio = ${restoreRatio};
      function pageStep() {
        return Math.max(1, window.innerWidth);
      }
      function pageCount() {
        return Math.max(1, Math.round(Math.max(0, Math.max(document.documentElement.scrollWidth, document.body ? document.body.scrollWidth : 0) - window.innerWidth) / pageStep()) + 1);
      }
      if (mode === "page") {
        var targetPage = Math.round(restoreRatio * Math.max(1, pageCount() - 1));
        window.scrollTo(targetPage * pageStep(), 0);
      }
    })();
  </script>`;
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
    function readerTextRoot() {
      return document.getElementById("book-content") || document.body;
    }
    window.__INBOX_CAPTURE_SELECTION = function() {
      var selection = window.getSelection();
      var selectedText = selection ? selection.toString().trim() : "";
      var range = selection && selection.rangeCount ? selection.getRangeAt(0) : null;
      var rect = range && range.getBoundingClientRect ? range.getBoundingClientRect() : null;
      var textRoot = readerTextRoot();
      window.ReactNativeWebView.postMessage(JSON.stringify({
        type: selectedText ? "selection-menu" : "selection-empty",
        selectedText: selectedText,
        offset: selectedText ? textRoot.innerText.indexOf(selectedText) : -1,
        x: rect ? rect.left + rect.width / 2 : window.innerWidth / 2,
        y: rect ? rect.bottom : 96
      }));
    };
    document.addEventListener("contextmenu", function(event) {
      event.preventDefault();
    });
    window.addEventListener("scroll", function() {
      var max = Math.max(1, document.documentElement.scrollHeight - window.innerHeight);
      window.ReactNativeWebView.postMessage(JSON.stringify({
        type: "progress",
        ratio: Math.min(1, Math.max(0, window.scrollY / max))
      }));
    }, { passive: true });
  </script>`;
}

function preferenceScript(
  preferences: ReaderPreferences,
  restoreRatio: number,
  reduceMotion: boolean,
  readerUiActive: boolean,
  readerPanelActive: boolean,
  readerInsets: ReaderInsets,
  preserveLayout: boolean
) {
  const theme = brand.readerThemes[preferences.readerTheme];
  const fontStack = readerFontCssStack(preferences.fontFamily);
  const initialInsets = {
    top: Math.max(32, Math.round(readerInsets.top)),
    bottom: Math.max(48, Math.round(readerInsets.bottom)),
  };
  return `
    (function() {
      var preserveLayout = ${preserveLayout ? 'true' : 'false'};
      var mode = "${preferences.readingMode}";
      var margin = ${preferences.margin};
      var reduceMotion = ${reduceMotion ? 'true' : 'false'};
      var restoreRatio = ${restoreRatio};
      var initialInsets = ${JSON.stringify(initialInsets)};
      window.__INBOX_READER_INSETS__ = initialInsets;
      window.__INBOX_UI_ACTIVE__ = ${readerUiActive ? 'true' : 'false'};
      window.__INBOX_PANEL_ACTIVE__ = ${readerPanelActive ? 'true' : 'false'};

      function postMessage(payload) {
        window.ReactNativeWebView.postMessage(JSON.stringify(payload));
      }

      function pageStep() {
        return Math.max(1, window.innerWidth);
      }

      function maxHorizontalScroll() {
        return Math.max(0, Math.max(document.documentElement.scrollWidth, document.body ? document.body.scrollWidth : 0) - window.innerWidth);
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

      function normalizedInsets() {
        var next = window.__INBOX_READER_INSETS__ || initialInsets;
        return {
          top: Math.max(32, Math.round(Number(next.top) || initialInsets.top)),
          bottom: Math.max(48, Math.round(Number(next.bottom) || initialInsets.bottom))
        };
      }

      function syncPreservedPageMargins(active) {
        var id = "inbox-preserved-page-margins";
        var existing = document.getElementById(id);
        if (!active) {
          document.documentElement.classList.remove("inbox-reader-page");
          if (existing) existing.remove();
          return;
        }

        document.documentElement.classList.add("inbox-reader-page");
        var style = existing || document.createElement("style");
        style.id = id;
        style.textContent =
          "html.inbox-reader-page body > :not(script):not(style) {" +
          "box-sizing: border-box;" +
          "padding-left: " + margin + "px;" +
          "padding-right: " + margin + "px;" +
          "-webkit-box-decoration-break: clone;" +
          "box-decoration-break: clone;" +
          "}";
        if (!existing && document.head) document.head.appendChild(style);
      }

      function applyMode() {
        var safeInsets = normalizedInsets();
        document.documentElement.style.setProperty("--reader-font-size", "${preferences.fontSize}px");
        document.documentElement.style.setProperty("--reader-line-height", "${preferences.lineHeight}");
        document.documentElement.style.setProperty("--reader-font-family", ${JSON.stringify(fontStack)});
        document.documentElement.style.setProperty("--reader-bg", "${theme.background}");
        document.documentElement.style.setProperty("--reader-text", "${theme.text}");
        document.documentElement.style.background = "${theme.background}";
        disableNativeSelection();
        syncPreservedPageMargins(preserveLayout && mode === "page");
        if (preserveLayout) {
          if (mode === "page") {
            document.documentElement.style.height = "100%";
            document.documentElement.style.overflowX = "hidden";
            document.documentElement.style.overflowY = "hidden";
            document.body.style.boxSizing = "border-box";
            document.body.style.width = "100vw";
            document.body.style.maxWidth = "none";
            document.body.style.minHeight = "100vh";
            document.body.style.height = "100vh";
            document.body.style.marginLeft = "0";
            document.body.style.marginRight = "0";
            document.body.style.paddingLeft = "0";
            document.body.style.paddingRight = "0";
            document.body.style.overflow = "visible";
            document.body.style.columnWidth = window.innerWidth + "px";
            document.body.style.columnGap = "0";
            document.body.style.columnFill = "auto";
            document.body.style.webkitColumnWidth = window.innerWidth + "px";
            document.body.style.webkitColumnGap = "0";
            document.body.style.webkitColumnFill = "auto";
            return;
          }
          document.documentElement.style.height = "auto";
          document.documentElement.style.overflowX = "hidden";
          document.documentElement.style.overflowY = "auto";
          return;
        }
        document.body.style.background = "${theme.background}";
        document.body.style.color = "${theme.text}";
        document.body.style.fontSize = "${preferences.fontSize}px";
        document.body.style.lineHeight = "${preferences.lineHeight}";
        document.body.style.boxSizing = "border-box";
        document.body.style.paddingLeft = margin + "px";
        document.body.style.paddingRight = margin + "px";
        document.body.style.paddingTop = safeInsets.top + "px";
        document.body.style.paddingBottom = safeInsets.bottom + "px";

        if (mode === "page") {
          document.documentElement.style.height = "100%";
          document.documentElement.style.overflowX = "hidden";
          document.documentElement.style.overflowY = "hidden";
          document.body.style.width = "100vw";
          document.body.style.maxWidth = "none";
          document.body.style.minHeight = "100vh";
          document.body.style.height = "100vh";
          document.body.style.marginLeft = "0";
          document.body.style.marginRight = "0";
          document.body.style.paddingLeft = "0";
          document.body.style.paddingRight = "0";
          document.body.style.overflow = "visible";
          document.body.style.columnWidth = window.innerWidth + "px";
          document.body.style.columnGap = "0";
          document.body.style.columnFill = "auto";
          document.body.style.webkitColumnWidth = window.innerWidth + "px";
          document.body.style.webkitColumnGap = "0";
          document.body.style.webkitColumnFill = "auto";
          return;
        }

        document.documentElement.style.height = "auto";
        document.documentElement.style.overflowX = "hidden";
        document.documentElement.style.overflowY = "auto";
        document.body.style.minHeight = "auto";
        document.body.style.height = "auto";
        document.body.style.overflow = "visible";
        document.body.style.columnWidth = "auto";
        document.body.style.columnGap = "normal";
        document.body.style.webkitColumnWidth = "auto";
        document.body.style.webkitColumnGap = "normal";
      }

      window.__INBOX_APPLY_READER_LAYOUT__ = function(nextInsets, uiActive, panelActive) {
        if (nextInsets) {
          window.__INBOX_READER_INSETS__ = {
            top: Math.max(0, Number(nextInsets.top) || 0),
            bottom: Math.max(0, Number(nextInsets.bottom) || 0)
          };
        }
        window.__INBOX_UI_ACTIVE__ = !!uiActive;
        window.__INBOX_PANEL_ACTIVE__ = !!panelActive;
        var ratio = mode === "page"
          ? (pageCount() <= 1 ? 0 : pageIndex() / Math.max(1, pageCount() - 1))
          : window.scrollY / maxVerticalScroll();
        applyMode();
        setTimeout(function() {
          if (mode === "page") {
            window.scrollTo({ left: Math.round(ratio * Math.max(1, pageCount() - 1)) * pageStep(), top: 0, behavior: "auto" });
          } else {
            window.scrollTo({ left: 0, top: ratio * maxVerticalScroll(), behavior: "auto" });
          }
          reportProgress();
        }, 60);
      };

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
      if (typeof window.__INBOX_SELECTION_ACTIVE__ === "undefined") {
        window.__INBOX_SELECTION_ACTIVE__ = false;
      }
      var customSelectionMark = null;

      function disableNativeSelection() {
        document.documentElement.style.webkitUserSelect = "none";
        document.documentElement.style.userSelect = "none";
        document.documentElement.style.webkitTouchCallout = "none";
        document.body.style.webkitUserSelect = "none";
        document.body.style.userSelect = "none";
        document.body.style.webkitTouchCallout = "none";
      }

      function clearNativeSelection() {
        var selection = window.getSelection ? window.getSelection() : null;
        if (selection && selection.removeAllRanges) {
          selection.removeAllRanges();
        }
      }

      function clearCustomSelection(silent) {
        var marks = document.querySelectorAll(".inbox-custom-selection");
        marks.forEach(function(mark) {
          var parent = mark.parentNode;
          if (!parent) {
            return;
          }
          while (mark.firstChild) {
            parent.insertBefore(mark.firstChild, mark);
          }
          parent.removeChild(mark);
          parent.normalize();
        });
        customSelectionMark = null;
        clearNativeSelection();
        if (window.__INBOX_SELECTION_ACTIVE__) {
          window.__INBOX_SELECTION_ACTIVE__ = false;
          if (!silent) {
            postMessage({ type: "selection-clear" });
          }
        }
      }

      function unwrapSavedAnnotations() {
        var marks = document.querySelectorAll(".inbox-saved-annotation");
        marks.forEach(function(mark) {
          var parent = mark.parentNode;
          if (!parent) {
            return;
          }
          while (mark.firstChild) {
            parent.insertBefore(mark.firstChild, mark);
          }
          parent.removeChild(mark);
          parent.normalize();
        });
      }

      function textRangeForOffset(start, end) {
        var walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, null);
        var total = 0;
        var range = document.createRange();
        var current = walker.nextNode();
        var foundStart = false;

        while (current) {
          var nextTotal = total + current.nodeValue.length;
          if (!foundStart && start >= total && start <= nextTotal) {
            range.setStart(current, Math.max(0, start - total));
            foundStart = true;
          }
          if (foundStart && end >= total && end <= nextTotal) {
            range.setEnd(current, Math.max(0, end - total));
            return range;
          }
          total = nextTotal;
          current = walker.nextNode();
        }

        return null;
      }

      function markSavedAnnotation(annotation) {
        var text = String(annotation.quote || annotation.selectedText || "").trim();
        if (!text) {
          return;
        }

        var fullText = document.body.textContent || "";
        var start = Number.isFinite(annotation.offset) ? annotation.offset : -1;
        if (start < 0 || fullText.slice(start, start + text.length) !== text) {
          start = fullText.indexOf(text);
        }
        if (start < 0) {
          return;
        }

        var range = textRangeForOffset(start, start + text.length);
        if (!range) {
          return;
        }

        var mark = document.createElement("span");
        mark.className = "inbox-saved-annotation inbox-saved-" + annotation.type;
        mark.setAttribute("data-annotation-id", annotation.id);
        mark.setAttribute("data-annotation-type", annotation.type);
        try {
          range.surroundContents(mark);
        } catch (error) {
          var fragment = range.extractContents();
          mark.appendChild(fragment);
          range.insertNode(mark);
        }
      }

      window.__INBOX_APPLY_ANNOTATIONS__ = function(annotations) {
        unwrapSavedAnnotations();
        (annotations || []).forEach(markSavedAnnotation);
      };

      function rangeFromPoint(x, y) {
        if (document.caretRangeFromPoint) {
          return document.caretRangeFromPoint(x, y);
        }
        if (document.caretPositionFromPoint) {
          var position = document.caretPositionFromPoint(x, y);
          if (!position) {
            return null;
          }
          var range = document.createRange();
          range.setStart(position.offsetNode, position.offset);
          range.collapse(true);
          return range;
        }
        return null;
      }

      function firstTextNode(node) {
        if (!node) {
          return null;
        }
        if (node.nodeType === Node.TEXT_NODE && node.nodeValue && node.nodeValue.trim()) {
          return node;
        }
        var walker = document.createTreeWalker(node, NodeFilter.SHOW_TEXT, null);
        var textNode = walker.nextNode();
        while (textNode && !textNode.nodeValue.trim()) {
          textNode = walker.nextNode();
        }
        return textNode;
      }

      function documentTextOffset(node, offset) {
        var walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, null);
        var total = 0;
        var current = walker.nextNode();
        while (current) {
          if (current === node) {
            return total + offset;
          }
          total += current.nodeValue.length;
          current = walker.nextNode();
        }
        return Math.max(0, document.body.innerText.indexOf(node.nodeValue.slice(offset, offset + 12)));
      }

      function isCjk(char) {
        return /[\\u3400-\\u9fff]/.test(char);
      }

      function isSentenceBoundary(char) {
        return /[。！？!?；;\\n\\r]/.test(char);
      }

      function isWordBoundary(char) {
        return /[\\s\\n\\r\\t,.;:!?，。！？；：、()\\[\\]{}"'“”‘’]/.test(char);
      }

      function selectionSlice(text, offset) {
        if (!text || !text.trim()) {
          return null;
        }
        var pivot = Math.max(0, Math.min(text.length - 1, offset));
        if (/\\s/.test(text.charAt(pivot))) {
          var nearby = pivot;
          while (nearby < text.length && nearby - pivot < 8 && /\\s/.test(text.charAt(nearby))) {
            nearby += 1;
          }
          if (nearby < text.length && !/\\s/.test(text.charAt(nearby))) {
            pivot = nearby;
          }
        }

        var start = pivot;
        var end = pivot + 1;
        if (isCjk(text.charAt(pivot))) {
          while (start > 0 && !isSentenceBoundary(text.charAt(start - 1)) && pivot - start < 18) {
            start -= 1;
          }
          while (end < text.length && !isSentenceBoundary(text.charAt(end)) && end - pivot < 24) {
            end += 1;
          }
          if (end < text.length && isSentenceBoundary(text.charAt(end))) {
            end += 1;
          }
        } else {
          while (start > 0 && !isWordBoundary(text.charAt(start - 1))) {
            start -= 1;
          }
          while (end < text.length && !isWordBoundary(text.charAt(end))) {
            end += 1;
          }
        }

        while (start < end && /\\s/.test(text.charAt(start))) {
          start += 1;
        }
        while (end > start && /\\s/.test(text.charAt(end - 1))) {
          end -= 1;
        }

        if (end <= start) {
          return null;
        }
        return { start: start, end: end, text: text.slice(start, end) };
      }

      function createCustomSelection(point) {
        clearCustomSelection(true);
        var range = rangeFromPoint(point.clientX, point.clientY);
        if (!range) {
          postMessage({ type: "selection-empty" });
          return false;
        }

        var textNode = range.startContainer.nodeType === Node.TEXT_NODE ? range.startContainer : firstTextNode(range.startContainer);
        if (!textNode || !textNode.nodeValue) {
          postMessage({ type: "selection-empty" });
          return false;
        }

        var slice = selectionSlice(textNode.nodeValue, range.startOffset);
        if (!slice || !slice.text.trim()) {
          postMessage({ type: "selection-empty" });
          return false;
        }

        var markRange = document.createRange();
        markRange.setStart(textNode, slice.start);
        markRange.setEnd(textNode, slice.end);
        var offset = documentTextOffset(textNode, slice.start);
        var mark = document.createElement("span");
        mark.className = "inbox-custom-selection";
        mark.setAttribute("data-inbox-selection", "true");
        try {
          markRange.surroundContents(mark);
        } catch (error) {
          postMessage({ type: "selection-empty" });
          return false;
        }

        customSelectionMark = mark;
        window.__INBOX_SELECTION_ACTIVE__ = true;
        var rect = mark.getBoundingClientRect();
        postMessage({
          type: "selection-menu",
          selectedText: slice.text.trim(),
          offset: offset,
          x: rect ? rect.left + rect.width / 2 : point.clientX,
          y: rect ? rect.bottom : point.clientY
        });
        return true;
      }

      function reportSelectionMenu() {
        if (!customSelectionMark) {
          postMessage({ type: "selection-empty" });
          return;
        }
        var rect = customSelectionMark.getBoundingClientRect();
        postMessage({
          type: "selection-menu",
          selectedText: customSelectionMark.innerText.trim(),
          offset: document.body.innerText.indexOf(customSelectionMark.innerText.trim()),
          x: rect ? rect.left + rect.width / 2 : window.innerWidth / 2,
          y: rect ? rect.bottom : 96
        });
      }

      window.__INBOX_CLEAR_SELECTION = function() {
        clearCustomSelection(true);
      };

      window.__INBOX_CAPTURE_SELECTION = function() {
        reportSelectionMenu();
      };

      if (!window.__INBOX_SCRIPT_READY__) {
        window.__INBOX_SCRIPT_READY__ = true;
        var progressTimer = null;
        var longPressTimer = null;
        var longPressPoint = null;
        var longPressActivated = false;
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
          var annotationMark = target && target.closest && target.closest(".inbox-saved-annotation");
          if (annotationMark) {
            postMessage({
              type: "annotation-open",
              annotationId: annotationMark.getAttribute("data-annotation-id")
            });
            return;
          }
          if (window.__INBOX_SELECTION_ACTIVE__) {
            clearCustomSelection(false);
            return;
          }
          postMessage({ type: "selection-clear" });
          if (window.__INBOX_PANEL_ACTIVE__) {
            postMessage({ type: "dismissPanel" });
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

        function cancelLongPress() {
          if (longPressTimer) {
            clearTimeout(longPressTimer);
          }
          longPressTimer = null;
          longPressPoint = null;
        }

        document.addEventListener("touchstart", function(event) {
          var touch = event.touches && event.touches[0];
          if (!touch || (event.target && event.target.closest && event.target.closest("a"))) {
            return;
          }
          cancelLongPress();
          longPressActivated = false;
          longPressPoint = {
            clientX: touch.clientX,
            clientY: touch.clientY,
            screenX: touch.screenX
          };
          longPressTimer = setTimeout(function() {
            if (!longPressPoint) {
              return;
            }
            longPressActivated = createCustomSelection(longPressPoint);
            if (longPressActivated) {
              lastTouchAt = Date.now();
            }
          }, 420);
        }, { passive: true, capture: true });

        document.addEventListener("touchmove", function(event) {
          var touch = event.touches && event.touches[0];
          if (!touch || !longPressPoint) {
            return;
          }
          if (Math.abs(touch.clientX - longPressPoint.clientX) > 16 || Math.abs(touch.clientY - longPressPoint.clientY) > 16) {
            cancelLongPress();
          }
        }, { passive: true, capture: true });

        document.addEventListener("touchend", function(event) {
          var touch = event.changedTouches && event.changedTouches[0];
          if (!touch) {
            return;
          }
          cancelLongPress();
          if (longPressActivated) {
            event.preventDefault();
            event.stopPropagation();
            longPressActivated = false;
            return;
          }
          lastTouchAt = Date.now();
          handleReaderTap(event, touch);
        }, { passive: false, capture: true });

        document.addEventListener("click", function(event) {
          if (Date.now() - lastTouchAt < 450) {
            return;
          }
          handleReaderTap(event, event);
        });
        document.addEventListener("contextmenu", function(event) {
          event.preventDefault();
          clearNativeSelection();
          createCustomSelection(event);
        });
        window.addEventListener("scroll", function() {
          if (window.__INBOX_SELECTION_ACTIVE__) {
            clearCustomSelection(false);
          }
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
        window.addEventListener("load", function() {
          applyMode();
          setTimeout(function() {
            restorePosition();
            reportProgress();
          }, 80);
        }, { once: true });
      }

      function restorePosition() {
        if (mode === "page") {
          var targetPage = Math.round(restoreRatio * Math.max(1, pageCount() - 1));
          window.scrollTo({ left: targetPage * pageStep(), top: 0, behavior: "auto" });
        } else {
          window.scrollTo({ left: 0, top: restoreRatio * maxVerticalScroll(), behavior: "auto" });
        }
      }

      applyMode();
      restorePosition();
      setTimeout(function() {
        restorePosition();
        reportProgress();
      }, 80);
    })();
    true;
  `;
}

function initialReaderLayoutScript(preferences: ReaderPreferences, restoreRatio: number, readerInsets: ReaderInsets, preserveLayout: boolean) {
  const theme = brand.readerThemes[preferences.readerTheme];
  const fontStack = readerFontCssStack(preferences.fontFamily);
  const initialInsets = {
    top: Math.max(32, Math.round(readerInsets.top)),
    bottom: Math.max(48, Math.round(readerInsets.bottom)),
  };
  return `
    (function() {
      var preserveLayout = ${preserveLayout ? 'true' : 'false'};
      var mode = "${preferences.readingMode}";
      var margin = ${preferences.margin};
      var restoreRatio = ${restoreRatio};
      var initialInsets = ${JSON.stringify(initialInsets)};
      function pageStep() {
        return Math.max(1, window.innerWidth);
      }
      function pageCount() {
        return Math.max(1, Math.round(Math.max(0, document.documentElement.scrollWidth - window.innerWidth) / pageStep()) + 1);
      }
      function syncPreservedPageMargins(active) {
        var id = "inbox-preserved-page-margins";
        var existing = document.getElementById(id);
        if (!active) {
          document.documentElement.classList.remove("inbox-reader-page");
          if (existing) existing.remove();
          return;
        }

        document.documentElement.classList.add("inbox-reader-page");
        var style = existing || document.createElement("style");
        style.id = id;
        style.textContent =
          "html.inbox-reader-page body > :not(script):not(style) {" +
          "box-sizing: border-box;" +
          "padding-left: " + margin + "px;" +
          "padding-right: " + margin + "px;" +
          "-webkit-box-decoration-break: clone;" +
          "box-decoration-break: clone;" +
          "}";
        if (!existing && document.head) document.head.appendChild(style);
      }
      function applyInitialLayout() {
        document.documentElement.style.background = "${theme.background}";
        document.documentElement.style.setProperty("--reader-font-size", "${preferences.fontSize}px");
        document.documentElement.style.setProperty("--reader-line-height", "${preferences.lineHeight}");
        document.documentElement.style.setProperty("--reader-font-family", ${JSON.stringify(fontStack)});
        document.documentElement.style.setProperty("--reader-bg", "${theme.background}");
        document.documentElement.style.setProperty("--reader-text", "${theme.text}");
        if (!document.body) {
          return;
        }
        syncPreservedPageMargins(preserveLayout && mode === "page");
        if (preserveLayout) {
          if (mode === "page") {
            document.documentElement.style.height = "100%";
            document.documentElement.style.overflowX = "hidden";
            document.documentElement.style.overflowY = "hidden";
            document.body.style.boxSizing = "border-box";
            document.body.style.width = "100vw";
            document.body.style.maxWidth = "none";
            document.body.style.minHeight = "100vh";
            document.body.style.height = "100vh";
            document.body.style.marginLeft = "0";
            document.body.style.marginRight = "0";
            document.body.style.paddingLeft = "0";
            document.body.style.paddingRight = "0";
            document.body.style.overflow = "visible";
            document.body.style.columnWidth = window.innerWidth + "px";
            document.body.style.columnGap = "0";
            document.body.style.columnFill = "auto";
            document.body.style.webkitColumnWidth = window.innerWidth + "px";
            document.body.style.webkitColumnGap = "0";
            document.body.style.webkitColumnFill = "auto";
            window.scrollTo(Math.round(restoreRatio * Math.max(1, pageCount() - 1)) * pageStep(), 0);
            return;
          }
          window.scrollTo(0, restoreRatio * Math.max(1, document.documentElement.scrollHeight - window.innerHeight));
          return;
        }
        document.body.style.background = "${theme.background}";
        document.body.style.color = "${theme.text}";
        document.body.style.fontSize = "${preferences.fontSize}px";
        document.body.style.lineHeight = "${preferences.lineHeight}";
        document.body.style.boxSizing = "border-box";
        document.body.style.paddingLeft = margin + "px";
        document.body.style.paddingRight = margin + "px";
        document.body.style.paddingTop = initialInsets.top + "px";
        document.body.style.paddingBottom = initialInsets.bottom + "px";
        if (mode === "page") {
          document.documentElement.style.height = "100%";
          document.documentElement.style.overflowX = "hidden";
          document.documentElement.style.overflowY = "hidden";
          document.body.style.width = "100vw";
          document.body.style.maxWidth = "none";
          document.body.style.minHeight = "100vh";
          document.body.style.height = "100vh";
          document.body.style.marginLeft = "0";
          document.body.style.marginRight = "0";
          document.body.style.paddingLeft = "0";
          document.body.style.paddingRight = "0";
          document.body.style.overflow = "visible";
          document.body.style.columnWidth = window.innerWidth + "px";
          document.body.style.columnGap = "0";
          document.body.style.columnFill = "auto";
          document.body.style.webkitColumnWidth = window.innerWidth + "px";
          document.body.style.webkitColumnGap = "0";
          document.body.style.webkitColumnFill = "auto";
          window.scrollTo(Math.round(restoreRatio * Math.max(1, pageCount() - 1)) * pageStep(), 0);
          return;
        }
        window.scrollTo(0, restoreRatio * Math.max(1, document.documentElement.scrollHeight - window.innerHeight));
      }
      if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", applyInitialLayout, { once: true });
      } else {
        applyInitialLayout();
      }
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

export default function ReaderScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const db = useSQLiteContext();
  const insets = useSafeAreaInsets();
  const { width: windowWidth, height: windowHeight } = useWindowDimensions();
  const webViewRef = useRef<WebView>(null);
  const lastProgressSave = useRef(0);
  const latestProgressRatio = useRef(0);
  const [book, setBook] = useState<Book | null>(null);
  const [chapters, setChapters] = useState<Chapter[]>([]);
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
  const [loading, setLoading] = useState(true);
  const [reduceMotion, setReduceMotion] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [pageStatus, setPageStatus] = useState({ pageIndex: 1, pageCount: 1 });

  const currentChapter = chapters[currentIndex];
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
  const readerAnnotationMarks = useMemo<ReaderAnnotationMark[]>(() => {
    if (!currentChapter) {
      return [];
    }

    return annotations.flatMap((annotation) => {
      if (annotation.chapterId !== currentChapter.id || !annotation.selectedText || (annotation.type !== 'highlight' && annotation.type !== 'note')) {
        return [];
      }
      const position = parseAnnotationPosition(annotation.position);
      return [
        {
          id: annotation.id,
          type: annotation.type,
          selectedText: annotation.selectedText,
          quote: position.quote ?? annotation.selectedText,
          offset: typeof position.offset === 'number' ? position.offset : undefined,
        },
      ];
    });
  }, [annotations, currentChapter]);
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
  const readerInsets = useMemo(
    () => ({
      top: Math.max(42, Math.ceil(insets.top + 12)),
      bottom: Math.max(56, Math.ceil(insets.bottom + 28)),
    }),
    [insets.bottom, insets.top]
  );
  const panelHeight = panel
    ? Math.min(windowHeight * (panel === 'search' ? 0.62 : 0.74), windowHeight - chromeTopOffset - 32)
    : undefined;
  const selectionMenuStyle = useMemo(() => {
    if (!textSelection) {
      return null;
    }

    const menuWidth = 248;
    return {
      left: Math.min(windowWidth - menuWidth - 12, Math.max(12, textSelection.x - menuWidth / 2)),
      top: Math.min(windowHeight - chromeBottomOffset - 72, Math.max(insets.top + 88, textSelection.y + 20)),
      width: menuWidth,
    };
  }, [chromeBottomOffset, insets.top, textSelection, windowHeight, windowWidth]);

  const closePanel = useCallback(() => {
    Keyboard.dismiss();
    setPanel(null);
    setTextSelection(null);
    setNoteSelection(null);
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
    latestProgressRatio.current = progress?.scroll_ratio ?? 0;
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

  const flushProgress = useCallback(() => {
    if (!book || !currentChapter) {
      return;
    }

    void saveProgress(db, book.id, currentChapter.id, latestProgressRatio.current);
  }, [book, currentChapter, db]);

  const handleReaderBack = useCallback(() => {
    flushProgress();
    router.back();
  }, [flushProgress]);

  useEffect(() => {
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      if (panel) {
        closePanel();
        return true;
      }

      flushProgress();
      return false;
    });

    return () => subscription.remove();
  }, [closePanel, flushProgress, panel]);

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

  const commitProgress = useCallback(
    async (ratio: number, force = false) => {
      if (!book || !currentChapter) {
        return;
      }

      const now = Date.now();
      if (!force && now - lastProgressSave.current < 1200) {
        return;
      }

      const nextRatio = Math.max(0, Math.min(1, ratio));
      latestProgressRatio.current = nextRatio;
      lastProgressSave.current = now;
      await saveProgress(db, book.id, currentChapter.id, nextRatio);
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
      setTextSelection(null);
      setNoteSelection(null);
      latestProgressRatio.current = ratio;
      void saveProgress(db, book.id, chapters[index].id, ratio);
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

  const clearWebSelection = useCallback(() => {
    webViewRef.current?.injectJavaScript(`
      window.__INBOX_CLEAR_SELECTION && window.__INBOX_CLEAR_SELECTION();
      window.getSelection && window.getSelection().removeAllRanges();
      true;
    `);
  }, []);

  const copySelectedText = useCallback(async () => {
    if (!textSelection) {
      return;
    }

    const copied = await Clipboard.setStringAsync(textSelection.selectedText);
    setTextSelection(null);
    clearWebSelection();
    showNotice(copied ? '已复制' : '复制失败，请重试');
  }, [clearWebSelection, showNotice, textSelection]);

  const saveSelectedHighlight = useCallback(async () => {
    if (!book || !currentChapter || !textSelection) {
      return;
    }

    const selection = textSelection;
    setTextSelection(null);
    clearWebSelection();
    await createAnnotation(db, {
      bookId: book.id,
      chapterId: currentChapter.id,
      type: 'highlight',
      selectedText: selection.selectedText,
      color: '#f6d46a',
      position: JSON.stringify({ offset: selection.offset, quote: selection.selectedText.slice(0, 140) }),
    });
    setAnnotations(await listAnnotations(db, book.id));
    showNotice('已保存划线');
  }, [book, clearWebSelection, currentChapter, db, showNotice, textSelection]);

  const startSelectionNote = useCallback(() => {
    if (!textSelection) {
      return;
    }

    setNoteSelection(textSelection);
    setNoteDraft('');
    setTextSelection(null);
    clearWebSelection();
    setPanel('notes');
    setChromeVisible(true);
  }, [clearWebSelection, textSelection]);

  const handleWebMessage = useCallback(
    async (event: WebViewMessageEvent) => {
      let payload: {
        type?: string;
        annotationId?: string;
        ratio?: number;
        selectedText?: string;
        offset?: number;
        x?: number;
        y?: number;
        pageIndex?: number;
        pageCount?: number;
        direction?: 'prev' | 'next';
      };
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
        setTextSelection(null);
        setNoteSelection(null);
        setChromeVisible(false);
      }

      if (payload.type === 'dismissPanel') {
        Keyboard.dismiss();
        setPanel(null);
        setTextSelection(null);
        setNoteSelection(null);
        setChromeVisible(true);
      }

      if (payload.type === 'progress' && typeof payload.ratio === 'number') {
        latestProgressRatio.current = Math.max(0, Math.min(1, payload.ratio));
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
        if (currentIndex > 0) {
          goToChapter(currentIndex - 1, 1);
          return;
        }
        showNotice('已经是第一章');
      }

      if (payload.type === 'pageBoundary' && payload.direction === 'next') {
        if (currentIndex < chapters.length - 1) {
          goToChapter(currentIndex + 1, 0);
          return;
        }
        showNotice('已经读到最后一章');
      }

      if (payload.type === 'selection-empty') {
        showNotice('先选择正文中的文字，再点划线');
      }

      if (payload.type === 'selection-clear') {
        setTextSelection(null);
      }

      if (payload.type === 'annotation-open' && payload.annotationId) {
        const annotation = annotations.find((item) => item.id === payload.annotationId);
        setTextSelection(null);
        setNoteSelection(null);
        setAnnotationFilter(annotation?.type === 'note' ? 'note' : annotation?.type === 'highlight' ? 'highlight' : 'all');
        setPanel('notes');
        setChromeVisible(true);
      }

      if ((payload.type === 'selection-menu' || payload.type === 'selection') && payload.selectedText) {
        Keyboard.dismiss();
        setPanel(null);
        setChromeVisible(false);
        setTextSelection({
          selectedText: payload.selectedText,
          offset: payload.offset ?? -1,
          x: payload.x ?? windowWidth / 2,
          y: payload.y ?? 96,
        });
      }
    },
    [annotations, chapters.length, commitProgress, currentIndex, goToChapter, preferences.readingMode, showNotice, windowWidth]
  );

  const applyReaderAnnotations = useCallback(() => {
    webViewRef.current?.injectJavaScript(`
      window.__INBOX_APPLY_ANNOTATIONS__ && window.__INBOX_APPLY_ANNOTATIONS__(${JSON.stringify(readerAnnotationMarks)});
      true;
    `);
  }, [readerAnnotationMarks]);

  const readerUiActive = chromeVisible || panel !== null;
  const readerPanelActive = panel !== null;
  const preserveEpubLayout = Boolean(book?.format === 'epub' && currentChapter?.htmlPath);
  const injectedJavaScript = useMemo(
    () => preferenceScript(preferences, restoreRatio, reduceMotion, readerUiActive, readerPanelActive, readerInsets, preserveEpubLayout),
    [preferences, preserveEpubLayout, readerInsets, readerPanelActive, readerUiActive, reduceMotion, restoreRatio]
  );
  const injectedJavaScriptBeforeContentLoaded = useMemo(
    () => initialReaderLayoutScript(preferences, restoreRatio, readerInsets, preserveEpubLayout),
    [preferences, preserveEpubLayout, readerInsets, restoreRatio]
  );
  const readerSource = useMemo(() => {
    if (!book || !currentChapter) {
      return undefined;
    }

    return preserveEpubLayout && currentChapter.htmlPath
      ? { uri: currentChapter.htmlPath }
      : { html: readerHtmlForText(currentChapter, preferences, readerInsets, restoreRatio, currentIndex, chapters.length) };
  }, [book, chapters.length, currentChapter, currentIndex, preferences, preserveEpubLayout, readerInsets, restoreRatio]);

  useEffect(() => {
    const nextInsets = JSON.stringify(readerInsets);
    webViewRef.current?.injectJavaScript(`
      if (window.__INBOX_APPLY_READER_LAYOUT__) {
        window.__INBOX_APPLY_READER_LAYOUT__(${nextInsets}, ${readerUiActive ? 'true' : 'false'}, ${readerPanelActive ? 'true' : 'false'});
      } else {
        window.__INBOX_READER_INSETS__ = ${nextInsets};
        window.__INBOX_UI_ACTIVE__ = ${readerUiActive ? 'true' : 'false'};
        window.__INBOX_PANEL_ACTIVE__ = ${readerPanelActive ? 'true' : 'false'};
      }
      true;
    `);
  }, [readerInsets, readerPanelActive, readerUiActive]);

  useEffect(() => {
    applyReaderAnnotations();
  }, [applyReaderAnnotations]);

  const saveNote = useCallback(async () => {
    if (!book || !currentChapter || !noteDraft.trim()) {
      return;
    }

    await createAnnotation(db, {
      bookId: book.id,
      chapterId: currentChapter.id,
      type: 'note',
      selectedText: noteSelection?.selectedText,
      noteText: noteDraft.trim(),
      position: JSON.stringify(
        noteSelection
          ? { offset: noteSelection.offset, quote: noteSelection.selectedText.slice(0, 140) }
          : { chapterId: currentChapter.id }
      ),
    });
    setNoteDraft('');
    setNoteSelection(null);
    setAnnotations(await listAnnotations(db, book.id));
    showNotice('笔记已保存');
    setPanel('notes');
  }, [book, currentChapter, db, noteDraft, noteSelection, showNotice]);

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

  return (
    <View style={[styles.screen, { backgroundColor: readerTheme.background }]}>
      <Link.AppleZoomTarget>
        <View style={styles.readerCanvas}>
          <WebView
            key={`${preferences.readerTheme}-${preferences.fontFamily}-${preferences.fontSize}-${preferences.lineHeight}-${preferences.margin}-${preferences.readingMode}`}
            ref={webViewRef}
            originWhitelist={['*']}
            source={readerSource}
            onMessage={handleWebMessage}
            onLoadEnd={applyReaderAnnotations}
            injectedJavaScriptBeforeContentLoaded={injectedJavaScriptBeforeContentLoaded}
            injectedJavaScript={injectedJavaScript}
            javaScriptEnabled
            showsVerticalScrollIndicator={false}
            containerStyle={{ backgroundColor: readerTheme.background }}
            style={[styles.webView, { backgroundColor: readerTheme.background }]}
          />
        </View>
      </Link.AppleZoomTarget>

      {textSelection && selectionMenuStyle && (
        <Animated.View
          entering={reduceMotion ? FadeIn.duration(80) : FadeIn.duration(120)}
          exiting={reduceMotion ? FadeOut.duration(80) : FadeOut.duration(90)}
          style={[styles.selectionToolbar, selectionMenuStyle, { backgroundColor: chromeTheme.panelSurface, borderColor: chromeTheme.border }]}>
          <M3Pressable captureTouches onPress={copySelectedText} feedback="subtle" accessibilityLabel="复制选中内容" style={styles.selectionToolButton}>
            <MaterialSymbol name="copy" color={chromeTheme.accent} description="复制" decorative size={17} />
            <Text style={[styles.selectionToolText, { color: chromeTheme.text }]}>复制</Text>
          </M3Pressable>
          <View style={[styles.selectionToolDivider, { backgroundColor: chromeTheme.controlBorder }]} />
          <M3Pressable captureTouches onPress={saveSelectedHighlight} feedback="subtle" accessibilityLabel="保存划线" style={styles.selectionToolButton}>
            <MaterialSymbol name="highlighter" color={chromeTheme.accent} description="划线" decorative size={17} />
            <Text style={[styles.selectionToolText, { color: chromeTheme.text }]}>划线</Text>
          </M3Pressable>
          <View style={[styles.selectionToolDivider, { backgroundColor: chromeTheme.controlBorder }]} />
          <M3Pressable captureTouches onPress={startSelectionNote} feedback="subtle" accessibilityLabel="添加笔记" style={styles.selectionToolButton}>
            <MaterialSymbol name="note" color={chromeTheme.accent} description="笔记" decorative size={17} />
            <Text style={[styles.selectionToolText, { color: chromeTheme.text }]}>笔记</Text>
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

      {bottomDockVisible && (
        <Animated.View
          entering={reduceMotion ? FadeIn.duration(80) : m3Motion.slideChromeDown()}
          exiting={reduceMotion ? FadeOut.duration(80) : m3Motion.slideOutDown()}
          style={[styles.bottomChrome, { bottom: chromeBottomOffset }]}>
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
                {noteSelection && (
                  <View style={[styles.selectionQuoteCard, { backgroundColor: chromeTheme.subtleSurface, borderColor: chromeTheme.controlBorder }]}>
                    <Text style={[styles.selectionQuoteLabel, { color: chromeTheme.accent }]}>选中原文</Text>
                    <Text numberOfLines={3} style={[styles.selectionQuoteText, { color: chromeTheme.text }]}>
                      {noteSelection.selectedText}
                    </Text>
                  </View>
                )}
                <TextInput
                  value={noteDraft}
                  onChangeText={setNoteDraft}
                  placeholder={noteSelection ? '写下这段文字的想法' : '为本章写一条笔记'}
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
  webView: {
    flex: 1,
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
    borderRadius: brand.radius.large,
    borderCurve: 'continuous',
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 10,
    gap: 5,
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
