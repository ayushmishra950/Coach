/**
 * Page-based pagination used by every list API: at most PAGE_SIZE rows per request.
 *
 *   GET /api/students?page=2          → { items, page: 2, limit: 20, total: 134, pages: 7 }
 *
 * Lists are always sorted on a unique tie-breaker (_id) so rows never repeat or go missing
 * between pages.
 */
export const PAGE_SIZE = 20;

export interface PageParams {
  page: number;
  limit: number;
  skip: number;
}

export function pageParams(query: Record<string, unknown>): PageParams {
  const page = Math.max(1, Math.floor(Number(query.page)) || 1);
  const limit = Math.max(1, Math.min(PAGE_SIZE, Math.floor(Number(query.limit)) || PAGE_SIZE));
  return { page, limit, skip: (page - 1) * limit };
}

export interface Paged<T> {
  items: T[];
  page: number;
  limit: number;
  total: number;
  pages: number;
}

export function paged<T>(items: T[], total: number, p: PageParams): Paged<T> {
  return { items, page: p.page, limit: p.limit, total, pages: Math.max(1, Math.ceil(total / p.limit)) };
}

/** Pages an array that had to be computed in memory (e.g. sorted by a calculated field). */
export function pageArray<T>(all: T[], p: PageParams): Paged<T> {
  return paged(all.slice(p.skip, p.skip + p.limit), all.length, p);
}
