import { cleanChapterTitle } from '@/lib/text-utils';
import type { LibraryBook } from '@/types/reader';

export function authorLabel(author: string) {
  return author === 'Local file' ? '本地文件' : author;
}

export function bookTitleLabel(book: Pick<LibraryBook, 'title'>) {
  return cleanChapterTitle(book.title, book.title || '未命名书籍');
}

export function chapterLabel(title?: string | null) {
  return cleanChapterTitle(title, '阅读中')
    .replace(/^Part\s+(\d+)$/i, '第 $1 部分')
    .replace(/^Chapter\s+(\d+)$/i, '第 $1 章');
}

export function hasReadingProgress(book: LibraryBook) {
  return Boolean(book.progressChapterId);
}

export function bookProgressPercent(book: LibraryBook) {
  if (!hasReadingProgress(book)) {
    return null;
  }
  const chapterOrder = Math.max(0, book.currentChapterOrder ?? 0);
  const chapterRatio = Math.max(0, Math.min(1, book.progressRatio ?? 0));
  const totalChapters = Math.max(1, book.totalChapters);
  return Math.max(0, Math.min(100, Math.round(((chapterOrder + chapterRatio) / totalChapters) * 100)));
}

export function progressLabel(book: LibraryBook) {
  if (!hasReadingProgress(book)) {
    return '未开始';
  }
  const percent = bookProgressPercent(book) ?? 0;
  if (percent === 0) {
    return `已打开 · ${chapterLabel(book.currentChapterTitle)}`;
  }
  return `${percent}% · ${chapterLabel(book.currentChapterTitle)}`;
}

export function statusLabel(book: LibraryBook) {
  return hasReadingProgress(book) ? '继续' : '打开';
}
