import { Directory, File, Paths } from "expo-file-system";
import type { SQLiteDatabase } from "expo-sqlite";

const readerDirectory = new Directory(Paths.document, "inbox-reader");

type StorageCountRow = {
  bookCount: number;
  epubCount: number;
  txtCount: number;
  chapterCount: number;
  annotationCount: number;
  progressCount: number;
  searchIndexCount: number;
};

export type StorageOverview = StorageCountRow & {
  totalBytes: number;
  libraryBytes: number;
  databaseBytes: number;
  cacheBytes: number;
  availableDiskBytes: number;
  totalDiskBytes: number;
};

export async function getStorageOverview(db: SQLiteDatabase): Promise<StorageOverview> {
  const counts = await db.getFirstAsync<StorageCountRow>(`
    SELECT
      (SELECT COUNT(*) FROM books) AS bookCount,
      (SELECT COUNT(*) FROM books WHERE format = 'epub') AS epubCount,
      (SELECT COUNT(*) FROM books WHERE format = 'txt') AS txtCount,
      (SELECT COUNT(*) FROM chapters) AS chapterCount,
      (SELECT COUNT(*) FROM annotations) AS annotationCount,
      (SELECT COUNT(*) FROM reading_progress) AS progressCount,
      (SELECT COUNT(*) FROM search_index) AS searchIndexCount
  `);
  const importCacheBytes = importCacheSize();
  const libraryBytes = Math.max(0, directorySize(readerDirectory) - importCacheBytes);
  const databaseBytes = await databaseSize(db);
  const cacheBytes = directorySize(Paths.cache) + importCacheBytes;

  return {
    bookCount: counts?.bookCount ?? 0,
    epubCount: counts?.epubCount ?? 0,
    txtCount: counts?.txtCount ?? 0,
    chapterCount: counts?.chapterCount ?? 0,
    annotationCount: counts?.annotationCount ?? 0,
    progressCount: counts?.progressCount ?? 0,
    searchIndexCount: counts?.searchIndexCount ?? 0,
    totalBytes: libraryBytes + databaseBytes + cacheBytes,
    libraryBytes,
    databaseBytes,
    cacheBytes,
    availableDiskBytes: Paths.availableDiskSpace,
    totalDiskBytes: Paths.totalDiskSpace,
  };
}

export async function clearAppCache() {
  const before = directorySize(Paths.cache) + importCacheSize();
  deleteChildren(Paths.cache);
  deleteImportCache();
  const after = directorySize(Paths.cache) + importCacheSize();
  return { bytesCleared: Math.max(0, before - after) };
}

export async function clearReadingData(db: SQLiteDatabase) {
  const before = await databaseSize(db);
  await db.withTransactionAsync(async () => {
    await db.runAsync("DELETE FROM annotations");
    await db.runAsync("DELETE FROM reading_progress");
    await db.runAsync("UPDATE books SET last_opened_at = NULL");
  });
  await db.execAsync("PRAGMA wal_checkpoint(TRUNCATE); VACUUM;");
  return { bytesCleared: Math.max(0, before - (await databaseSize(db))) };
}

async function databaseSize(db: SQLiteDatabase) {
  const pageCount = await db.getFirstAsync<{ page_count: number }>("PRAGMA page_count");
  const pageSize = await db.getFirstAsync<{ page_size: number }>("PRAGMA page_size");
  return (pageCount?.page_count ?? 0) * (pageSize?.page_size ?? 0);
}

function importCacheSize() {
  return readerChildren()
    .filter((item) => item instanceof Directory && item.name.startsWith("import-"))
    .reduce((sum, item) => sum + entrySize(item), 0);
}

function deleteImportCache() {
  for (const item of readerChildren()) {
    if (item instanceof Directory && item.name.startsWith("import-")) {
      safeDelete(item);
    }
  }
}

function readerChildren() {
  try {
    return readerDirectory.exists ? readerDirectory.list() : [];
  } catch {
    return [];
  }
}

function directorySize(directory: Directory): number {
  try {
    if (!directory.exists) {
      return 0;
    }
    return directory.size ?? directory.list().reduce((sum, item) => sum + entrySize(item), 0);
  } catch {
    return 0;
  }
}

function fileSize(file: File): number {
  try {
    return file.exists ? file.size : 0;
  } catch {
    return 0;
  }
}

function entrySize(entry: Directory | File): number {
  return entry instanceof Directory ? directorySize(entry) : fileSize(entry);
}

function deleteChildren(directory: Directory) {
  try {
    if (!directory.exists) {
      return;
    }
    for (const item of directory.list()) {
      safeDelete(item);
    }
  } catch {
    // best effort cache cleanup
  }
}

function safeDelete(entry: Directory | File) {
  try {
    if (entry.exists) {
      entry.delete();
    }
  } catch {
    // best effort cache cleanup
  }
}
