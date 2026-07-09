import * as iconv from 'iconv-lite';

import { decodeBookText, hasDecodeDamage } from '../src/lib/book-text-decoder';

const mojibakeSource = '极限长篇测试';
const mojibakeText = String.fromCharCode(...new TextEncoder().encode(mojibakeSource));

const cases = [
  [new TextEncoder().encode('西游记'), '西游记'],
  [iconv.encode('我的中文书', 'gbk'), '我的中文书'],
  [Uint8Array.of(0xff, 0xfe, 0x2d, 0x4e, 0x87, 0x65), '中文'],
  [new TextEncoder().encode(mojibakeText), mojibakeSource],
] as const;

if (!hasDecodeDamage(mojibakeText)) {
  throw new Error('Expected mojibake text to be detected as decode damage');
}

for (const [bytes, expected] of cases) {
  const decoded = decodeBookText(bytes);
  if (decoded !== expected) {
    throw new Error(`Expected ${expected}, got ${decoded}`);
  }
}

console.log('text decoder ok');
