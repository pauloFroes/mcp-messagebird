export declare class MessageBirdApiError extends Error {
    status: number;
    constructor(status: number, message: string);
}
type ApiTarget = "conversations" | "integrations" | "rest";
export declare function apiRequest<T>(endpoint: string, method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE", body?: Record<string, unknown>, queryParams?: Record<string, string | undefined>, target?: ApiTarget): Promise<T>;
export declare function toolResult(data: unknown): {
    content: {
        type: "text";
        text: string;
    }[];
};
export declare function toolError(message: string): {
    isError: true;
    content: {
        type: "text";
        text: string;
    }[];
};
export {};
