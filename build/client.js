import { API_KEY, CONVERSATIONS_BASE_URL, INTEGRATIONS_BASE_URL, REST_BASE_URL } from "./auth.js";
export class MessageBirdApiError extends Error {
    status;
    constructor(status, message) {
        super(message);
        this.status = status;
        this.name = "MessageBirdApiError";
    }
}
function getBaseUrl(target) {
    switch (target) {
        case "conversations":
            return CONVERSATIONS_BASE_URL;
        case "integrations":
            return INTEGRATIONS_BASE_URL;
        case "rest":
            return REST_BASE_URL;
    }
}
export async function apiRequest(endpoint, method = "GET", body, queryParams, target = "conversations") {
    let url = `${getBaseUrl(target)}${endpoint}`;
    if (queryParams) {
        const params = new URLSearchParams();
        for (const [key, value] of Object.entries(queryParams)) {
            if (value !== undefined && value !== "") {
                params.set(key, value);
            }
        }
        const qs = params.toString();
        if (qs)
            url += `?${qs}`;
    }
    const response = await fetch(url, {
        method,
        headers: {
            Authorization: `AccessKey ${API_KEY}`,
            Accept: "application/json",
            ...(body ? { "Content-Type": "application/json" } : {}),
        },
        body: body ? JSON.stringify(body) : undefined,
    });
    if (response.status === 204) {
        return {};
    }
    if (!response.ok) {
        const error = await response.json().catch(() => ({}));
        const errors = error.errors;
        const msg = errors?.[0]?.description || response.statusText;
        if (response.status === 429) {
            throw new MessageBirdApiError(429, "Rate limit exceeded. Try again in a moment.");
        }
        throw new MessageBirdApiError(response.status, `MessageBird API error (${response.status}): ${msg}`);
    }
    return (await response.json());
}
export function toolResult(data) {
    return {
        content: [
            { type: "text", text: JSON.stringify(data, null, 2) },
        ],
    };
}
export function toolError(message) {
    return {
        isError: true,
        content: [{ type: "text", text: message }],
    };
}
