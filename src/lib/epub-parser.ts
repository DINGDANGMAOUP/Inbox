import { XMLParser } from 'fast-xml-parser';
import { unzipSync } from 'fflate';

import { decodeBookText } from '@/lib/book-text-decoder';
import { cleanChapterTitle, makeId, stripHtml, wordCount } from '@/lib/text-utils';
import type { BookFormat } from '@/types/reader';

type ParsedChapter = {
  id: string;
  href: string;
  title: string;
  order: number;
  html: string;
  text: string;
  wordCount: number;
};

type ParsedResource = {
  path: string;
  bytes: Uint8Array;
};

export type ParsedBook = {
  title: string;
  author: string;
  format: BookFormat;
  chapters: ParsedChapter[];
  resources?: ParsedResource[];
};

export const EPUB_LAYOUT_MARKER = 'name="inbox-epub-layout" content="2"';

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '',
  textNodeName: '#text',
  removeNSPrefix: true,
});

function asArray<T>(value: T | T[] | undefined | null): T[] {
  if (!value) {
    return [];
  }
  return Array.isArray(value) ? value : [value];
}

function textValue(value: unknown, fallback = ''): string {
  if (Array.isArray(value)) {
    return textValue(value[0], fallback);
  }
  if (typeof value === 'string' || typeof value === 'number') {
    return String(value);
  }
  if (value && typeof value === 'object' && '#text' in value) {
    return String((value as { '#text': unknown })['#text']);
  }
  return fallback;
}

function dirname(path: string) {
  const index = path.lastIndexOf('/');
  return index === -1 ? '' : path.slice(0, index + 1);
}

function normalizePath(path: string) {
  const parts: string[] = [];
  for (const part of path.split('/')) {
    if (!part || part === '.') {
      continue;
    }
    if (part === '..') {
      parts.pop();
    } else {
      parts.push(part);
    }
  }
  return parts.join('/');
}

function resolveHref(basePath: string, href: string) {
  return normalizePath(`${basePath}${href.split('#')[0]}`);
}

function decodeZipFile(zip: Record<string, Uint8Array>, path: string) {
  const bytes = zip[path] ?? zip[decodeURIComponent(path)] ?? zip[encodeURI(path)];
  if (!bytes) {
    return null;
  }
  return decodeBookText(bytes);
}

function bodyHtml(html: string) {
  const bodyMatch = html.match(/<body[^>]*>([\s\S]*?)<\/body>/i);
  return sanitizeEpubHtml(bodyMatch?.[1] ?? html);
}

function guessTitleFromHtml(html: string, fallback: string) {
  const heading = html.match(/<h[1-6][^>]*>([\s\S]*?)<\/h[1-6]>/i)?.[1];
  const title = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1];
  const firstText = stripHtml(bodyHtml(html)).split(/[。！？.!?\n]/)[0];
  return cleanChapterTitle(stripHtml(heading || title || firstText), fallback);
}

