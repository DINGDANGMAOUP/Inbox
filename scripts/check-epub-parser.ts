import { strToU8, zipSync } from 'fflate';

import { EPUB_LAYOUT_MARKER, parseEpub } from '../src/lib/epub-parser';

const files = {
  'META-INF/container.xml': strToU8(`<?xml version="1.0"?>
    <container>
      <rootfiles>
        <rootfile full-path="OPS/package.opf" />
      </rootfiles>
    </container>`),
  'OPS/package.opf': strToU8(`<?xml version="1.0"?>
    <package>
      <metadata><title>Layout Book</title><creator>Tester</creator></metadata>
      <manifest>
        <item id="chap" href="Text/chapter.xhtml" media-type="application/xhtml+xml" />
        <item id="css" href="Styles/book.css" media-type="text/css" />
        <item id="img" href="Images/pic.png" media-type="image/png" />
      </manifest>
      <spine><itemref idref="chap" /></spine>
    </package>`),
  'OPS/Text/chapter.xhtml': strToU8(`<!doctype html>
    <html>
      <head>
        <title>Chapter</title>
        <link rel="stylesheet" href="../Styles/book.css" />
      </head>
      <body class="book-layout" onclick="bad()">
        <script>bad()</script>
        <p class="lead"><img src="../Images/pic.png" />原文排版</p>
      </body>
    </html>`),
  'OPS/Styles/book.css': strToU8('.lead { text-indent: 2em; }'),
  'OPS/Images/pic.png': Uint8Array.of(137, 80, 78, 71),
};

const parsed = parseEpub(zipSync(files), 'layout.epub');
const html = parsed.chapters[0]?.html ?? '';
const resourcePaths = new Set((parsed.resources ?? []).map((resource) => resource.path));

if (!html.includes(EPUB_LAYOUT_MARKER)) {
  throw new Error('EPUB layout marker missing');
}
if (!html.includes('--reader-font-family') || !html.includes('font-family: var(--reader-font-family')) {
  throw new Error('EPUB reader font hook missing');
}
if (!html.includes('href="../Styles/book.css"') || !html.includes('class="book-layout"') || !html.includes('class="lead"')) {
  throw new Error('EPUB HTML layout was not preserved');
}
if (html.includes('bad()') || html.includes('onclick=')) {
  throw new Error('EPUB active content was not stripped');
}
if (!resourcePaths.has('OPS/Styles/book.css') || !resourcePaths.has('OPS/Images/pic.png')) {
  throw new Error('EPUB resources were not collected');
}

console.log('epub parser ok');
