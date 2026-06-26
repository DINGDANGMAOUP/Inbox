import { XMLParser } from 'fast-xml-parser';
import { unzipSync } from 'fflate';

import { makeId, stripHtml, wordCount } from '@/lib/text-utils';
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

export type ParsedBook = {
  title: string;
  author: string;
  format: BookFormat;
  chapters: ParsedChapter[];
};

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '',
  textNodeName: '#text',
  removeNSPrefix: true,
});

const decoder = new TextDecoder('utf-8');

function asArray<T>(value: T | T[] | undefined | null): T[] {
  if (!value) {
    return [];
  }
  return Array.isArray(value) ? value : [value];
}

function textValue(value: unknown, fallback = ''): string {
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

function decodeZipFile(zip: Record<string, Uint8Array>, path: string) {
  const bytes = zip[path] ?? zip[decodeURIComponent(path)] ?? zip[encodeURI(path)];
  if (!bytes) {
    return null;
  }
  return decoder.decode(bytes);
}

function bodyHtml(html: string) {
  const bodyMatch = html.match(/<body[^>]*>([\s\S]*?)<\/body>/i);
  return (bodyMatch?.[1] ?? html)
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/\son\w+="[^"]*"/gi, '');
}

function guessTitleFromHtml(html: string, fallback: string) {
  const heading = html.match(/<h[1-3][^>]*>([\s\S]*?)<\/h[1-3]>/i)?.[1];
  return stripHtml(heading || '').slice(0, 90) || fallback;
}

function buildReaderHtml(title: string, html: string) {
  return `<!doctype html>
<html>
<head>
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0">
  <style>
    :root { color-scheme: light dark; }
    body {
      margin: 0;
      padding: 28px 22px 48px;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      line-height: var(--reader-line-height, 1.7);
      font-size: var(--reader-font-size, 19px);
      color: var(--reader-text, #22201c);
      background: var(--reader-bg, #f7f0df);
    }
    h1, h2, h3 { line-height: 1.18; letter-spacing: 0; }
    img, svg { max-width: 100%; height: auto; }
    p { margin: 0 0 1.05em; }
    mark { border-radius: 6px; padding: 0 2px; background: #f6d46a; }
  </style>
</head>
<body data-title="${escapeAttribute(title)}">
  ${bodyHtml(html)}
  <script>
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
  </script>
</body>
</html>`;
}

function escapeAttribute(input: string) {
  return input.replace(/&/g, '&amp;').replace(/"/g, '&quot;');
}

function collectNavLabels(zip: Record<string, Uint8Array>, basePath: string, manifestItems: any[]) {
  const navItem = manifestItems.find((item) => String(item.properties ?? '').includes('nav'));
  if (!navItem?.href) {
    return new Map<string, string>();
  }

  const navPath = normalizePath(`${basePath}${navItem.href}`);
  const navHtml = decodeZipFile(zip, navPath);
  const labels = new Map<string, string>();
  if (!navHtml) {
    return labels;
  }

  const linkPattern = /<a[^>]+href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;
  for (const match of navHtml.matchAll(linkPattern)) {
    const href = normalizePath(`${basePath}${match[1].split('#')[0]}`);
    const label = stripHtml(match[2]).slice(0, 90);
    if (label) {
      labels.set(href, label);
    }
  }

  return labels;
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
  const navLabels = collectNavLabels(zip, basePath, manifestItems);

  const manifestById = new Map(manifestItems.map((item: any) => [String(item.id), item]));
  const chapters = spineItems
    .map((item: any, index) => {
      const manifestItem = manifestById.get(String(item.idref));
      if (!manifestItem?.href) {
        return null;
      }

      const href = normalizePath(`${basePath}${manifestItem.href}`);
      const html = decodeZipFile(zip, href);
      if (!html) {
        return null;
      }

      const fallbackTitle = navLabels.get(href) ?? guessTitleFromHtml(html, `第 ${index + 1} 章`);
      const text = stripHtml(html);
      return {
        id: makeId('chapter'),
        href,
        title: fallbackTitle,
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
    title: textValue(metadata.title, fallbackName.replace(/\.(epub|txt)$/i, '')) || '未命名书籍',
    author: textValue(metadata.creator, '未知作者') || '未知作者',
    format: 'epub',
    chapters,
  };
}
