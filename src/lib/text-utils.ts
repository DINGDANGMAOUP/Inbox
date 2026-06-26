export function makeId(prefix = 'id') {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}

export function safeFileName(input: string) {
  const cleaned = input
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 96);

  return cleaned || `book-${Date.now()}`;
}

export function hashBytes(bytes: Uint8Array, seed = 5381) {
  let hash = seed;
  const step = Math.max(1, Math.floor(bytes.length / 250000));

  for (let index = 0; index < bytes.length; index += step) {
    hash = (hash * 33) ^ bytes[index];
  }

  return (hash >>> 0).toString(36);
}

export function stripHtml(html: string) {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

export function wordCount(text: string) {
  const compact = text.trim();
  if (!compact) {
    return 0;
  }

  const latinWords = compact.match(/[A-Za-z0-9]+(?:[-'][A-Za-z0-9]+)*/g)?.length ?? 0;
  const cjkChars = compact.match(/[\u3400-\u9fff]/g)?.length ?? 0;
  return latinWords + cjkChars;
}

export function excerptAround(text: string, offset: number, queryLength: number) {
  const start = Math.max(0, offset - 54);
  const end = Math.min(text.length, offset + queryLength + 86);
  const prefix = start > 0 ? '...' : '';
  const suffix = end < text.length ? '...' : '';
  return `${prefix}${text.slice(start, end).replace(/\s+/g, ' ').trim()}${suffix}`;
}

const chineseNumber = '[零〇一二三四五六七八九十百千万两壹贰叁肆伍陆柒捌玖拾佰仟0-9０-９]+';

function stripHeadingPrefix(line: string) {
  return line
    .replace(/^\uFEFF/, '')
    .replace(/^#{1,6}\s*/, '')
    .replace(/^[-*_]{3,}\s*$/, '')
    .trim();
}

export function cleanChapterTitle(title?: string | null, fallback = '正文') {
  const cleaned = stripHeadingPrefix(title ?? '')
    .normalize('NFKC')
    .replace(/^<\s*(?:篇名|卷名|章名|书名|标题|title)\s*>\s*/i, '')
    .replace(/^【\s*(?:篇名|卷名|章名|书名|标题)\s*】\s*/i, '')
    .replace(/<\/?\s*(?:篇名|卷名|章名|书名|标题|title)\s*>/gi, '')
    .replace(/^\s*(?:目录|Table of Contents)\s*$/i, '目录')
    .replace(/\s+/g, ' ')
    .trim();

  return (cleaned || fallback).slice(0, 90);
}

function normalizePotentialHeading(line: string) {
  const cleaned = cleanChapterTitle(line, '');
  return cleaned.replace(/\s+/g, ' ').trim();
}

function isTxtHeading(line: string) {
  if (/^#{1,6}\s+\S.+$/.test(line.trim())) {
    return true;
  }

  const title = normalizePotentialHeading(line);
  if (!title || title.length > 90) {
    return false;
  }

  return [
    /^第[ 　]*[零〇一二三四五六七八九十百千万两壹贰叁肆伍陆柒捌玖拾佰仟0-9０-９]+[ 　]*(?:章|节|回|卷|部|篇|集|折|出).*$/i,
    new RegExp(`^(?:卷|篇|章|部)[ 　]*${chineseNumber}.*$`, 'i'),
    /^(?:上卷|中卷|下卷|序|序言|前言|引言|引子|楔子|正文|后记|跋|附录)(?:[ 　].*)?$/i,
    /^(?:Chapter|Part|Section)\s+[0-9IVXLCDM]+(?:\b|[.:：、]).*$/i,
    /^[0-9０-９]{1,3}[.、．]\s*\S.{0,70}$/,
    /^<\s*(?:篇名|卷名|章名|书名|标题|title)\s*>\s*\S.+$/i,
  ].some((pattern) => pattern.test(stripHeadingPrefix(line).normalize('NFKC')));
}

function lineOffsets(text: string) {
  const lines = text.split('\n');
  let offset = 0;
  return lines.map((line) => {
    const current = { line, offset };
    offset += line.length + 1;
    return current;
  });
}

export function splitTxtIntoChapters(text: string) {
  const normalized = text.replace(/\r\n/g, '\n').trim();
  const headings = lineOffsets(normalized).filter(({ line }) => isTxtHeading(line));

  if (headings.length >= 1) {
    const firstContent = normalized.slice(0, headings[0].offset).trim();
    const sections = headings.map((heading, index) => {
      const start = heading.offset;
      const end = headings[index + 1]?.offset ?? normalized.length;
      const chunk = normalized.slice(start, end).trim();
      return {
        title: cleanChapterTitle(heading.line, `第 ${index + 1} 章`),
        text: chunk,
      };
    });

    if (firstContent.length > 160) {
      sections.unshift({ title: '卷首', text: firstContent });
    }

    return sections.filter((chapter) => chapter.text.trim());
  }

  const chapters: { title: string; text: string }[] = [];
  const targetLength = 7000;
  let cursor = 0;
  let chapterIndex = 1;

  while (cursor < normalized.length) {
    const targetEnd = Math.min(normalized.length, cursor + targetLength);
    const paragraphBreak = normalized.lastIndexOf('\n\n', targetEnd);
    const end = paragraphBreak > cursor + targetLength * 0.45 ? paragraphBreak : targetEnd;
    const chunk = normalized.slice(cursor, end).trim();

    if (chunk) {
      chapters.push({ title: `第 ${chapterIndex} 部分`, text: chunk });
      chapterIndex += 1;
    }

    cursor = end + 1;
  }

  return chapters.length ? chapters : [{ title: '正文', text: normalized }];
}
