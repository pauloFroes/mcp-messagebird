import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { apiRequest, toolResult, toolError } from "../client.js";

/** Conversation lifecycle status as defined by Conversations API. */
const CONVERSATION_STATUS = z
  .enum(["active", "archived", "all"])
  .describe(
    "Conversation lifecycle status (Conversations API). " +
      "active = open thread (default), archived = closed/archived, all = both. " +
      "This is NOT Inbox ticket status (pending/assigned) — use waiting_for_reply for that need.",
  );

type ConversationListResponse = {
  count?: number;
  items?: Conversation[];
  limit?: number;
  offset?: number;
  totalCount?: number;
};

type Conversation = {
  id: string;
  status?: string;
  contactId?: string;
  contact?: {
    id?: string;
    msisdn?: number | string | null;
    displayName?: string;
    firstName?: string;
    lastName?: string;
  };
  lastReceivedDatetime?: string;
  lastUsedPlatformId?: string;
  messages?: { totalCount?: number; href?: string };
  [key: string]: unknown;
};

type MessageListResponse = {
  count?: number;
  items?: Message[];
  limit?: number;
  offset?: number;
  totalCount?: number;
};

type Message = {
  id?: string;
  conversationId?: string;
  type?: string;
  platform?: string;
  direction?: string;
  status?: string;
  origin?: string;
  content?: { text?: string; [key: string]: unknown };
  createdDatetime?: string;
  source?: {
    agentId?: string;
    flowId?: string;
    type?: string;
    inboxAgent?: {
      id?: string;
      fullName?: string;
      firstName?: string;
      lastName?: string;
    } | null;
    [key: string]: unknown;
  };
  metadata?: {
    sender?: { displayName?: string; [key: string]: unknown };
    [key: string]: unknown;
  };
  [key: string]: unknown;
};

type WaitingVerdict = {
  waiting: boolean;
  reason: string;
  lastMeaningful?: {
    id?: string;
    direction?: string;
    origin?: string | null;
    type?: string;
    textPreview?: string;
    createdDatetime?: string;
    senderDisplayName?: string | null;
    isHumanAgent?: boolean;
  };
};

function isEventMessage(msg: Message): boolean {
  return msg.type === "event" || msg.platform === "events";
}

/**
 * Human agent reply from the Inbox UI (not Flow Builder, not ticket automation).
 * Measured origin values: inbox (human), flows (bot), api (programmatic).
 */
function isHumanAgentMessage(msg: Message): boolean {
  if (msg.direction !== "sent") return false;
  if (isEventMessage(msg)) return false;

  const agentId = (msg.source?.agentId || "").trim();
  const inboxAgentId = (msg.source?.inboxAgent?.id || "").trim();
  const fullName = (msg.source?.inboxAgent?.fullName || "").trim();

  if (fullName === "Inbox Automation") return false;
  if (msg.source?.type === "ticketRule") return false;

  if (msg.origin === "inbox" && (agentId || inboxAgentId)) return true;
  if (agentId || inboxAgentId) return true;

  return false;
}

function textPreview(msg: Message, max = 160): string | undefined {
  const text = msg.content?.text;
  if (typeof text !== "string" || !text) return undefined;
  const flat = text.replace(/\s+/g, " ").trim();
  if (!flat) return undefined;
  return flat.length > max ? `${flat.slice(0, max)}…` : flat;
}

/**
 * Client is waiting for a human when the most recent meaningful message is from
 * the contact (received), with no human Inbox agent reply after it.
 * Flow Builder / automation messages do not clear the waiting state.
 */
