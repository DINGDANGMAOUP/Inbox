import { strToU8, zipSync } from 'fflate';

import type { ParsedBook } from '@/lib/epub-parser';

const LAYOUT_PARAGRAPH_CHUNK_CHARS = 240;

function escapeXml(value: string) {
  return value
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f-\u009f]/g, '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;');
}

export function internalEpubChapterHref(index: number) {
  return `Text/chapter-${String(index + 1).padStart(4, '0')}.xhtml`;
}

function splitLineForLayout(value: string) {
  if (value.length <= LAYOUT_PARAGRAPH_CHUNK_CHARS) {
    return [value];
  }

  const parts: string[] = [];
  let cursor = 0;

  while (cursor < value.length) {
    const target = Math.min(value.length, cursor + LAYOUT_PARAGRAPH_CHUNK_CHARS);
    let end = target;

    if (target < value.length) {
      const naturalEnd = Math.max(
        value.lastIndexOf('。', target - 1) + 1,
        value.lastIndexOf('！', target - 1) + 1,
        value.lastIndexOf('？', target - 1) + 1,
        value.lastIndexOf('.', target - 1) + 1,
      );
      if (naturalEnd > cursor + LAYOUT_PARAGRAPH_CHUNK_CHARS * 0.45) {
        end = naturalEnd;
      }
    }

    parts.push(value.slice(cursor, end));
    cursor = end;
  }

  return parts;
}

function renderTextLine(line: string) {
  if (!line) {
    return '<p class="empty">&#160;</p>';
  }

  return splitLineForLayout(line)
    .map((part, index) => `<p${index > 0 ? ' class="continued"' : ''}>${escapeXml(part)}</p>`)
    .join('\n');
}

function renderParagraphs(text: string) {
  return text
    .split(/\r?\n/)
    .map((line) => line.trimEnd())
    .map(renderTextLine)
    .join('\n');
}

function isContinuationChunk(href: string) {
  return /#chunk-(?:[2-9]|\d{2,})$/.test(href);
}

function renderChapter(title: string, text: string, showHeading = true) {
  return `<?xml version="1.0" encoding="utf-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml" xml:lang="zh-CN" lang="zh-CN">
<head>
  <title>${escapeXml(title)}</title>
  <link rel="stylesheet" type="text/css" href="../Styles/book.css"/>
</head>
<body>
  <section>
    ${showHeading ? `<h1>${escapeXml(title)}</h1>` : ''}
    ${renderParagraphs(text)}
  </section>
</body>
</html>`;
}

function renderNav(book: ParsedBook) {
  const items = book.chapters
    .map((chapter, index) => ({ chapter, index }))
    .filter(({ chapter }) => !isContinuationChunk(chapter.href))
    .map(({ chapter, index }) => `<li><a href="${internalEpubChapterHref(index)}">${escapeXml(chapter.title)}</a></li>`)
    .join('\n');

  return `<?xml version="1.0" encoding="utf-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops" xml:lang="zh-CN" lang="zh-CN">
<head><title>${escapeXml(book.title)}</title></head>
<body>
  <nav epub:type="toc" id="toc">
    <h1>${escapeXml(book.title)}</h1>
    <ol>${items}</ol>
  </nav>
</body>
</html>`;
}

function renderPackage(book: ParsedBook, id: string, modified: string) {
  const manifestItems = book.chapters
    .map((_, index) => `<item id="chapter-${index + 1}" href="${internalEpubChapterHref(index)}" media-type="application/xhtml+xml"/>`)
    .join('\n    ');
  const spineItems = book.chapters
    .map((_, index) => `<itemref idref="chapter-${index + 1}"/>`)
    .join('\n    ');

  return `<?xml version="1.0" encoding="utf-8"?>
<package xmlns="http://www.idpf.org/2007/opf" unique-identifier="book-id" version="3.0">
  <metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
    <dc:identifier id="book-id">${escapeXml(id)}</dc:identifier>
    <dc:title>${escapeXml(book.title)}</dc:title>
    <dc:creator>${escapeXml(book.author)}</dc:creator>
    <dc:language>zh-CN</dc:language>
    <meta property="dcterms:modified">${modified}</meta>
  </metadata>
  <manifest>
    <item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/>
    <item id="css" href="Styles/book.css" media-type="text/css"/>
    ${manifestItems}
  </manifest>
  <spine>
    ${spineItems}
  </spine>
</package>`;
}

export function buildInternalEpub(book: ParsedBook, id: string, modified = new Date().toISOString()) {
  const files: Record<string, Uint8Array | [Uint8Array, { level: 0 }]> = {
    mimetype: [strToU8('application/epub+zip'), { level: 0 }],
    'META-INF/container.xml': strToU8(`<?xml version="1.0" encoding="utf-8"?>
<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
  <rootfiles>
    <rootfile full-path="OPS/package.opf" media-type="application/oebps-package+xml"/>
  </rootfiles>
</container>`),
    'OPS/package.opf': strToU8(renderPackage(book, id, modified)),
    'OPS/nav.xhtml': strToU8(renderNav(book)),
    'OPS/Styles/book.css': strToU8(`body {
  margin: 0;
  padding: 0;
  line-height: 1.7;
  -webkit-user-select: text;
  user-select: text;
}
p {
  margin: 0;
  text-indent: 2em;
}
p.continued,
p.empty {
  text-indent: 0;
}
p.empty {
  min-height: 0.75em;
}
h1 {
  font-size: 1.15em;
  line-height: 1.5;
  margin: 0 0 1em;
}`),
  };

  book.chapters.forEach((chapter, index) => {
    files[`OPS/${internalEpubChapterHref(index)}`] = strToU8(renderChapter(chapter.title, chapter.text, !isContinuationChunk(chapter.href)));
  });

  return zipSync(files, { level: 6, mtime: new Date('1980-01-01T00:00:00.000Z') });
}
