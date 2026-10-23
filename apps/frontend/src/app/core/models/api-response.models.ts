export interface SuccessResponse {
    ok: true;
}
export interface ConnectedRepositoryResponse extends SuccessResponse {
    id: string;
}
export interface ApiErrorResponse {
    statusCode: number;
    code: string;
    message: string | string[];
    requestId: string;
    timestamp: string;
}
export interface EventFilters {
    repoId?: string;
    type?: string;
    status?: string;
    before?: string;
}
