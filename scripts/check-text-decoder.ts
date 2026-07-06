import * as iconv from 'iconv-lite';

import { decodeBookText } from '../src/lib/book-text-decoder';

const cases = [
  [new TextEncoder().encode('西游记'), '西游记'],
  [iconv.encode('我的中文书', 'gbk'), '我的中文书'],
  [Uint8Array.of(0xff, 0xfe, 0x2d, 0x4e, 0x87, 0x65), '中文'],
] as const;

for (const [bytes, expected] of cases) {
  const decoded = decodeBookText(bytes);
  if (decoded !== expected) {
    throw new Error(`Expected ${expected}, got ${decoded}`);
  }
}

console.log('text decoder ok');
