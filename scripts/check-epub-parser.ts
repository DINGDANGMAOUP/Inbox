import { strToU8, zipSync } from 'fflate';

import { parseEpub } from '../src/lib/epub-parser';

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
const text = parsed.chapters[0]?.text ?? '';

if (!text.includes('原文排版')) {
  throw new Error('EPUB chapter text missing');
}
if (text.includes('bad()') || text.includes('onclick=')) {
  throw new Error('EPUB active content leaked into text');
}

console.log('epub parser ok');
