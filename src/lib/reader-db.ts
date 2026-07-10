import type { SQLiteDatabase } from 'expo-sqlite';

const DATABASE_VERSION = 9;

export async function migrateReaderDb(db: SQLiteDatabase) {
  const row = await db.getFirstAsync<{ user_version: number }>('PRAGMA user_version');
  const currentVersion = row?.user_version ?? 0;

  if (currentVersion > DATABASE_VERSION) {
    return;
  }

  await db.execAsync(`
    PRAGMA journal_mode = 'wal';
    PRAGMA foreign_keys = ON;

    CREATE TABLE IF NOT EXISTS books (
      id TEXT PRIMARY KEY NOT NULL,
      title TEXT NOT NULL,
      author TEXT NOT NULL,
      format TEXT NOT NULL,
      file_uri TEXT NOT NULL,
      publication_uri TEXT,
      cover_uri TEXT,
      imported_at TEXT NOT NULL,
      last_opened_at TEXT,
      total_chapters INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS chapters (
      id TEXT PRIMARY KEY NOT NULL,
      book_id TEXT NOT NULL,
      href TEXT NOT NULL,
      title TEXT NOT NULL,
      chapter_order INTEGER NOT NULL,
      text_content TEXT NOT NULL,
      word_count INTEGER NOT NULL,
      FOREIGN KEY (book_id) REFERENCES books(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_chapters_book_order
      ON chapters(book_id, chapter_order);

    CREATE TABLE IF NOT EXISTS reading_progress (
      book_id TEXT PRIMARY KEY NOT NULL,
      chapter_id TEXT NOT NULL,
      scroll_ratio REAL NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY (book_id) REFERENCES books(id) ON DELETE CASCADE,
      FOREIGN KEY (chapter_id) REFERENCES chapters(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS annotations (
      id TEXT PRIMARY KEY NOT NULL,
      book_id TEXT NOT NULL,
      chapter_id TEXT NOT NULL,
      type TEXT NOT NULL,
      selected_text TEXT,
      note_text TEXT,
      color TEXT,
      position TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY (book_id) REFERENCES books(id) ON DELETE CASCADE,
      FOREIGN KEY (chapter_id) REFERENCES chapters(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_annotations_book_chapter
      ON annotations(book_id, chapter_id);

    CREATE TABLE IF NOT EXISTS search_index (
      book_id TEXT NOT NULL,
      chapter_id TEXT NOT NULL,
      chapter_title TEXT NOT NULL,
      content TEXT NOT NULL,
      PRIMARY KEY (book_id, chapter_id),
      FOREIGN KEY (book_id) REFERENCES books(id) ON DELETE CASCADE,
      FOREIGN KEY (chapter_id) REFERENCES chapters(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS reader_preferences (
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
  `);

  if (currentVersion < 2) {
    await db.execAsync(`
      DELETE FROM reading_progress
       WHERE book_id IN (
        SELECT b.id
          FROM books b
          JOIN reading_progress p ON p.book_id = b.id
         WHERE p.scroll_ratio = 0
           AND p.updated_at = b.imported_at
           AND b.last_opened_at = b.imported_at
       );

      UPDATE books
         SET last_opened_at = NULL
       WHERE last_opened_at = imported_at
         AND id NOT IN (SELECT book_id FROM reading_progress);
    `);
  }

  const bookColumns = await db.getAllAsync<{ name: string }>('PRAGMA table_info(books)');
  if (!bookColumns.some((column) => column.name === 'publication_uri')) {
    await db.execAsync('ALTER TABLE books ADD COLUMN publication_uri TEXT;');
  }

  const preferenceColumns = await db.getAllAsync<{ name: string }>('PRAGMA table_info(reader_preferences)');
  if (!preferenceColumns.some((column) => column.name === 'reading_mode')) {
    await db.execAsync(`ALTER TABLE reader_preferences ADD COLUMN reading_mode TEXT NOT NULL DEFAULT 'scroll';`);
  }
  if (!preferenceColumns.some((column) => column.name === 'app_theme_mode')) {
    await db.execAsync(`ALTER TABLE reader_preferences ADD COLUMN app_theme_mode TEXT NOT NULL DEFAULT 'system';`);
    await db.execAsync(`
      UPDATE reader_preferences
         SET app_theme_mode = CASE
           WHEN theme = 'deep' THEN 'deep'
           WHEN theme IN ('mist', 'reading') THEN 'mist'
           ELSE 'system'
         END;
    `);
  }
  if (!preferenceColumns.some((column) => column.name === 'reader_theme')) {
    await db.execAsync(`ALTER TABLE reader_preferences ADD COLUMN reader_theme TEXT NOT NULL DEFAULT 'paper';`);
    await db.execAsync(`
      UPDATE reader_preferences
         SET reader_theme = CASE
           WHEN theme = 'deep' THEN 'night'
           ELSE 'paper'
         END;
    `);
  }
  if (!preferenceColumns.some((column) => column.name === 'font_family')) {
    await db.execAsync(`ALTER TABLE reader_preferences ADD COLUMN font_family TEXT NOT NULL DEFAULT 'system';`);
  }

  await db.runAsync(
    `INSERT OR IGNORE INTO reader_preferences (id, theme, app_theme_mode, reader_theme, font_family, font_size, line_height, margin, reading_mode)
     VALUES ('default', 'mist', 'system', 'paper', 'system', 19, 1.7, 22, 'scroll')`
  );

  await db.execAsync(`PRAGMA user_version = ${DATABASE_VERSION}`);
}
