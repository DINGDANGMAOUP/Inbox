import * as iconv from 'iconv-lite';

function decodeUtf8(bytes: Uint8Array) {
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes).replace(/^\uFEFF/, '');
  } catch {
    return null;
  }
}

export function decodeBookText(bytes: Uint8Array) {
  if (bytes.length >= 2 && bytes[0] === 0xff && bytes[1] === 0xfe) {
    return iconv.decode(bytes, 'utf16-le');
  }
  if (bytes.length >= 2 && bytes[0] === 0xfe && bytes[1] === 0xff) {
    return iconv.decode(bytes, 'utf16-be');
  }

  return decodeUtf8(bytes) ?? iconv.decode(bytes, 'gb18030');
}

export function hasDecodeDamage(text: string) {
  const sample = text.slice(0, 4000);
  const replacementCount = sample.split('\uFFFD').length - 1;
  return replacementCount >= 2;
}
