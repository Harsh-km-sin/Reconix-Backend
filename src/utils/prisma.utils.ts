import { Prisma } from "@prisma/client";

export interface QueryOptions {
    page?: number;
    limit?: number;
    sortBy?: string;
    sortOrder?: "asc" | "desc";
    search?: string;
    searchFields?: string[];
    filters?: Record<string, any>;
}

export interface PaginatedResult<T> {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
    data: T[];
}

/**
 * Applies common query filters (pagination, sorting, searching) to a Prisma findMany/count query.
 * @param options Query options from request
 * @param defaultSort Default sorting field
 * @returns Prisma query arguments object
 */
export function applyQueryFilters(options: QueryOptions, defaultSort: string = "createdAt") {
    const {
        page = 1,
        limit = 50,
        sortBy = defaultSort,
        sortOrder = "desc",
        search,
        searchFields = [],
        filters = {},
    } = options;

    const skip = (page - 1) * limit;
    const take = limit;

    const where: any = { ...filters };

    if (search && searchFields.length > 0) {
        where.OR = searchFields.map((field) => ({
            [field]: { contains: search, mode: "insensitive" },
        }));
    }

    const orderBy = { [sortBy]: sortOrder };

    return {
        where,
        orderBy,
        skip,
        take,
    };
}
