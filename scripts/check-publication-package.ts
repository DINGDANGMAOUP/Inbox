import { unzipSync } from 'fflate';

import { parseEpub, type ParsedBook } from '../src/lib/epub-parser';
import { buildInternalEpub } from '../src/lib/publication-package';
import { MAX_READER_CHAPTER_CHARS, splitLongReaderText } from '../src/lib/text-utils';

function assert(condition: unknown, message: string) {
  if (!condition) {
    throw new Error(message);
  }
}

const parsed: ParsedBook = {
  title: '测试文本',
  author: '本地文件',
  format: 'txt',
  chapters: [
    {
      id: 'chapter-a',
      href: 'txt:0',
      title: '第一章',
      order: 0,
      text: '第一段。\n\n第二段，保留换行。',
      wordCount: 12,
    },
    {
      id: 'chapter-b',
      href: 'txt:1',
      title: '第二章',
      order: 1,
      text: `后续内容${String.fromCharCode(0x81)}必须能继续被 Readium 打开。`,
      wordCount: 15,
    },
  ],
};

const epub = buildInternalEpub(parsed, 'book_test', '2026-01-01T00:00:00.000Z');
const entries = unzipSync(epub);
const reparsed = parseEpub(epub, 'publication.epub');
const secondChapterXml = new TextDecoder().decode(entries['OPS/Text/chapter-0002.xhtml']);

assert(new TextDecoder().decode(entries.mimetype) === 'application/epub+zip', 'mimetype entry missing');
assert(!/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f-\u009f]/.test(secondChapterXml), 'chapter XHTML contains invalid XML control characters');
assert(reparsed.format === 'epub', 'internal package should parse as epub');
assert(reparsed.chapters.length === parsed.chapters.length, 'chapter count should be preserved');
assert(reparsed.chapters[0]?.text.includes('第一段'), 'first chapter text missing');
assert(reparsed.chapters[0]?.text.includes('第二段，保留换行'), 'first chapter continuation missing');
assert(reparsed.chapters[1]?.text.includes('后续内容必须能继续被 Readium 打开'), 'second chapter text missing');

const longText = '长章节正文。'.repeat(7000);
const splitLongText = splitLongReaderText(longText);
const splitParsed: ParsedBook = {
  title: '长章节优化',
  author: '本地文件',
  format: 'epub',
  chapters: splitLongText.map((text, index) => ({
    id: `split-${index + 1}`,
    href: `OPS/original.xhtml#chunk-${index + 1}`,
    title: '长章节',
    order: index,
    text,
    wordCount: text.length,
  })),
};
const splitEpub = buildInternalEpub(splitParsed, 'book_split', '2026-01-01T00:00:00.000Z');
const splitEntries = unzipSync(splitEpub);
const splitReparsed = parseEpub(splitEpub, 'split.epub');
const splitNavXml = new TextDecoder().decode(splitEntries['OPS/nav.xhtml']);
const secondSplitXml = new TextDecoder().decode(splitEntries['OPS/Text/chapter-0002.xhtml']);

assert(splitLongText.length > 1, 'oversized chapter should split before packaging');
assert(splitLongText.every((chunk) => chunk.length <= MAX_READER_CHAPTER_CHARS), 'split chunks should stay bounded');
assert(splitReparsed.chapters.length === splitParsed.chapters.length, 'split internal package should preserve spine count');
assert(splitReparsed.chapters.map((chapter) => chapter.text).join('').includes('长章节正文。'.repeat(50)), 'split internal package should preserve content');
assert(!splitNavXml.includes('chapter-0002.xhtml'), 'continuation chunks should stay out of nav');
assert(!/<h1>/.test(secondSplitXml), 'continuation chunks should not repeat visible headings');

console.log('publication package ok');
