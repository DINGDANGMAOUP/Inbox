import type { Annotation, Chapter } from '@/types/reader';

const quoteContextLength = 32;

type AnnotationPosition = {
  chapterId?: string;
  offset?: number;
  quote?: string;
  locator?: string;
};

type ReadiumLocator = {
  href?: string;
  type?: string;
  locations?: { progression?: number; cssSelector?: string };
  text?: { before?: string; highlight?: string; after?: string };
};

export function parseAnnotationPosition(position: string): AnnotationPosition {
  try {
    return JSON.parse(position) as AnnotationPosition;
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

export function noteAnchorKey(annotation: Annotation) {
  const position = parseAnnotationPosition(annotation.position);
  return `note-anchor-${annotation.chapterId}-${hashAnnotationAnchor(`${position.locator ?? position.offset ?? ''}|${annotation.selectedText ?? ''}`)}`;
}

export function ratioFromOffset(chapter: Chapter | undefined, offset?: number) {
  if (!chapter || typeof offset !== 'number' || offset < 0) {
    return 0;
  }

  const contentLength = Math.max(1, chapter.textLength ?? chapter.textContent.length);
  return Math.max(0, Math.min(0.96, offset / contentLength));
}

export function clampRatio(value: number) {
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

export function readiumHrefMatchesChapter(chapter: Chapter, href: string) {
  const normalized = normalizeReadiumHref(href);
  return readiumHrefCandidatesFromChapter(chapter).includes(normalized);
}

export function readiumLocatorForChapter(chapter: Chapter, progression = 0, href = readiumHrefFromChapter(chapter)) {
  return JSON.stringify({
    href: normalizeReadiumHref(href),
    type: 'application/xhtml+xml',
    locations: { progression: clampRatio(progression) },
  });
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

export function readiumLocatorForOffset(chapter: Chapter, offset: number, highlight?: string) {
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
          before: paragraph.localText.slice(Math.max(0, quoteStart - quoteContextLength), quoteStart),
          highlight: trimmedHighlight,
          after: paragraph.localText.slice(quoteEnd, quoteEnd + quoteContextLength),
        }
      : undefined,
  });
}

export function readiumHrefFromLocator(locator: string) {
  try {
    return normalizeReadiumHref((JSON.parse(locator) as { href?: string }).href);
  } catch {
    return '';
  }
}

export function parseReadiumLocator(locator?: string | null): ReadiumLocator | null {
  if (!locator) {
    return null;
  }

  try {
    return JSON.parse(locator) as ReadiumLocator;
  } catch {
    return null;
  }
}

export function chapterFromReadiumLocator(chapters: Chapter[], locator?: string) {
  const href = locator ? readiumHrefFromLocator(locator) : '';
  const index = chapters.findIndex((chapter) => readiumHrefMatchesChapter(chapter, href));
  return index >= 0 ? { chapter: chapters[index], index } : null;
}

function findAnnotationOffset(
  chapterText: string,
  highlight: string,
  position: AnnotationPosition,
  locator?: ReadiumLocator | null,
) {
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

export function readiumLocatorForAnnotation(annotation: Annotation, chapter?: Chapter) {
  const position = parseAnnotationPosition(annotation.position);
  if (parseReadiumLocator(position.locator)) {
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
      before: paragraph.localText.slice(Math.max(0, quoteStart - quoteContextLength), quoteStart),
      highlight,
      after: paragraph.localText.slice(quoteEnd, quoteEnd + quoteContextLength),
    },
  });
}
