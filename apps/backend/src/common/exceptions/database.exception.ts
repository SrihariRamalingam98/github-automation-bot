import { QueryFailedError } from 'typeorm';

export class DatabaseError extends Error {
    constructor(
        readonly operation: string,
        readonly code = 'UNKNOWN',
    ) {
        super('Database operation failed');
    }
}
export function databaseCode(error: unknown): string | undefined {
    if (error instanceof QueryFailedError) {
        return (error.driverError as { code?: string }).code || 'UNKNOWN';
    }
    if (
        typeof error === 'object' &&
        error !== null &&
        'code' in error &&
        typeof error.code === 'string' &&
        (/^[0-9A-Z]{5}$/.test(error.code) ||
            ['ECONNREFUSED', 'ECONNRESET', 'ETIMEDOUT', 'ENOTFOUND'].includes(
                error.code,
            ))
    )
        return error.code;
    return undefined;
}
