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

export function splitTxtIntoChapters(text: string) {
  const normalized = text.replace(/\r\n/g, '\n').trim();
  const headingPattern = /(?:^|\n)(#{1,3}\s+.+|第.{1,9}[章节回].*|Chapter\s+\d+.*)(?=\n)/gi;
  const matches = [...normalized.matchAll(headingPattern)];

  if (matches.length > 1) {
    return matches.map((match, index) => {
      const start = match.index ?? 0;
      const end = matches[index + 1]?.index ?? normalized.length;
      const chunk = normalized.slice(start, end).trim();
      const firstLine = chunk.split('\n')[0]?.replace(/^#+\s*/, '').trim() || `第 ${index + 1} 章`;
      return { title: firstLine.slice(0, 80), text: chunk };
    });
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
