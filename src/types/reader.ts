export type BookFormat = 'epub' | 'txt';

export type AnnotationType = 'bookmark' | 'highlight' | 'note';

export type AppThemeMode = 'system' | 'mist' | 'deep';

export type ResolvedAppTheme = 'mist' | 'deep';

export type ReaderTheme = 'paper' | 'sepia' | 'night' | 'eink';

export type ReadingMode = 'scroll' | 'page';

export type Book = {
  id: string;
  title: string;
  author: string;
  format: BookFormat;
  fileUri: string;
  coverUri?: string | null;
  importedAt: string;
  lastOpenedAt?: string | null;
  totalChapters: number;
};

export type Chapter = {
  id: string;
  bookId: string;
  href: string;
  title: string;
  order: number;
  htmlPath?: string | null;
  textContent: string;
  wordCount: number;
};

export type ReadingProgress = {
  bookId: string;
  chapterId: string;
  scrollRatio: number;
  updatedAt: string;
};

export type Annotation = {
  id: string;
  bookId: string;
  chapterId: string;
  type: AnnotationType;
  selectedText?: string | null;
  noteText?: string | null;
  color?: string | null;
  position: string;
  createdAt: string;
  updatedAt: string;
};

export type ReaderPreferences = {
  appThemeMode: AppThemeMode;
  readerTheme: ReaderTheme;
  fontSize: number;
  lineHeight: number;
  margin: number;
  readingMode: ReadingMode;
};

export type LibraryBook = Book & {
  progressChapterId?: string | null;
  progressRatio?: number | null;
  currentChapterTitle?: string | null;
  currentChapterOrder?: number | null;
};

export type SearchResult = {
  chapterId: string;
  chapterTitle: string;
  excerpt: string;
  matchOffset: number;
};
