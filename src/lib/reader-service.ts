import { Directory, File, Paths } from "expo-file-system";
import type { SQLiteDatabase } from "expo-sqlite";

import { decodeBookText, hasDecodeDamage } from "@/lib/book-text-decoder";
import { parseEpub, type ParsedBook } from "@/lib/epub-parser";
import { buildInternalEpub, internalEpubChapterHref } from "@/lib/publication-package";
import {
  cleanChapterTitle,
  excerptAround,
  hashBytes,
  legacyHashBytes,
  MAX_READER_CHAPTER_CHARS,
  makeId,
  safeFileName,
  splitLongReaderText,
  splitTxtIntoChapters,
  wordCount,
} from "@/lib/text-utils";
import type {
  Annotation,
  AnnotationType,
  AppThemeMode,
  Book,
  Chapter,
  LibraryBook,
  ReaderPreferences,
  ReaderFontFamily,
  ReaderTheme,
  SearchResult,
} from "@/types/reader";

type BookRow = {
  id: string;
  title: string;
  author: string;
  format: "epub" | "txt";
  file_uri: string;
  publication_uri?: string | null;
  cover_uri: string | null;
  imported_at: string;
  last_opened_at: string | null;
  total_chapters: number;
  progress_chapter_id?: string | null;
  progress_ratio?: number | null;
  current_chapter_title?: string | null;
  current_chapter_order?: number | null;
};

type ChapterRow = {
  id: string;
  book_id: string;
  href: string;
  title: string;
  chapter_order: number;
  text_content: string;
  text_length?: number;
  word_count: number;
};

type AnnotationRow = {
  id: string;
  book_id: string;
  chapter_id: string;
  type: AnnotationType;
  selected_text: string | null;
  note_text: string | null;
  color: string | null;
  position: string;
  created_at: string;
  updated_at: string;
};

type StoredChapter = {
  id: string;
  href: string;
  title: string;
  order: number;
  text: string;
  wordCount: number;
};

export type ImportBookProgress = {
  title: string;
  detail: string;
  progress: number;
};

type ImportBookProgressHandler = (progress: ImportBookProgress) => void;

const readerDirectory = new Directory(Paths.document, "inbox-reader");
const INTERNAL_PUBLICATION_VERSION = "readium-internal-epub-v3-soft-paragraph-chunks";

async function showImportProgress(
  onProgress: ImportBookProgressHandler | undefined,
  progress: ImportBookProgress,
) {
  onProgress?.(progress);
  if (onProgress) {
    await new Promise<void>((resolve) => setTimeout(resolve, 0));
  }
}

function normalizeAppThemeMode(theme?: string | null): AppThemeMode {
  if (theme === "system" || theme === "mist" || theme === "deep") {
    return theme;
  }
  if (theme === "ink") {
    return "deep";
  }
  return "system";
}

function normalizeReaderTheme(theme?: string | null): ReaderTheme {
  if (
    theme === "paper" ||
    theme === "sepia" ||
    theme === "night" ||
    theme === "eink"
  ) {
    return theme;
  }
  if (theme === "deep" || theme === "ink") {
    return "night";
  }
  if (theme === "sage") {
    return "paper";
  }
  return "paper";
}

function normalizeReadingMode(
  mode?: string | null,
): ReaderPreferences["readingMode"] {
  return mode === "page" ? "page" : "scroll";
}

function normalizeReaderFontFamily(fontFamily?: string | null): ReaderFontFamily {
  if (
    fontFamily === "system" ||
    fontFamily === "serif" ||
    fontFamily === "sans" ||
    fontFamily === "kai"
  ) {
    return fontFamily;
  }
  return "system";
}

function mapBook(row: BookRow): Book {
  return {
    id: row.id,
    title: row.title,
    author: row.author,
    format: row.format,
    fileUri: row.file_uri,
    publicationUri: row.publication_uri,
    coverUri: row.cover_uri,
    importedAt: row.imported_at,
    lastOpenedAt: row.last_opened_at,
    totalChapters: row.total_chapters,
  };
}

function mapLibraryBook(row: BookRow): LibraryBook {
  return {
    ...mapBook(row),
    progressChapterId: row.progress_chapter_id,
    progressRatio: row.progress_ratio,
    currentChapterTitle: row.current_chapter_title,
    currentChapterOrder: row.current_chapter_order,
  };
}

