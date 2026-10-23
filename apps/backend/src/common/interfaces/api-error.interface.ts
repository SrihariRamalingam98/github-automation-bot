export interface ApiErrorResponse {
    statusCode: number;
    code: string;
    message: string | string[];
    requestId: string;
    timestamp: string;
}
