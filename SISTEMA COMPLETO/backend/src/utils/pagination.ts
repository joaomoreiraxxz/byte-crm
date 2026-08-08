/**
 * Pagination utilities for both server-side and client-side pagination.
 */

export interface PaginationParams {
  page: number;
  limit: number;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
}

export interface PaginatedResult<T> {
  data: T[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
    hasNext: boolean;
    hasPrev: boolean;
  };
}

/**
 * Parse pagination parameters from query string.
 * Enforces sane defaults and limits.
 */
export function parsePagination(query: {
  page?: string;
  limit?: string;
  sortBy?: string;
  sortOrder?: string;
}): PaginationParams {
  const page = Math.max(1, parseInt(query.page || '1', 10) || 1);
  const limit = Math.min(100, Math.max(1, parseInt(query.limit || '25', 10) || 25));
  const sortOrder = query.sortOrder === 'asc' ? 'asc' : 'desc';

  // Whitelist sortBy against SQL injection — only allow alphanumeric + underscore
  const sortBy = query.sortBy?.match(/^[a-zA-Z_][a-zA-Z0-9_]*$/)
    ? query.sortBy
    : 'created_at';

  return { page, limit, sortBy, sortOrder };
}

/**
 * Calculate SQL OFFSET from page/limit.
 */
export function calcOffset(page: number, limit: number): number {
  return (page - 1) * limit;
}

/**
 * Build a paginated response object.
 */
export function paginatedResponse<T>(
  data: T[],
  total: number,
  params: PaginationParams
): PaginatedResult<T> {
  const totalPages = Math.ceil(total / params.limit);

  return {
    data,
    pagination: {
      page: params.page,
      limit: params.limit,
      total,
      totalPages,
      hasNext: params.page < totalPages,
      hasPrev: params.page > 1,
    },
  };
}

/**
 * Generate SQL ORDER BY clause from pagination params.
 * Safely interpolates column name (already validated by parsePagination).
 */
export function buildOrderBy(params: PaginationParams): string {
  return `ORDER BY "${params.sortBy}" ${params.sortOrder === 'asc' ? 'ASC' : 'DESC'}`;
}
