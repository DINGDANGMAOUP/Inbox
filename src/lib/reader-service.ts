import { Directory, File, Paths } from 'expo-file-system';
import type { SQLiteDatabase } from 'expo-sqlite';

import { parseEpub, type ParsedBook } from '@/lib/epub-parser';
import { cleanChapterTitle, excerptAround, hashBytes, makeId, safeFileName, splitTxtIntoChapters, wordCount } from '@/lib/text-utils';
import type {
  Annotation,
  AnnotationType,
  Book,
  Chapter,
  LibraryBook,
  ReaderPreferences,
  SearchResult,
} from '@/types/reader';

type BookRow = {
  id: string;
  title: string;
  author: string;
  format: 'epub' | 'txt';
  file_uri: string;
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
  html_path: string | null;
  text_content: string;
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

const readerDirectory = new Directory(Paths.document, 'inbox-reader');

function normalizeReaderTheme(theme?: string | null): ReaderPreferences['theme'] {
  if (theme === 'mist' || theme === 'deep' || theme === 'reading') {
    return theme;
  }
  if (theme === 'ink') {
    return 'deep';
  }
  if (theme === 'sage') {
    return 'reading';
  }
  return 'mist';
}

function normalizeReadingMode(mode?: string | null): ReaderPreferences['readingMode'] {
  return mode === 'page' ? 'page' : 'scroll';
}

function mapBook(row: BookRow): Book {
  return {
    id: row.id,
    title: row.title,
    author: row.author,
    format: row.format,
    fileUri: row.file_uri,
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
    htmlPath: row.html_path,
    textContent: row.text_content,
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

async function copyPickedFileToPrivateFile(pickedFile: File, originalName: string) {
  ensureReaderDirectory();

  const tempDir = new Directory(readerDirectory, `import-${makeId('tmp')}`);
  tempDir.create({ idempotent: true, intermediates: true });

  const tempFile = new File(tempDir, safeFileName(originalName));
  const bytes = await pickedFile.bytes();
  tempFile.create({ overwrite: true, intermediates: true });
  tempFile.write(bytes);

  return { tempDir, tempFile, bytes };
}

async function writeParsedBookFiles(parsed: ParsedBook, importedFile: File, originalName: string, id: string) {
  const bookDir = new Directory(readerDirectory, id);
  bookDir.create({ idempotent: true, intermediates: true });

  const storedName = safeFileName(originalName);
  const storedFile = new File(bookDir, storedName);
  await importedFile.copy(storedFile, { overwrite: true });

  const chapters = parsed.chapters.map((chapter, index) => {
    const htmlPath = parsed.format === 'epub' ? new File(bookDir, `chapter-${String(index + 1).padStart(4, '0')}.html`) : null;

    if (htmlPath) {
      htmlPath.create({ overwrite: true, intermediates: true });
      htmlPath.write(chapter.html);
    }

    return {
      ...chapter,
      id: `${id}_${chapter.id}`,
      htmlPath: htmlPath?.uri ?? null,
    };
  });

  return {
    id,
    fileUri: storedFile.uri,
    chapters,
  };
}

async function parseTxt(source: File, fallbackName: string): Promise<ParsedBook> {
  const text = await source.text();
  const fallbackTitle = fallbackName.replace(/\.(txt|text)$/i, '').trim();
  const firstTextTitle = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .find(Boolean);
  const titleLooksLikeProviderId = /^(msf|raw|document):?\d+$/i.test(fallbackTitle) || !/[a-z0-9\u4e00-\u9fff]/i.test(fallbackTitle);
  const normalizedFirstTitle = cleanChapterTitle(firstTextTitle, '');
  const title = titleLooksLikeProviderId && normalizedFirstTitle ? normalizedFirstTitle.slice(0, 80) : fallbackTitle || '未命名文本';
  const chapters = splitTxtIntoChapters(text).map((chapter, index) => ({
    id: makeId('chapter'),
    href: `txt:${index}`,
    title: chapter.title,
    order: index,
    html: '',
    text: chapter.text,
    wordCount: wordCount(chapter.text),
  }));

  return {
    title,
    author: '本地文件',
    format: 'txt',
    chapters,
  };
}

export async function importBook(db: SQLiteDatabase) {
  const result = await File.pickFileAsync({
    mimeTypes: ['application/epub+zip', 'text/plain', 'text/*', 'application/octet-stream'],
  });

  if (result.canceled || !result.result) {
    return null;
  }

  const pickedFile = result.result;
  const originalName = pickedFile.name || 'book';
  const extension = originalName.split('.').pop()?.toLowerCase();
  const mimeType = pickedFile.type.toLowerCase();
  const inferredFormat =
    extension === 'epub' || mimeType === 'application/epub+zip'
      ? 'epub'
      : extension === 'txt' || mimeType.startsWith('text/')
        ? 'txt'
        : null;

  if (!inferredFormat) {
    throw new Error('当前版本仅支持 EPUB 和 TXT 文件。');
  }

  const { tempDir, tempFile, bytes } = await copyPickedFileToPrivateFile(pickedFile, originalName);
  const contentHash = hashBytes(bytes);
  const id = `book_${contentHash}`;
  const parsed = inferredFormat === 'epub' ? parseEpub(bytes, originalName) : await parseTxt(tempFile, originalName);
  const now = new Date().toISOString();

  const existing = await db.getFirstAsync<{ id: string }>(
    'SELECT id FROM books WHERE id = ? OR id LIKE ? ORDER BY imported_at ASC LIMIT 1',
    id,
    `${id}_%`
  );
  if (existing) {
    if (tempDir.exists) {
      tempDir.delete();
    }
    return getBook(db, existing.id);
  }

  const stored = await writeParsedBookFiles(parsed, tempFile, originalName, id);
  if (tempDir.exists) {
    tempDir.delete();
  }

  await db.withTransactionAsync(async () => {
    await db.runAsync(
      `INSERT INTO books (id, title, author, format, file_uri, cover_uri, imported_at, last_opened_at, total_chapters)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      stored.id,
      parsed.title,
      parsed.author,
      parsed.format,
      stored.fileUri,
      null,
      now,
      null,
      stored.chapters.length
    );

    for (const chapter of stored.chapters) {
      await db.runAsync(
        `INSERT INTO chapters (id, book_id, href, title, chapter_order, html_path, text_content, word_count)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        chapter.id,
        stored.id,
        chapter.href,
        chapter.title,
        chapter.order,
        chapter.htmlPath,
        chapter.text,
        chapter.wordCount
      );

      await db.runAsync(
        `INSERT INTO search_index (book_id, chapter_id, chapter_title, content)
         VALUES (?, ?, ?, ?)`,
        stored.id,
        chapter.id,
        chapter.title,
        chapter.text
      );
    }
  });

  return getBook(db, stored.id);
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
      ORDER BY COALESCE(b.last_opened_at, b.imported_at) DESC`
  );

  return rows.map(mapLibraryBook);
}

export async function getBook(db: SQLiteDatabase, id: string) {
  const row = await db.getFirstAsync<BookRow>('SELECT * FROM books WHERE id = ?', id);
  return row ? mapBook(row) : null;
}

export async function getChapters(db: SQLiteDatabase, bookId: string) {
  const rows = await db.getAllAsync<ChapterRow>(
    'SELECT * FROM chapters WHERE book_id = ? ORDER BY chapter_order ASC',
    bookId
  );
  return rows.map(mapChapter);
}

export async function getProgress(db: SQLiteDatabase, bookId: string) {
  return db.getFirstAsync<{ book_id: string; chapter_id: string; scroll_ratio: number; updated_at: string }>(
    'SELECT * FROM reading_progress WHERE book_id = ?',
    bookId
  );
}

export async function openBook(db: SQLiteDatabase, bookId: string) {
  await db.runAsync('UPDATE books SET last_opened_at = ? WHERE id = ?', new Date().toISOString(), bookId);
  const book = await getBook(db, bookId);
  const chapters = await getChapters(db, bookId);
  const progress = await getProgress(db, bookId);
  return { book, chapters, progress };
}

export async function saveProgress(db: SQLiteDatabase, bookId: string, chapterId: string, scrollRatio: number) {
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
    now
  );
  await db.runAsync('UPDATE books SET last_opened_at = ? WHERE id = ?', now, bookId);
}

export async function searchBook(db: SQLiteDatabase, bookId: string, query: string): Promise<SearchResult[]> {
  const trimmed = query.trim().toLowerCase();
  if (!trimmed) {
    return [];
  }

  const rows = await db.getAllAsync<{ chapter_id: string; chapter_title: string; content: string }>(
    `SELECT chapter_id, chapter_title, content
       FROM search_index
      WHERE book_id = ? AND lower(content) LIKE ?
      ORDER BY chapter_title ASC
      LIMIT 40`,
    bookId,
    `%${trimmed}%`
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
    'SELECT * FROM annotations WHERE book_id = ? ORDER BY updated_at DESC',
    bookId
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
  }
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
    now
  );

  return id;
}

export async function deleteAnnotation(db: SQLiteDatabase, id: string) {
  await db.runAsync('DELETE FROM annotations WHERE id = ?', id);
}

export async function getReaderPreferences(db: SQLiteDatabase): Promise<ReaderPreferences> {
  const row = await db.getFirstAsync<{
    theme: string;
    font_size: number;
    line_height: number;
    margin: number;
    reading_mode: string | null;
  }>('SELECT theme, font_size, line_height, margin, reading_mode FROM reader_preferences WHERE id = ?', 'default');

  return {
    theme: normalizeReaderTheme(row?.theme),
    fontSize: row?.font_size ?? 19,
    lineHeight: row?.line_height ?? 1.7,
    margin: row?.margin ?? 22,
    readingMode: normalizeReadingMode(row?.reading_mode),
  };
}

export async function updateReaderPreferences(db: SQLiteDatabase, preferences: ReaderPreferences) {
  await db.runAsync(
    `INSERT INTO reader_preferences (id, theme, font_size, line_height, margin, reading_mode)
     VALUES ('default', ?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET
       theme = excluded.theme,
       font_size = excluded.font_size,
       line_height = excluded.line_height,
       margin = excluded.margin,
       reading_mode = excluded.reading_mode`,
    preferences.theme,
    preferences.fontSize,
    preferences.lineHeight,
    preferences.margin,
    preferences.readingMode
  );
}

export async function deleteBook(db: SQLiteDatabase, bookId: string) {
  await db.withTransactionAsync(async () => {
    await db.runAsync('DELETE FROM annotations WHERE book_id = ?', bookId);
    await db.runAsync('DELETE FROM search_index WHERE book_id = ?', bookId);
    await db.runAsync('DELETE FROM reading_progress WHERE book_id = ?', bookId);
    await db.runAsync('DELETE FROM chapters WHERE book_id = ?', bookId);
    await db.runAsync('DELETE FROM books WHERE id = ?', bookId);
  });

  const bookDir = new Directory(readerDirectory, bookId);
  if (bookDir.exists) {
    bookDir.delete();
  }
}
