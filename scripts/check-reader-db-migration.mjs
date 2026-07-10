import { Database } from 'bun:sqlite';

import { migrateReaderDb } from '../src/lib/reader-db';

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

const sqlite = new Database(':memory:');
const db = {
  getFirstAsync: async (sql, ...params) => sqlite.query(sql).get(...params),
  getAllAsync: async (sql, ...params) => sqlite.query(sql).all(...params),
  execAsync: async (sql) => sqlite.exec(sql),
  runAsync: async (sql, ...params) => sqlite.query(sql).run(...params),
};

sqlite.exec(`
  PRAGMA user_version = 5;
  CREATE TABLE books (
    id TEXT PRIMARY KEY NOT NULL,
    title TEXT NOT NULL,
    author TEXT NOT NULL,
    format TEXT NOT NULL,
    file_uri TEXT NOT NULL,
    cover_uri TEXT,
    imported_at TEXT NOT NULL,
    last_opened_at TEXT,
    total_chapters INTEGER NOT NULL
  );
  CREATE TABLE chapters (
    id TEXT PRIMARY KEY NOT NULL,
    book_id TEXT NOT NULL,
    href TEXT NOT NULL,
    title TEXT NOT NULL,
    chapter_order INTEGER NOT NULL,
    html_path TEXT,
    text_content TEXT NOT NULL,
    word_count INTEGER NOT NULL
  );
  CREATE TABLE reading_progress (
    book_id TEXT PRIMARY KEY NOT NULL,
    chapter_id TEXT NOT NULL,
    scroll_ratio REAL NOT NULL,
    updated_at TEXT NOT NULL
  );
  CREATE TABLE annotations (
    id TEXT PRIMARY KEY NOT NULL,
    book_id TEXT NOT NULL,
    chapter_id TEXT NOT NULL,
    type TEXT NOT NULL,
    selected_text TEXT,
    note_text TEXT,
    color TEXT,
    position TEXT NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );
  CREATE TABLE search_index (
    book_id TEXT NOT NULL,
    chapter_id TEXT NOT NULL,
    chapter_title TEXT NOT NULL,
    content TEXT NOT NULL,
    PRIMARY KEY (book_id, chapter_id)
  );
  CREATE TABLE reader_preferences (
    id TEXT PRIMARY KEY NOT NULL,
    theme TEXT NOT NULL,
    app_theme_mode TEXT NOT NULL DEFAULT 'system',
    reader_theme TEXT NOT NULL DEFAULT 'paper',
    font_family TEXT NOT NULL DEFAULT 'system',
    font_size INTEGER NOT NULL,
    line_height REAL NOT NULL,
    margin INTEGER NOT NULL,
    reading_mode TEXT NOT NULL DEFAULT 'scroll'
  );
  INSERT INTO books VALUES ('book-1', '测试书', '作者', 'epub', 'file:///book.epub', NULL, '2026-01-01', '2026-01-02', 1);
  INSERT INTO chapters VALUES ('chapter-1', 'book-1', 'chapter.xhtml', '第一章', 0, 'old.html', '正文', 2);
  INSERT INTO reading_progress VALUES ('book-1', 'chapter-1', 0.5, '2026-01-02');
  INSERT INTO annotations VALUES ('note-1', 'book-1', 'chapter-1', 'note', '正文', '笔记', NULL, '{}', '2026-01-02', '2026-01-02');
  INSERT INTO search_index VALUES ('book-1', 'chapter-1', '第一章', '正文');
  INSERT INTO reader_preferences VALUES ('default', 'mist', 'mist', 'paper', 'system', 19, 1.7, 22, 'scroll');
`);

await migrateReaderDb(db);

for (const table of ['books', 'chapters', 'reading_progress', 'annotations', 'search_index', 'reader_preferences']) {
  const row = sqlite.query(`SELECT COUNT(*) AS count FROM ${table}`).get();
  assert(row?.count === 1, `${table} data should survive migration`);
}

const bookColumns = sqlite.query('PRAGMA table_info(books)').all().map((column) => column.name);
assert(bookColumns.includes('publication_uri'), 'legacy books should gain publication_uri');
assert(sqlite.query('PRAGMA user_version').get()?.user_version === 9, 'migration should record schema version 9');

sqlite.close();
console.log('reader db migration ok');
