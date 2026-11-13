/**
 * Page-based pagination used by every list API: at most PAGE_SIZE rows per request.
 *
 *   GET /api/students?page=2          → { items, page: 2, limit: 20, total: 134, pages: 7 }
 *
 * Lists are always sorted on a unique tie-breaker (_id) so rows never repeat or go missing
 * between pages.
 */
export const PAGE_SIZE = 20;
export function pageParams(query) {
    const page = Math.min(100000, Math.max(1, Math.floor(Number(query.page)) || 1));
    const limit = Math.max(1, Math.min(PAGE_SIZE, Math.floor(Number(query.limit)) || PAGE_SIZE));
    return { page, limit, skip: (page - 1) * limit };
}
export function paged(items, total, p) {
    return { items, page: p.page, limit: p.limit, total, pages: Math.max(1, Math.ceil(total / p.limit)) };
}
/** Pages an array that had to be computed in memory (e.g. sorted by a calculated field). */
export function pageArray(all, p) {
    return paged(all.slice(p.skip, p.skip + p.limit), all.length, p);
}
