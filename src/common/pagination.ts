import { PaginationQueryDto } from './dto/pagination-query.dto';

export interface PaginatedResponse<T> {
  data: T[];
  meta: {
    page: number;
    size: number;
    total: number;
    totalPages: number;
  };
}

export function getPagination(query: PaginationQueryDto) {
  const page = query.page ?? 1;
  const size = query.size ?? 20;

  return {
    page,
    size,
    skip: (page - 1) * size,
    take: size,
  };
}

export function toPaginatedResponse<T>(
  data: T[],
  total: number,
  page: number,
  size: number,
): PaginatedResponse<T> {
  return {
    data,
    meta: {
      page,
      size,
      total,
      totalPages: Math.ceil(total / size),
    },
  };
}