function mapChapter(row: ChapterRow): Chapter {
  return {
    id: row.id,
    bookId: row.book_id,
    href: row.href,
    title: row.title,
    order: row.chapter_order,
    textContent: row.text_content,
    textLength: row.text_length ?? row.text_content.length,
    wordCount: row.word_count,
  };
}

function mapAnnotation(row: AnnotationRow): Annotation {
  return {
    id: row.id,
    bookId: row.book_id,
    chapterId: row.chapter_id,
    type: row.type,
    selectedText: row.selected_text,
    noteText: row.note_text,
    color: row.color,
    position: row.position,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function ensureReaderDirectory() {
  readerDirectory.create({ idempotent: true, intermediates: true });
}

async function copyFileToPrivateFile(
  sourceFile: File,
  originalName: string,
) {
  ensureReaderDirectory();

  const tempDir = new Directory(readerDirectory, `import-${makeId("tmp")}`);
  tempDir.create({ idempotent: true, intermediates: true });

  const tempFile = new File(tempDir, safeFileName(originalName));
  const bytes = await sourceFile.bytes();
  tempFile.create({ overwrite: true, intermediates: true });
  tempFile.write(bytes);

  return { tempDir, tempFile, bytes };
}

function splitLongChapters(parsed: ParsedBook): ParsedBook {
  const chapters = parsed.chapters.flatMap((chapter) => {
    const parts = splitLongReaderText(chapter.text);
    if (parts.length === 1) {
      return [chapter];
    }

    return parts.map((text, index) => ({
      ...chapter,
      id: `${chapter.id}_${index + 1}`,
      href: `${chapter.href}#chunk-${index + 1}`,
      title: chapter.title,
      text,
      wordCount: wordCount(text),
    }));
  });

  return {
    ...parsed,
    chapters: chapters.map((chapter, order) => ({ ...chapter, order })),
  };
}

function usesInternalReadiumPublication(parsed: ParsedBook) {
  return parsed.format === "txt" || parsed.chapters.some((chapter) => chapter.href.includes("#chunk-"));
}

function writeParsedChapters(
  parsed: ParsedBook,
  id: string,
  existingRows: ChapterRow[] = [],
): StoredChapter[] {
  const usesInternalPublication = usesInternalReadiumPublication(parsed);
  return parsed.chapters.map((chapter, index) => {
    const splitMatch = chapter.href.match(/^(.*)#chunk-(\d+)$/);
    const existing =
      existingRows.find((row) => row.href === chapter.href) ??
      (splitMatch?.[2] === "1" ? existingRows.find((row) => row.href === splitMatch[1]) : undefined) ??
      (!splitMatch ? existingRows.find((row) => row.chapter_order === chapter.order) : undefined);
    return {
      ...chapter,
      id: existing?.id ?? `${id}_${chapter.id}`,
      href: usesInternalPublication ? internalEpubChapterHref(index) : chapter.href,
    };
  });
}

async function writeParsedBookFiles(
  parsed: ParsedBook,
  importedFile: File,
  originalName: string,
  id: string,
) {
  const bookDir = new Directory(readerDirectory, id);
  bookDir.create({ idempotent: true, intermediates: true });

  const storedName = safeFileName(originalName);
  const storedFile = new File(bookDir, storedName);
  await importedFile.copy(storedFile, { overwrite: true });
  const chapters = writeParsedChapters(parsed, id);
  const publicationUri = writeReadiumPublication(parsed, bookDir, id, storedFile.uri);

  return {
    id,
    fileUri: storedFile.uri,
    publicationUri,
    chapters,
  };
}

function writeReadiumPublication(
  parsed: ParsedBook,
  bookDir: Directory,
  id: string,
  fallbackUri: string,
) {
  if (!usesInternalReadiumPublication(parsed)) {
    return fallbackUri;
  }

  const publicationFile = new File(bookDir, "publication.epub");
  publicationFile.create({ overwrite: true, intermediates: true });
  publicationFile.write(buildInternalEpub(parsed, id));
  const publicationVersionFile = new File(bookDir, "publication.version");
  publicationVersionFile.create({ overwrite: true, intermediates: true });
  publicationVersionFile.write(INTERNAL_PUBLICATION_VERSION);
  return publicationFile.uri;
}

function isInternalEpubUri(uri?: string | null) {
  return Boolean(uri?.split(/[?#]/)[0]?.toLowerCase().endsWith(".epub"));
}

async function needsInternalPublicationVersionRefresh(book: Book) {
  if (!isInternalEpubUri(book.publicationUri)) {
    return false;
  }

  try {
    const versionUri = book.publicationUri!.split(/[?#]/)[0].replace(/[^/]+$/, "publication.version");
    return (await new File(versionUri).text()).trim() !== INTERNAL_PUBLICATION_VERSION;
  } catch {
    return true;
  }
}

function needsTxtReadiumRefresh(book: Book, rows: ChapterRow[]) {
  if (book.format !== "txt") {
    return false;
  }

  if (!isInternalEpubUri(book.publicationUri)) {
    return true;
  }

  return rows.some((row, index) => row.href !== internalEpubChapterHref(index));
}

async function insertChapters(
  db: SQLiteDatabase,
  bookId: string,
  chapters: StoredChapter[],
) {
  for (const chapter of chapters) {
    await db.runAsync(
      `INSERT INTO chapters (id, book_id, href, title, chapter_order, text_content, word_count)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      chapter.id,
      bookId,
      chapter.href,
      chapter.title,
      chapter.order,
      chapter.text,
      chapter.wordCount,
    );

    await db.runAsync(
      `INSERT INTO search_index (book_id, chapter_id, chapter_title, content)
       VALUES (?, ?, ?, ?)`,
      bookId,
      chapter.id,
      chapter.title,
      chapter.text,
    );
  }
}

function parseTxt(
  bytes: Uint8Array,
  fallbackName: string,
): ParsedBook {
  const text = decodeBookText(bytes);
  const fallbackTitle = fallbackName.replace(/\.(txt|text)$/i, "").trim();
  const firstTextTitle = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .find(Boolean);
  const titleLooksLikeProviderId =
    /^(msf|raw|document):?\d+$/i.test(fallbackTitle) ||
    !/[a-z0-9\u4e00-\u9fff]/i.test(fallbackTitle);
  const normalizedFirstTitle = cleanChapterTitle(firstTextTitle, "");
  const title =
    titleLooksLikeProviderId && normalizedFirstTitle
      ? normalizedFirstTitle.slice(0, 80)
      : fallbackTitle || "未命名文本";
  const chapters = splitTxtIntoChapters(text).map((chapter, index) => ({
    id: makeId("chapter"),
    href: `txt:${index}`,
    title: chapter.title,
    order: index,
    text: chapter.text,
    wordCount: wordCount(chapter.text),
  }));

  return {
    title,
    author: "本地文件",
    format: "txt",
    chapters,
  };
}

async function importBookFile(
  db: SQLiteDatabase,
  sourceFile: File,
  originalName: string,
  onProgress?: ImportBookProgressHandler,
) {
  const extension = originalName.split(".").pop()?.toLowerCase();
  const mimeType = sourceFile.type.toLowerCase();
  const inferredFormat =
    extension === "epub" || mimeType === "application/epub+zip"
      ? "epub"
      : extension === "txt" || mimeType.startsWith("text/")
        ? "txt"
        : null;

  if (!inferredFormat) {
    throw new Error("当前版本仅支持 EPUB 和 TXT 文件。");
  }

  await showImportProgress(onProgress, {
    title: "读取文件",
    detail: "正在复制到本地书库",
    progress: 0.2,
  });
  const { tempDir, tempFile, bytes } = await copyFileToPrivateFile(
    sourceFile,
    originalName,
  );

  await showImportProgress(onProgress, {
    title: "检查书籍",
    detail: "正在确认格式和重复导入",
    progress: 0.4,
  });
  const contentHash = hashBytes(bytes);
  const id = `book_${contentHash}`;
  const legacyId = `book_${legacyHashBytes(bytes)}`;

  const existing = await db.getFirstAsync<{ id: string }>(
    "SELECT id FROM books WHERE id IN (?, ?) ORDER BY imported_at ASC LIMIT 1",
    id,
    legacyId,
  );
  if (existing) {
    if (tempDir.exists) {
      tempDir.delete();
    }
    await showImportProgress(onProgress, {
      title: "已在书架",
      detail: "正在打开已有副本",
      progress: 1,
    });
    return getBook(db, existing.id);
  }

  await showImportProgress(onProgress, {
    title: "解析内容",
    detail: inferredFormat === "epub" ? "正在拆解目录和章节" : "正在整理文本章节",
    progress: 0.62,
  });
  const parsed = splitLongChapters(
    inferredFormat === "epub"
      ? parseEpub(bytes, originalName)
      : parseTxt(bytes, originalName),
  );
  const now = new Date().toISOString();

  await showImportProgress(onProgress, {
    title: "保存书架",
    detail: "正在写入章节和搜索索引",
    progress: 0.82,
  });
  const stored = await writeParsedBookFiles(parsed, tempFile, originalName, id);
  if (tempDir.exists) {
    tempDir.delete();
  }

  await db.withTransactionAsync(async () => {
    await db.runAsync(
      `INSERT INTO books (id, title, author, format, file_uri, publication_uri, cover_uri, imported_at, last_opened_at, total_chapters)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      stored.id,
      parsed.title,
      parsed.author,
      parsed.format,
      stored.fileUri,
      stored.publicationUri,
      null,
      now,
      null,
      stored.chapters.length,
    );

    await insertChapters(db, stored.id, stored.chapters);
  });

  await showImportProgress(onProgress, {
    title: "完成导入",
    detail: "正在刷新书架",
    progress: 1,
  });
  return getBook(db, stored.id);
}

export async function importBook(
  db: SQLiteDatabase,
  onProgress?: ImportBookProgressHandler,
) {
  await showImportProgress(onProgress, {
    title: "选择文件",
    detail: "正在等待系统文件选择器",
    progress: 0.06,
  });
  const result = await File.pickFileAsync({
    mimeTypes: [
      "application/epub+zip",
      "text/plain",
      "text/*",
      "application/octet-stream",
    ],
  });

  if (result.canceled || !result.result) {
    return null;
  }

  const pickedFile = result.result;
  return importBookFile(db, pickedFile, pickedFile.name || "book", onProgress);
}

export async function importBookFromUri(
  db: SQLiteDatabase,
  uri: string,
  onProgress?: ImportBookProgressHandler,
) {
  const file = new File(uri);
  return importBookFile(db, file, file.name || fileNameFromUri(uri, "book"), onProgress);
}

export async function listBooks(db: SQLiteDatabase) {
  const rows = await db.getAllAsync<BookRow>(
    `SELECT b.*,
            p.chapter_id AS progress_chapter_id,
            p.scroll_ratio AS progress_ratio,
            c.title AS current_chapter_title,
            c.chapter_order AS current_chapter_order
       FROM books b
       LEFT JOIN reading_progress p ON p.book_id = b.id
       LEFT JOIN chapters c ON c.id = p.chapter_id
      ORDER BY COALESCE(b.last_opened_at, b.imported_at) DESC`,
  );

  return rows.map(mapLibraryBook);
}

export async function getBook(db: SQLiteDatabase, id: string) {
  const row = await db.getFirstAsync<BookRow>(
    "SELECT * FROM books WHERE id = ?",
    id,
  );
  return row ? mapBook(row) : null;
}

async function getChapterRows(db: SQLiteDatabase, bookId: string) {
  return db.getAllAsync<ChapterRow>(
    "SELECT * FROM chapters WHERE book_id = ? ORDER BY chapter_order ASC",
    bookId,
  );
}

async function getChapterSummaryRows(db: SQLiteDatabase, bookId: string) {
  return db.getAllAsync<ChapterRow>(
    `SELECT id,
            book_id,
            href,
            title,
            chapter_order,
            '' AS text_content,
            length(text_content) AS text_length,
            word_count
       FROM chapters
      WHERE book_id = ?
      ORDER BY chapter_order ASC`,
    bookId,
  );
}

export async function getChapters(db: SQLiteDatabase, bookId: string) {
  const rows = await getChapterRows(db, bookId);
  return rows.map(mapChapter);
}

export async function getChapter(
  db: SQLiteDatabase,
  bookId: string,
  chapterId: string,
) {
  const row = await db.getFirstAsync<ChapterRow>(
    "SELECT * FROM chapters WHERE book_id = ? AND id = ?",
    bookId,
    chapterId,
  );
  if (!row) {
    return null;
  }
  if (!hasDecodeDamage(row.title) && !hasDecodeDamage(row.text_content)) {
    return mapChapter(row);
  }

  const book = await getBook(db, bookId);
  if (!book) {
    return mapChapter(row);
  }
  const refreshed = await refreshDecodedChaptersIfNeeded(db, book, await getChapterRows(db, bookId));
  if (!refreshed.refreshed) {
    return mapChapter(row);
  }

  const nextRow = await db.getFirstAsync<ChapterRow>(
    "SELECT * FROM chapters WHERE book_id = ? AND id = ?",
    bookId,
    chapterId,
  );
  return nextRow ? mapChapter(nextRow) : mapChapter(row);
}

function fileNameFromUri(uri: string, fallback: string) {
  const rawPath = uri.split(/[?#]/)[0];
  const name = safeDecodeURIComponent(rawPath).split("/").pop();
  return name || fallback;
}

function remapProgressAfterSplit(
  progress: { chapter_id: string; scroll_ratio: number } | null,
  existingRows: ChapterRow[],
  chapters: StoredChapter[],
) {
  if (!progress) {
    return null;
  }

  const existing = existingRows.find((row) => row.id === progress.chapter_id);
  if (!existing) {
    return chapters.some((chapter) => chapter.id === progress.chapter_id)
      ? { chapterId: progress.chapter_id, ratio: progress.scroll_ratio }
      : null;
  }

  const splitMatch = existing.href.match(/^(.*)#chunk-(\d+)$/);
  const baseHref = splitMatch?.[1] ?? existing.href;
  const parts = chapters.filter(
    (chapter) =>
      chapter.href === baseHref ||
      chapter.href.startsWith(`${baseHref}#chunk-`),
  );
  if (!parts.length) {
    const sameOrder = chapters.find((chapter) => chapter.order === existing.chapter_order);
    return sameOrder ? { chapterId: sameOrder.id, ratio: progress.scroll_ratio } : null;
  }

  if (splitMatch) {
    const partIndex = Number(splitMatch[2]) - 1;
    const part = Number.isFinite(partIndex) ? parts[partIndex] : undefined;
    return part ? { chapterId: part.id, ratio: progress.scroll_ratio } : null;
  }

  const sourceLength = Math.max(1, existing.text_length ?? existing.text_content.length);
  let offset = sourceLength * Math.max(0, Math.min(1, progress.scroll_ratio));
  for (const part of parts) {
    if (offset <= part.text.length) {
      return { chapterId: part.id, ratio: Math.max(0, Math.min(0.96, offset / Math.max(1, part.text.length))) };
    }
    offset -= part.text.length;
  }

  return { chapterId: parts[parts.length - 1].id, ratio: 0.96 };
}

function safeDecodeURIComponent(value: string) {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

async function replaceBookContents(
  db: SQLiteDatabase,
  book: Book,
  parsed: ParsedBook,
) {
  const bookDir = new Directory(readerDirectory, book.id);
  bookDir.create({ idempotent: true, intermediates: true });
  const existingRows = await getChapterRows(db, book.id);
  const chapters = writeParsedChapters(parsed, book.id, existingRows);
  const publicationUri = writeReadiumPublication(parsed, bookDir, book.id, book.fileUri);
  const nextProgress = remapProgressAfterSplit(await getProgress(db, book.id), existingRows, chapters);

  await db.withTransactionAsync(async () => {
    await db.runAsync("DELETE FROM search_index WHERE book_id = ?", book.id);
    await db.runAsync("DELETE FROM chapters WHERE book_id = ?", book.id);
    await db.runAsync(
      `UPDATE books
          SET title = ?, author = ?, format = ?, publication_uri = ?, total_chapters = ?
        WHERE id = ?`,
      parsed.title,
      parsed.author,
      parsed.format,
      publicationUri,
      chapters.length,
      book.id,
    );
    await insertChapters(db, book.id, chapters);
    if (nextProgress) {
      await saveProgress(db, book.id, nextProgress.chapterId, nextProgress.ratio);
    }
  });
}

async function refreshDecodedChaptersIfNeeded(
  db: SQLiteDatabase,
  book: Book,
  rows: ChapterRow[],
) {
  const needsPublicationVersionRefresh = await needsInternalPublicationVersionRefresh(book);
  const hasOversizedChapter = rows.some((row) => (row.text_length ?? row.text_content.length) > MAX_READER_CHAPTER_CHARS);
  if (
    !needsTxtReadiumRefresh(book, rows) &&
    !needsPublicationVersionRefresh &&
    !hasOversizedChapter &&
    !rows.some((row) => hasDecodeDamage(row.title) || hasDecodeDamage(row.text_content))
  ) {
    return { chapters: rows.map(mapChapter), refreshed: false };
  }

  try {
    const source = new File(book.fileUri);
    const bytes = await source.bytes();
    const fallbackName = fileNameFromUri(book.fileUri, `${book.title}.${book.format}`);
    const parsed = splitLongChapters(
      book.format === "epub"
        ? parseEpub(bytes, fallbackName)
        : parseTxt(bytes, fallbackName),
    );
    await replaceBookContents(db, book, parsed);
    return { chapters: (await getChapterRows(db, book.id)).map(mapChapter), refreshed: true };
  } catch {
    return { chapters: rows.map(mapChapter), refreshed: false };
  }
}

export async function getProgress(db: SQLiteDatabase, bookId: string) {
  return db.getFirstAsync<{
    book_id: string;
    chapter_id: string;
    scroll_ratio: number;
    updated_at: string;
  }>("SELECT * FROM reading_progress WHERE book_id = ?", bookId);
}

export async function openBook(db: SQLiteDatabase, bookId: string) {
  await db.runAsync(
    "UPDATE books SET last_opened_at = ? WHERE id = ?",
    new Date().toISOString(),
    bookId,
  );
  const book = await getBook(db, bookId);
  let rows = await getChapterSummaryRows(db, bookId);
  const decoded = book
    ? await refreshDecodedChaptersIfNeeded(db, book, rows)
    : { chapters: rows.map(mapChapter), refreshed: false };
  if (decoded.refreshed) {
    rows = await getChapterSummaryRows(db, bookId);
  }
  const openedBook = decoded.refreshed ? await getBook(db, bookId) : book;
  const progress = await getProgress(db, bookId);
  return { book: openedBook, chapters: rows.map(mapChapter), progress };
}

export async function saveProgress(
  db: SQLiteDatabase,
  bookId: string,
  chapterId: string,
  scrollRatio: number,
) {
  const now = new Date().toISOString();
  await db.runAsync(
    `INSERT INTO reading_progress (book_id, chapter_id, scroll_ratio, updated_at)
     VALUES (?, ?, ?, ?)
     ON CONFLICT(book_id) DO UPDATE SET
       chapter_id = excluded.chapter_id,
       scroll_ratio = excluded.scroll_ratio,
       updated_at = excluded.updated_at`,
    bookId,
    chapterId,
    Math.max(0, Math.min(1, scrollRatio)),
    now,
  );
  await db.runAsync(
    "UPDATE books SET last_opened_at = ? WHERE id = ?",
    now,
    bookId,
  );
}

export async function searchBook(
  db: SQLiteDatabase,
  bookId: string,
  query: string,
): Promise<SearchResult[]> {
  const trimmed = query.trim().toLowerCase();
  if (!trimmed) {
    return [];
  }

  const rows = await db.getAllAsync<{
    chapter_id: string;
    chapter_title: string;
    content: string;
  }>(
    `SELECT chapter_id, chapter_title, content
       FROM search_index
      WHERE book_id = ? AND lower(content) LIKE ?
      ORDER BY chapter_title ASC
      LIMIT 40`,
    bookId,
    `%${trimmed}%`,
  );

  return rows.map((row) => {
    const offset = row.content.toLowerCase().indexOf(trimmed);
    return {
      chapterId: row.chapter_id,
      chapterTitle: row.chapter_title,
      excerpt: excerptAround(row.content, Math.max(0, offset), trimmed.length),
      matchOffset: offset,
    };
  });
}

export async function listAnnotations(db: SQLiteDatabase, bookId: string) {
  const rows = await db.getAllAsync<AnnotationRow>(
    "SELECT * FROM annotations WHERE book_id = ? ORDER BY updated_at DESC",
    bookId,
  );
  return rows.map(mapAnnotation);
}

export async function createAnnotation(
  db: SQLiteDatabase,
  input: {
    bookId: string;
    chapterId: string;
    type: AnnotationType;
    selectedText?: string | null;
    noteText?: string | null;
    color?: string | null;
    position?: string;
  },
) {
  const now = new Date().toISOString();
  const id = makeId(input.type);

  await db.runAsync(
    `INSERT INTO annotations (id, book_id, chapter_id, type, selected_text, note_text, color, position, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    id,
    input.bookId,
    input.chapterId,
    input.type,
    input.selectedText ?? null,
    input.noteText ?? null,
    input.color ?? null,
    input.position ?? JSON.stringify({ chapterId: input.chapterId }),
    now,
    now,
  );

  return id;
}

export async function deleteAnnotation(db: SQLiteDatabase, id: string) {
  await db.runAsync("DELETE FROM annotations WHERE id = ?", id);
}

export async function getReaderPreferences(
  db: SQLiteDatabase,
): Promise<ReaderPreferences> {
  const row = await db.getFirstAsync<{
    theme: string;
    app_theme_mode: string | null;
    reader_theme: string | null;
    font_family: string | null;
    font_size: number;
    line_height: number;
    margin: number;
    reading_mode: string | null;
  }>(
    "SELECT theme, app_theme_mode, reader_theme, font_family, font_size, line_height, margin, reading_mode FROM reader_preferences WHERE id = ?",
    "default",
  );

  return {
    appThemeMode: normalizeAppThemeMode(row?.app_theme_mode ?? row?.theme),
    readerTheme: normalizeReaderTheme(row?.reader_theme ?? row?.theme),
    fontFamily: normalizeReaderFontFamily(row?.font_family),
    fontSize: row?.font_size ?? 19,
    lineHeight: row?.line_height ?? 1.7,
    margin: row?.margin ?? 22,
    readingMode: normalizeReadingMode(row?.reading_mode),
  };
}

export async function updateReaderPreferences(
  db: SQLiteDatabase,
  preferences: ReaderPreferences,
) {
  await db.runAsync(
    `INSERT INTO reader_preferences (id, theme, app_theme_mode, reader_theme, font_family, font_size, line_height, margin, reading_mode)
     VALUES ('default', ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET
       theme = excluded.theme,
       app_theme_mode = excluded.app_theme_mode,
       reader_theme = excluded.reader_theme,
       font_family = excluded.font_family,
       font_size = excluded.font_size,
       line_height = excluded.line_height,
       margin = excluded.margin,
       reading_mode = excluded.reading_mode`,
    preferences.appThemeMode === "deep" ? "deep" : "mist",
    preferences.appThemeMode,
    preferences.readerTheme,
    preferences.fontFamily,
    preferences.fontSize,
    preferences.lineHeight,
    preferences.margin,
    preferences.readingMode,
  );
}

export async function deleteBooks(db: SQLiteDatabase, bookIds: string[]) {
  const ids = Array.from(new Set(bookIds)).filter(Boolean);
  if (ids.length === 0) {
    return;
  }

  const placeholders = ids.map(() => "?").join(", ");
  await db.withTransactionAsync(async () => {
    await db.runAsync(`DELETE FROM annotations WHERE book_id IN (${placeholders})`, ...ids);
    await db.runAsync(`DELETE FROM search_index WHERE book_id IN (${placeholders})`, ...ids);
    await db.runAsync(`DELETE FROM reading_progress WHERE book_id IN (${placeholders})`, ...ids);
    await db.runAsync(`DELETE FROM chapters WHERE book_id IN (${placeholders})`, ...ids);
    await db.runAsync(`DELETE FROM books WHERE id IN (${placeholders})`, ...ids);
  });

  for (const bookId of ids) {
    const bookDir = new Directory(readerDirectory, bookId);
    if (bookDir.exists) {
      bookDir.delete();
    }
  }
}

export async function deleteBook(db: SQLiteDatabase, bookId: string) {
  await deleteBooks(db, [bookId]);
}
