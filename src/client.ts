import { API_KEY, CONVERSATIONS_BASE_URL, INTEGRATIONS_BASE_URL, REST_BASE_URL } from "./auth.js";

export class MessageBirdApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
    this.name = "MessageBirdApiError";
  }
}

type ApiTarget = "conversations" | "integrations" | "rest";

function getBaseUrl(target: ApiTarget): string {
  switch (target) {
    case "conversations":
      return CONVERSATIONS_BASE_URL;
    case "integrations":
      return INTEGRATIONS_BASE_URL;
    case "rest":
      return REST_BASE_URL;
  }
}

export async function apiRequest<T>(
  endpoint: string,
  method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE" = "GET",
  body?: Record<string, unknown>,
  queryParams?: Record<string, string | undefined>,
  target: ApiTarget = "conversations",
): Promise<T> {
  let url = `${getBaseUrl(target)}${endpoint}`;

  if (queryParams) {
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries(queryParams)) {
      if (value !== undefined && value !== "") {
        params.set(key, value);
      }
    }
    const qs = params.toString();
    if (qs) url += `?${qs}`;
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
    return {} as T;
  }

  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    const errors = (error as Record<string, unknown>).errors as
      | Array<{ description?: string }>
      | undefined;
    const msg = errors?.[0]?.description || response.statusText;

    if (response.status === 429) {
      throw new MessageBirdApiError(
        429,
        "Rate limit exceeded. Try again in a moment.",
      );
    }

    throw new MessageBirdApiError(
      response.status,
      `MessageBird API error (${response.status}): ${msg}`,
    );
  }

  return (await response.json()) as T;
}

export function toolResult(data: unknown) {
  return {
    content: [
      { type: "text" as const, text: JSON.stringify(data, null, 2) },
    ],
  };
}

export function toolError(message: string) {
  return {
    isError: true as const,
    content: [{ type: "text" as const, text: message }],
  };
}
