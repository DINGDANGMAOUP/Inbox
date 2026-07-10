import {
  chapterFromReadiumLocator,
  clampRatio,
  parseAnnotationPosition,
  parseReadiumLocator,
  readiumHrefMatchesChapter,
  readiumLocatorForAnnotation,
  readiumLocatorForChapter,
  readiumLocatorForOffset,
} from '../src/lib/readium-locators';
import type { Annotation, Chapter } from '../src/types/reader';

function assert(condition: unknown, message: string) {
  if (!condition) {
    throw new Error(message);
  }
}

const chapter: Chapter = {
  id: 'chapter-1',
  bookId: 'book-1',
  href: 'OPS/Text/chapter.xhtml#chunk-2',
  title: '第一章',
  order: 0,
  textContent: '开头一段。\n第二段包含需要定位的文字。',
  wordCount: 19,
};

const chapterLocator = parseReadiumLocator(readiumLocatorForChapter(chapter, 2));
assert(chapterLocator?.href === 'OPS/Text/chapter.xhtml', 'chapter href should remove chunk fragments');
assert(chapterLocator?.locations?.progression === 1, 'chapter progression should be clamped');
assert(readiumHrefMatchesChapter(chapter, './Text/chapter.xhtml#fragment'), 'relative locator href should match chapter');
assert(chapterFromReadiumLocator([chapter], readiumLocatorForChapter(chapter))?.index === 0, 'locator should resolve its chapter');

const offset = chapter.textContent.indexOf('需要定位');
const offsetLocator = parseReadiumLocator(readiumLocatorForOffset(chapter, offset, '需要定位'));
assert(offsetLocator?.text?.highlight === '需要定位', 'offset locator should preserve the quote');
assert(offsetLocator?.locations?.cssSelector?.includes('p:nth-of-type(2)'), 'offset locator should target the second paragraph');

const annotation: Annotation = {
  id: 'note-1',
  bookId: chapter.bookId,
  chapterId: chapter.id,
  type: 'note',
  selectedText: '需要定位',
  position: JSON.stringify({ chapterId: chapter.id, offset }),
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
};
assert(parseReadiumLocator(readiumLocatorForAnnotation(annotation, chapter))?.text?.highlight === '需要定位', 'annotation should receive a Readium locator');
assert(Object.keys(parseAnnotationPosition('{bad json')).length === 0, 'invalid annotation JSON should be ignored');
assert(clampRatio(Number.NaN) === 0, 'invalid ratios should fall back to zero');

console.log('readium locators ok');