function sanitizeEpubHtml(html: string) {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<iframe[\s\S]*?<\/iframe>/gi, '')
    .replace(/<object[\s\S]*?<\/object>/gi, '')
    .replace(/<embed\b[^>]*>/gi, '')
    .replace(/<base\b[^>]*>/gi, '')
    .replace(/\son[\w:-]+\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi, '')
    .replace(/\s(?:href|src|xlink:href)\s*=\s*(["'])\s*javascript:[\s\S]*?\1/gi, '')
    .replace(/\s(?:href|src|xlink:href)\s*=\s*javascript:[^\s>]+/gi, '');
}

function readerHeadAdditions() {
  return `
  <meta ${EPUB_LAYOUT_MARKER}>
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0">
  <style>
    html { background: var(--reader-bg, transparent); }
    img, svg { max-width: 100%; height: auto; }
    .inbox-custom-selection {
      background: rgba(167, 121, 78, 0.28);
      border-radius: 0.16em;
      -webkit-box-decoration-break: clone;
      box-decoration-break: clone;
    }
    .inbox-saved-annotation {
      border-radius: 0.12em;
      cursor: pointer;
      -webkit-box-decoration-break: clone;
      box-decoration-break: clone;
    }
    .inbox-saved-highlight {
      background: rgba(216, 235, 213, 0.36);
      text-decoration: underline;
      text-decoration-color: rgba(47, 107, 79, 0.72);
      text-decoration-thickness: 2px;
      text-underline-offset: 0.18em;
    }
    .inbox-saved-note {
      background: rgba(226, 230, 189, 0.28);
      text-decoration: underline dotted;
      text-decoration-color: rgba(94, 96, 67, 0.82);
      text-decoration-thickness: 2px;
      text-underline-offset: 0.2em;
    }
  </style>
`;
}

function readerBodyScript() {
  return `<script>
    window.__INBOX_CAPTURE_SELECTION = function() {
      var selection = window.getSelection();
      var selectedText = selection ? selection.toString().trim() : "";
      window.ReactNativeWebView.postMessage(JSON.stringify({
        type: selectedText ? "selection" : "selection-empty",
        selectedText: selectedText,
        offset: selectedText ? document.body.innerText.indexOf(selectedText) : -1
      }));
    };
    window.addEventListener("scroll", function() {
      var max = Math.max(1, document.documentElement.scrollHeight - window.innerHeight);
      window.ReactNativeWebView.postMessage(JSON.stringify({
        type: "progress",
        ratio: Math.min(1, Math.max(0, window.scrollY / max))
      }));
    }, { passive: true });
  </script>`;
}

function buildReaderHtml(title: string, html: string) {
  const sanitized = sanitizeEpubHtml(html);
  const withHead = /<\/head>/i.test(sanitized)
    ? sanitized.replace(/<\/head>/i, `${readerHeadAdditions()}</head>`)
    : `<!doctype html><html><head><title>${escapeAttribute(title)}</title>${readerHeadAdditions()}</head><body>${bodyHtml(sanitized)}</body></html>`;

  return /<\/body>/i.test(withHead)
    ? withHead.replace(/<\/body>/i, `${readerBodyScript()}</body>`)
    : `${withHead}${readerBodyScript()}`;
}

function escapeAttribute(input: string) {
  return input.replace(/&/g, '&amp;').replace(/"/g, '&quot;');
}

function addLabel(labels: Map<string, string>, href: string, label: string) {
  const cleaned = cleanChapterTitle(label, '');
  if (cleaned) {
    labels.set(href, cleaned);
  }
}

function collectNavDocumentLabels(zip: Record<string, Uint8Array>, basePath: string, manifestItems: any[]) {
  const navItem = manifestItems.find((item) => String(item.properties ?? '').includes('nav'));
  if (!navItem?.href) {
    return new Map<string, string>();
  }

  const navPath = normalizePath(`${basePath}${navItem.href}`);
  const navBasePath = dirname(navPath);
  const navHtml = decodeZipFile(zip, navPath);
  const labels = new Map<string, string>();
  if (!navHtml) {
    return labels;
  }

  const linkPattern = /<a[^>]+href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;
  for (const match of navHtml.matchAll(linkPattern)) {
    addLabel(labels, resolveHref(navBasePath, match[1]), stripHtml(match[2]));
  }

  return labels;
}

function collectNcxLabels(zip: Record<string, Uint8Array>, basePath: string, manifestItems: any[], spine: any) {
  const tocId = spine?.toc ? String(spine.toc) : null;
  const ncxItem =
    (tocId ? manifestItems.find((item) => String(item.id) === tocId) : null) ??
    manifestItems.find((item) => String(item['media-type'] ?? '').includes('dtbncx') || /\.ncx$/i.test(String(item.href ?? '')));

  const labels = new Map<string, string>();
  if (!ncxItem?.href) {
    return labels;
  }

  const ncxPath = normalizePath(`${basePath}${ncxItem.href}`);
  const ncxBasePath = dirname(ncxPath);
  const ncxXml = decodeZipFile(zip, ncxPath);
  if (!ncxXml) {
    return labels;
  }

  const navMap = parser.parse(ncxXml)?.ncx?.navMap;
  const visit = (points: any[]) => {
    for (const point of points) {
      const src = textValue(point?.content?.src);
      const label = textValue(point?.navLabel?.text);
      if (src && label) {
        addLabel(labels, resolveHref(ncxBasePath, src), label);
      }
      visit(asArray(point?.navPoint));
    }
  };

  visit(asArray(navMap?.navPoint));
  return labels;
}

function mergeLabels(...maps: Map<string, string>[]) {
  const merged = new Map<string, string>();
  for (const map of maps) {
    for (const [href, label] of map) {
      merged.set(href, label);
    }
  }

  return merged;
}

function collectResources(zip: Record<string, Uint8Array>, basePath: string, manifestItems: any[], chapterHrefs: Set<string>) {
  return manifestItems.flatMap((item: any) => {
    if (!item?.href) {
      return [];
    }

    const path = normalizePath(`${basePath}${item.href}`);
    const mediaType = String(item['media-type'] ?? '');
    if (chapterHrefs.has(path) || /x?html/i.test(mediaType) || String(item.properties ?? '').includes('nav')) {
      return [];
    }

    const bytes = zip[path] ?? zip[decodeURIComponent(path)] ?? zip[encodeURI(path)];
    return bytes ? [{ path, bytes }] : [];
  });
}

export function parseEpub(bytes: Uint8Array, fallbackName: string): ParsedBook {
  const zip = unzipSync(bytes);
  const containerXml = decodeZipFile(zip, 'META-INF/container.xml');
  if (!containerXml) {
    throw new Error('这个 EPUB 缺少 META-INF/container.xml。');
  }

  const container = parser.parse(containerXml);
  const rootFile = asArray(container?.container?.rootfiles?.rootfile)[0];
  const opfPath = rootFile?.['full-path'];
  if (!opfPath) {
    throw new Error('这个 EPUB 没有声明 OPF 包文件。');
  }

  const opfXml = decodeZipFile(zip, opfPath);
  if (!opfXml) {
    throw new Error('无法读取 EPUB 包文件。');
  }

  const opf = parser.parse(opfXml)?.package;
  const metadata = opf?.metadata ?? {};
  const manifestItems = asArray(opf?.manifest?.item);
  const spineItems = asArray(opf?.spine?.itemref);
  const basePath = dirname(opfPath);
  const tocLabels = mergeLabels(
    collectNcxLabels(zip, basePath, manifestItems, opf?.spine),
    collectNavDocumentLabels(zip, basePath, manifestItems)
  );

  const manifestById = new Map(manifestItems.map((item: any) => [String(item.id), item]));
  const chapterHrefs = new Set<string>();
  const chapters = spineItems
    .map((item: any, index) => {
      const manifestItem = manifestById.get(String(item.idref));
      if (!manifestItem?.href) {
        return null;
      }
      if (String(item.linear ?? 'yes').toLowerCase() === 'no') {
        return null;
      }
      if (String(manifestItem.properties ?? '').includes('nav')) {
        return null;
      }
      const mediaType = String(manifestItem['media-type'] ?? '');
      if (mediaType && !/x?html/i.test(mediaType)) {
        return null;
      }

      const href = normalizePath(`${basePath}${manifestItem.href}`);
      chapterHrefs.add(href);
      const html = decodeZipFile(zip, href);
      if (!html) {
        return null;
      }

      const fallbackTitle = tocLabels.get(href) ?? guessTitleFromHtml(html, `第 ${index + 1} 章`);
      const text = stripHtml(html);
      return {
        id: makeId('chapter'),
        href,
        title: cleanChapterTitle(fallbackTitle, `第 ${index + 1} 章`),
        order: index,
        html: buildReaderHtml(fallbackTitle, html),
        text,
        wordCount: wordCount(text),
      };
    })
    .filter(Boolean) as ParsedChapter[];

  if (!chapters.length) {
    throw new Error('没有找到可阅读的 EPUB 章节。');
  }

  return {
    title: cleanChapterTitle(textValue(metadata.title), fallbackName.replace(/\.(epub|txt)$/i, '') || '未命名书籍'),
    author: cleanChapterTitle(textValue(metadata.creator), '未知作者'),
    format: 'epub',
    chapters,
    resources: collectResources(zip, basePath, manifestItems, chapterHrefs),
  };
}
