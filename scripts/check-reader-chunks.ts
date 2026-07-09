import { splitLongReaderText } from '../src/lib/text-utils';

function assert(condition: unknown, message: string) {
  if (!condition) {
    throw new Error(message);
  }
}

const naturalText = `  ${'甲'.repeat(18)}。\n\n  ${'乙'.repeat(35)}。\n${'丙'.repeat(30)}。  `;
const naturalChunks = splitLongReaderText(naturalText, 40);

assert(naturalChunks.length > 1, 'expected long natural text to split');
assert(naturalChunks.every((chunk) => chunk.length <= 40), 'natural chunks should stay under limit');
assert(naturalChunks.join('') === naturalText, 'natural chunks should preserve exact text');

const hardText = 'x'.repeat(95);
const hardChunks = splitLongReaderText(hardText, 40);

assert(hardChunks.length === 3, 'hard text should split by limit');
assert(hardChunks.every((chunk) => chunk.length <= 40), 'hard chunks should stay under limit');
assert(hardChunks.join('') === hardText, 'hard chunks should preserve text');

const pageCount = (maxScroll: number, pageStep: number) => Math.max(1, Math.ceil(maxScroll / pageStep) + 1);
assert(pageCount(420, 100) === 6, 'partial trailing page should be reachable');
assert(pageCount(400, 100) === 5, 'exact trailing page count should stay stable');

console.log('reader chunks ok');
