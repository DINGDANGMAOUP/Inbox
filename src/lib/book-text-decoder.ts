import * as iconv from 'iconv-lite';

function decodeUtf8(bytes: Uint8Array) {
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes).replace(/^\uFEFF/, '');
  } catch {
    return null;
  }
}

function decodeDamageScore(text: string) {
  const sample = text.slice(0, 4000);
  const replacementCount = sample.split('\uFFFD').length - 1;
  const c1Count = sample.match(/[\u0080-\u009f]/g)?.length ?? 0;
  const mojibakeCount = sample.match(/[ÃÂâæçèéåäïã][\u0080-\u00bf]/g)?.length ?? 0;
  return replacementCount * 20 + c1Count + mojibakeCount * 2;
}

function repairUtf8Mojibake(text: string) {
  if (decodeDamageScore(text) < 2) {
    return text;
  }

  const bytes = new Uint8Array(text.length);
  for (let index = 0; index < text.length; index += 1) {
    const code = text.charCodeAt(index);
    if (code > 0xff) {
      return text;
    }
    bytes[index] = code;
  }

  const repaired = decodeUtf8(bytes);
  return repaired && decodeDamageScore(repaired) < decodeDamageScore(text) ? repaired : text;
}

export function decodeBookText(bytes: Uint8Array) {
  let decoded: string;
  if (bytes.length >= 2 && bytes[0] === 0xff && bytes[1] === 0xfe) {
    decoded = iconv.decode(bytes, 'utf16-le');
  } else if (bytes.length >= 2 && bytes[0] === 0xfe && bytes[1] === 0xff) {
    decoded = iconv.decode(bytes, 'utf16-be');
  } else {
    decoded = decodeUtf8(bytes) ?? iconv.decode(bytes, 'gb18030');
  }

  return repairUtf8Mojibake(decoded).replace(/^\uFEFF/, '');
}

export function hasDecodeDamage(text: string) {
  return decodeDamageScore(text) >= 2;
}