export function evaluateWaitingForReply(messages: Message[]): WaitingVerdict {
  // API returns newest first.
  for (const msg of messages) {
    if (isEventMessage(msg)) continue;

    const preview = {
      id: msg.id,
      direction: msg.direction,
      origin: msg.origin ?? null,
      type: msg.type,
      textPreview: textPreview(msg),
      createdDatetime: msg.createdDatetime,
      senderDisplayName: msg.metadata?.sender?.displayName ?? null,
      isHumanAgent: isHumanAgentMessage(msg),
    };

    if (msg.direction === "received") {
      return {
        waiting: true,
        reason:
          "Last meaningful message is from the contact; no human Inbox agent replied after it.",
        lastMeaningful: preview,
      };
    }

    if (msg.direction === "sent" && isHumanAgentMessage(msg)) {
      return {
        waiting: false,
        reason: "A human Inbox agent already replied after the last contact message.",
        lastMeaningful: preview,
      };
    }

    // sent by flows / api / unknown automation — keep scanning older messages
  }

  return {
    waiting: false,
    reason:
      "No inbound contact message found in the recent window (or only automation traffic).",
  };
}

function clampInt(raw: string | undefined, fallback: number, min: number, max: number): number {
  if (raw === undefined || raw === "") return fallback;
  const n = Number.parseInt(raw, 10);
  if (Number.isNaN(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

function contactLabel(c: Conversation): string {
  const contact = c.contact || {};
  return (
    contact.displayName ||
    [contact.firstName, contact.lastName].filter(Boolean).join(" ") ||
    (contact.msisdn != null ? String(contact.msisdn) : "") ||
    c.contactId ||
    c.id
  );
}

export function registerConversationTools(server: McpServer) {
  // --- List conversations ---
  server.registerTool(
    "list_conversations",
    {
      title: "List Conversations",
      description:
        "List conversation threads across channels. " +
        "Supports native Conversations API status filter (active|archived|all) and an " +
        "intelligent waiting_for_reply filter that finds active threads where the contact " +
        "spoke last and no human Inbox agent has replied yet (Flow Builder auto-replies " +
        "do NOT count as agent reply). " +
        "Note: Inbox assignee/ticket status is NOT exposed by Conversations API — " +
        "waiting_for_reply is the supported heuristic for 'client waiting'.",
      inputSchema: {
        status: CONVERSATION_STATUS.optional(),
        ids: z
          .string()
          .optional()
          .describe(
            "Comma-separated conversation IDs to fetch (max 20). When set, other list filters still apply on the server side where supported.",
          ),
        offset: z.string().optional().describe("Number of items to skip (default: 0)"),
        limit: z
          .string()
          .optional()
          .describe(
            "Max items per page (default: 20, API max: 20). With waiting_for_reply, this is the max matching results to return.",
          ),
        waiting_for_reply: z
          .boolean()
          .optional()
          .describe(
            "If true, only return active conversations where the last meaningful message " +
              "is from the contact and no human Inbox agent has replied after it. " +
              "Scans recent active conversations and enriches each match with waiting metadata. " +
              "Implies status=active (archived threads are skipped).",
          ),
        scan_limit: z
          .string()
          .optional()
          .describe(
            "Only with waiting_for_reply: max conversations to inspect while scanning " +
              "(default: 40, max: 100). Paginated in pages of 20.",
          ),
      },
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        openWorldHint: true,
      },
    },
    async ({ status, ids, offset, limit, waiting_for_reply, scan_limit }) => {
      try {
        const pageLimit = clampInt(limit, 20, 1, 20);

        if (!waiting_for_reply) {
          const data = await apiRequest<ConversationListResponse>(
            "/conversations",
            "GET",
            undefined,
            {
              status: status ?? "active",
              ids,
              offset: offset ?? "0",
              limit: String(pageLimit),
            },
          );
          return toolResult({
            ...data,
            filter: {
              status: status ?? "active",
              waiting_for_reply: false,
              ids: ids || null,
            },
          });
        }

        // --- Intelligent waiting_for_reply scan ---
        if (status && status !== "active" && status !== "all") {
          return toolError(
            "waiting_for_reply only applies to active conversations. " +
              "Omit status or use status=active (archived threads are never 'waiting').",
          );
        }

        const maxScan = clampInt(scan_limit, 40, 1, 100);
        const startOffset = clampInt(offset, 0, 0, 1_000_000);
        const matches: Array<
          Conversation & {
            waiting: WaitingVerdict;
            contactLabel: string;
          }
        > = [];
        let scanned = 0;
        let pageOffset = startOffset;
        let totalActive: number | undefined;
        const errors: Array<{ conversationId: string; error: string }> = [];

        while (scanned < maxScan && matches.length < pageLimit) {
          const batchSize = Math.min(20, maxScan - scanned);
          const page = await apiRequest<ConversationListResponse>(
            "/conversations",
            "GET",
            undefined,
            {
              status: "active",
              ids,
              offset: String(pageOffset),
              limit: String(batchSize),
            },
          );

          totalActive = page.totalCount ?? totalActive;
          const items = page.items || [];
          if (items.length === 0) break;

          for (const conv of items) {
            if (matches.length >= pageLimit) break;
            scanned += 1;
            try {
              const msgs = await apiRequest<MessageListResponse>(
                `/conversations/${conv.id}/messages`,
                "GET",
                undefined,
                { limit: "20", offset: "0" },
              );
              const verdict = evaluateWaitingForReply(msgs.items || []);
              if (verdict.waiting) {
                matches.push({
                  ...conv,
                  contactLabel: contactLabel(conv),
                  waiting: verdict,
                });
              }
            } catch (err) {
              errors.push({
                conversationId: conv.id,
                error: (err as Error).message,
              });
            }
          }

          pageOffset += items.length;
          if (items.length < batchSize) break;
        }

        return toolResult({
          count: matches.length,
          items: matches,
          limit: pageLimit,
          offset: startOffset,
          scanned,
          scan_limit: maxScan,
          next_scan_offset: pageOffset,
          totalActiveCount: totalActive,
          filter: {
            status: "active",
            waiting_for_reply: true,
            ids: ids || null,
            definition:
              "waiting = last non-event message is direction=received, " +
              "with no later human Inbox agent reply (origin=inbox / agentId). " +
              "Flow Builder and ticket automation do not clear waiting state.",
          },
          ...(errors.length ? { errors } : {}),
        });
      } catch (error) {
        return toolError(`Failed to list conversations: ${(error as Error).message}`);
      }
    },
  );

  // --- Get conversation ---
  server.registerTool(
    "get_conversation",
    {
      title: "Get Conversation",
      description: "Get details of a specific conversation by its ID.",
      inputSchema: {
        conversation_id: z.string().describe("Conversation ID"),
      },
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        openWorldHint: true,
      },
    },
    async ({ conversation_id }) => {
      try {
        const data = await apiRequest(`/conversations/${conversation_id}`);
        return toolResult(data);
      } catch (error) {
        return toolError(`Failed to get conversation: ${(error as Error).message}`);
      }
    },
  );

  // --- Update conversation ---
  server.registerTool(
    "update_conversation",
    {
      title: "Update Conversation",
      description: "Update a conversation (e.g. change status to archived or active).",
      inputSchema: {
        conversation_id: z.string().describe("Conversation ID"),
        status: z
          .enum(["active", "archived"])
          .describe("New conversation status"),
      },
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        openWorldHint: true,
      },
    },
    async ({ conversation_id, status }) => {
      try {
        const data = await apiRequest(
          `/conversations/${conversation_id}`,
          "PATCH",
          { status },
        );
        return toolResult(data);
      } catch (error) {
        return toolError(`Failed to update conversation: ${(error as Error).message}`);
      }
    },
  );

  // --- List messages in conversation ---
  server.registerTool(
    "list_conversation_messages",
    {
      title: "List Conversation Messages",
      description:
        "List all messages in a specific conversation. Returns paginated message history " +
        "(newest first). Event/ticket lifecycle rows have type=event — skip them when " +
        "judging who spoke last. Human agent replies have origin=inbox and source.agentId; " +
        "bot replies have origin=flows.",
      inputSchema: {
        conversation_id: z.string().describe("Conversation ID"),
        offset: z.string().optional().describe("Number of items to skip (default: 0)"),
        limit: z
          .string()
          .optional()
          .describe("Max items per page (default: 20, API max: 20)"),
      },
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        openWorldHint: true,
      },
    },
    async ({ conversation_id, offset, limit }) => {
      try {
        const pageLimit = clampInt(limit, 20, 1, 20);
        const data = await apiRequest(
          `/conversations/${conversation_id}/messages`,
          "GET",
          undefined,
          { offset: offset ?? "0", limit: String(pageLimit) },
        );
        return toolResult(data);
      } catch (error) {
        return toolError(`Failed to list messages: ${(error as Error).message}`);
      }
    },
  );

  // --- Get specific message ---
  server.registerTool(
    "get_message",
    {
      title: "Get Message",
      description: "Get details of a specific message by conversation and message ID.",
      inputSchema: {
        conversation_id: z.string().describe("Conversation ID"),
        message_id: z.string().describe("Message ID"),
      },
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        openWorldHint: true,
      },
    },
    async ({ conversation_id, message_id }) => {
      try {
        const data = await apiRequest(
          `/conversations/${conversation_id}/messages/${message_id}`,
        );
        return toolResult(data);
      } catch (error) {
        return toolError(`Failed to get message: ${(error as Error).message}`);
      }
    },
  );

  // --- Reply to conversation ---
  server.registerTool(
    "reply_to_conversation",
    {
      title: "Reply to Conversation",
      description:
        "Send a reply message in an existing conversation. If the conversation is archived, a new one is created.",
      inputSchema: {
        conversation_id: z.string().describe("Conversation ID to reply to"),
        type: z
          .enum(["text", "image", "video", "audio", "file", "location"])
          .describe("Message type"),
        text: z.string().optional().describe("Text content (required for type=text)"),
        media_url: z
          .string()
          .url()
          .optional()
          .describe("Media URL (required for image/video/audio/file types)"),
        caption: z.string().optional().describe("Media caption (for image/video/file)"),
        latitude: z.number().optional().describe("Latitude (required for type=location)"),
        longitude: z.number().optional().describe("Longitude (required for type=location)"),
        channel_id: z
          .string()
          .optional()
          .describe("Channel ID (uses most recent channel if omitted)"),
      },
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        openWorldHint: true,
      },
    },
    async ({
      conversation_id,
      type,
      text,
      media_url,
      caption,
      latitude,
      longitude,
      channel_id,
    }) => {
      try {
        let content: Record<string, unknown>;

        switch (type) {
          case "text":
            content = { text: text || "" };
            break;
          case "image":
          case "video":
          case "audio":
          case "file": {
            const media: Record<string, unknown> = { url: media_url };
            if (caption && type !== "audio") media.caption = caption;
            content = { [type]: media };
            break;
          }
          case "location":
            content = { location: { latitude, longitude } };
            break;
          default:
            return toolError(`Unsupported message type: ${type}`);
        }

        const body: Record<string, unknown> = { type, content };
        if (channel_id) body.channelId = channel_id;

        const data = await apiRequest(
          `/conversations/${conversation_id}/messages`,
          "POST",
          body,
        );
        return toolResult(data);
      } catch (error) {
        return toolError(`Failed to reply to conversation: ${(error as Error).message}`);
      }
    },
  );

  // --- List all messages ---
  server.registerTool(
    "list_messages",
    {
      title: "List All Messages",
      description:
        "Fetch messages by IDs or by a short recent time window. " +
        "Conversations API requires either `ids` (comma-separated, max 20) OR `from` " +
        "(RFC3339 datetime, max 5 minutes lookback) — not offset/limit pagination.",
      inputSchema: {
        ids: z
          .string()
          .optional()
          .describe("Comma-separated message IDs (max 20). Required if `from` is omitted."),
        from: z
          .string()
          .optional()
          .describe(
            "RFC3339 datetime lower bound (must be within the last 5 minutes). Required if `ids` is omitted.",
          ),
      },
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        openWorldHint: true,
      },
    },
    async ({ ids, from }) => {
      try {
        if (!ids && !from) {
          return toolError(
            "list_messages requires either `ids` (comma-separated message IDs) " +
              "or `from` (RFC3339 datetime within the last 5 minutes).",
          );
        }
        const data = await apiRequest("/messages", "GET", undefined, {
          ids,
          from,
        });
        return toolResult(data);
      } catch (error) {
        return toolError(`Failed to list messages: ${(error as Error).message}`);
      }
    },
  );
}
