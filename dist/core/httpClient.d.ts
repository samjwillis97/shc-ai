export interface HttpResponse {
    status: number;
    statusText: string;
    headers: Record<string, string>;
    body: string;
    url: string;
    method: string;
}
export interface HttpError {
    message: string;
    status?: number;
    statusText?: string;
    isNetworkError: boolean;
}
export declare class HttpClient {
    makeRequest(url: string, method?: string): Promise<HttpResponse>;
}
