import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { apiRequest, toolResult, toolError } from "../client.js";

/** Conversation lifecycle status as defined by Conversations API. */
const CONVERSATION_STATUS = z
  .enum(["active", "archived", "all"])
  .describe(
    "Conversation lifecycle status (Conversations API only). " +
      "active = open thread (default), archived = closed/archived, all = both. " +
      "This is NOT Inbox assignee/ticket status — use proxy=assigned_open for that approximation.",
  );

/**
 * Client-side proxies built only from Conversations API data
 * (no Collaborations/Bird Inbox API).
 */
const PROXY_FILTER = z
  .enum(["none", "waiting_for_reply", "assigned_open", "assigned_open_waiting"])
  .describe(
    "Client-side approximation (MessageBird Conversations API has no assignee field). " +
      "none = native list only. " +
      "waiting_for_reply = contact spoke last, no human Inbox agent replied. " +
      "assigned_open = ticketLifecycleAssigned to a real agent is the latest assignment event " +
      "(and no later Unassigned) on an active conversation — reconstructed from type=event messages. " +
      "assigned_open_waiting = assigned_open AND waiting_for_reply. " +
      "INCOMPLETE: only threads with ticket events in the scanned message window are visible.",
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
  eventType?: string;
  content?: { text?: string; [key: string]: unknown };
  createdDatetime?: string;
  source?: {
    agentId?: string;
    flowId?: string;
    type?: string;
    changedByAgentId?: string;
    inboxAgent?: {
      id?: string;
      fullName?: string;
      firstName?: string;
      lastName?: string;
    } | null;
    changedByInboxAgent?: {
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

type TicketProxy = {
  /** True if latest assignment event is ticketLifecycleAssigned to a real agent. */
  assigned: boolean;
  assignee: {
    agentId: string;
    name: string;
    at?: string;
  } | null;
  /** Latest ticket substatus from events: active | pending | null if unknown. */
  substatus: "active" | "pending" | null;
  substatusAt?: string;
  /** Conversation is active AND assigned (proxy for "open assigned ticket"). */
  assigned_open: boolean;
  /** Any ticketLifecycle* event seen in the scanned message window. */
  has_ticket_signal: boolean;
  events_seen: string[];
  messages_scanned: number;
  /**
   * high = assignment event found in window.
   * low = no ticket assign/unassign events in window (cannot prove assignment state).
   */
  confidence: "high" | "low";
  note: string;
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

function agentFromSource(msg: Message): { agentId: string; name: string } | null {
  const src = msg.source || {};
  const agent =
    src.inboxAgent && (src.inboxAgent.id || "").trim()
      ? src.inboxAgent
      : src.changedByInboxAgent && (src.changedByInboxAgent.id || "").trim()
        ? src.changedByInboxAgent
        : null;

  const agentId = (src.agentId || agent?.id || "").trim();
  if (!agentId) return null;

  const name =
    (agent?.fullName || "").trim() ||
    [agent?.firstName, agent?.lastName].filter(Boolean).join(" ").trim() ||
    agentId;

  // Ignore pure automation actor
  if (name === "Inbox Automation") return null;

  return { agentId, name };
}

/**
 * Reconstruct Inbox-ish ticket state from Conversations message events.
 * Only MessageBird Conversations API — events like ticketLifecycleAssigned
 * appear as type=event rows when the Inbox product wrote them.
 *
 * Messages are expected newest-first (API default). We process oldest→newest
 * so the last assignment/substatus wins.
 */
export function evaluateTicketProxy(
  messagesNewestFirst: Message[],
  conversationStatus?: string,
): TicketProxy {
  const chronological = [...messagesNewestFirst].reverse();
  const eventsSeen: string[] = [];

  let assignee: TicketProxy["assignee"] = null;
  let assigned = false;
  let substatus: TicketProxy["substatus"] = null;
  let substatusAt: string | undefined;
  let sawAssignOrUnassign = false;

  for (const msg of chronological) {
    const et = msg.eventType || "";
    if (!et.startsWith("ticketLifecycle") && msg.type !== "event") continue;
    if (!et) continue;

    eventsSeen.push(et);

    if (et === "ticketLifecycleAssigned") {
      const agent = agentFromSource(msg);
      if (agent) {
        assigned = true;
        assignee = { ...agent, at: msg.createdDatetime };
        sawAssignOrUnassign = true;
      }
    } else if (
      et === "ticketLifecycleUnassigned" ||
      et === "ticketLifecycleUnAssigned"
    ) {
      assigned = false;
      assignee = null;
      sawAssignOrUnassign = true;
    } else if (et === "ticketLifecycleSubstatusActive") {
      substatus = "active";
      substatusAt = msg.createdDatetime;
    } else if (et === "ticketLifecycleSubstatusPending") {
      substatus = "pending";
      substatusAt = msg.createdDatetime;
    }
    // Future-proof: treat closed/resolved-like events as not open assigned
    else if (
      /resolved|closed|completed|done/i.test(et) ||
      /resolved|closed/i.test((msg.content?.text || "").toString())
    ) {
      // Keep assignee info but mark as not "open" via substatus null + note
      substatus = null;
      substatusAt = msg.createdDatetime;
      eventsSeen.push(`${et}:closed_signal`);
    }
  }

  const convActive = !conversationStatus || conversationStatus === "active";
  const assigned_open = convActive && assigned && !!assignee;

  const has_ticket_signal = eventsSeen.length > 0;
  const confidence: TicketProxy["confidence"] = sawAssignOrUnassign
    ? "high"
    : "low";

  let note: string;
  if (!has_ticket_signal) {
    note =
      "No ticketLifecycle* events in the scanned message window. " +
      "Cannot confirm assignment (most bot-only threads never get these events).";
  } else if (!sawAssignOrUnassign) {
    note =
      "Saw ticket substatus events but no Assigned/Unassigned in window. " +
      "Assignment may be older than the scanned messages.";
  } else if (assigned_open) {
    note =
      "Proxy: active conversation + latest assignment event is Assigned to a real agent. " +
      "Not an official Conversations API filter.";
  } else {
    note = "Latest assignment signal is unassigned or has no real agent id.";
  }

  return {
    assigned,
    assignee,
    substatus,
    substatusAt,
    assigned_open,
    has_ticket_signal,
    events_seen: [...new Set(eventsSeen)],
    messages_scanned: messagesNewestFirst.length,
    confidence,
    note,
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

/** Fetch up to maxMessages (newest first), paging by 20. */
async function fetchMessages(
  conversationId: string,
  maxMessages: number,
): Promise<Message[]> {
  const out: Message[] = [];
  let offset = 0;
  const pageSize = 20;

  while (out.length < maxMessages) {
    const batch = Math.min(pageSize, maxMessages - out.length);
    const page = await apiRequest<MessageListResponse>(
      `/conversations/${conversationId}/messages`,
      "GET",
      undefined,
      { limit: String(batch), offset: String(offset) },
    );
    const items = page.items || [];
    out.push(...items);
    if (items.length < batch) break;
    offset += items.length;
  }

  return out;
}

export function registerConversationTools(server: McpServer) {
  // --- List conversations ---
  server.registerTool(
    "list_conversations",
    {
      title: "List Conversations",
      description:
        "List MessageBird Conversations API threads. " +
        "Native filter: status=active|archived|all. " +
        "Proxies (client-side, incomplete): waiting_for_reply, assigned_open " +
        "(from ticketLifecycle* events in message history), assigned_open_waiting. " +
        "Conversations API has NO assignee field — assigned_open is a reconstruction, " +
        "not an official list filter. Prefer small scan_limit; each conversation costs " +
        "extra message GETs.",
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
            "Max items to return (default: 20, max: 20). With a proxy filter, this is max matches.",
          ),
        proxy: PROXY_FILTER.optional(),
        waiting_for_reply: z
          .boolean()
          .optional()
          .describe(
            "Deprecated alias: true ≡ proxy=waiting_for_reply. Prefer `proxy`.",
          ),
        scan_limit: z
          .string()
          .optional()
          .describe(
            "With a proxy filter: max conversations to inspect (default: 40, max: 100). " +
              "Paginated in pages of 20.",
          ),
        message_scan_limit: z
          .string()
          .optional()
          .describe(
            "With a proxy filter: max messages to load per conversation when reconstructing " +
              "ticket/waiting state (default: 40, max: 100). Higher catches older Assigned events.",
          ),
      },
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        openWorldHint: true,
      },
    },
    async ({
      status,
      ids,
      offset,
      limit,
      proxy,
      waiting_for_reply,
      scan_limit,
      message_scan_limit,
    }) => {
      try {
        const pageLimit = clampInt(limit, 20, 1, 20);

        // Resolve proxy mode (backward compatible with waiting_for_reply boolean)
        let mode: z.infer<typeof PROXY_FILTER> = proxy ?? "none";
        if (waiting_for_reply === true && mode === "none") {
          mode = "waiting_for_reply";
        }

        if (mode === "none") {
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
              proxy: "none",
              ids: ids || null,
              api: "MessageBird Conversations API only",
            },
          });
        }

        // --- Proxy scans (active only) ---
        if (status && status !== "active" && status !== "all") {
          return toolError(
            `proxy=${mode} only applies to active conversations. ` +
              "Omit status or use status=active.",
          );
        }

        const maxScan = clampInt(scan_limit, 40, 1, 100);
        const maxMsgs = clampInt(message_scan_limit, 40, 20, 100);
        const startOffset = clampInt(offset, 0, 0, 1_000_000);

        type Match = Conversation & {
          contactLabel: string;
          waiting: WaitingVerdict;
          ticket: TicketProxy;
        };

        const matches: Match[] = [];
        let scanned = 0;
        let pageOffset = startOffset;
        let totalActive: number | undefined;
        const errors: Array<{ conversationId: string; error: string }> = [];
        let withTicketSignal = 0;
        let withAssigned = 0;

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
              const msgs = await fetchMessages(conv.id, maxMsgs);
              const waiting = evaluateWaitingForReply(msgs);
              const ticket = evaluateTicketProxy(msgs, conv.status);

              if (ticket.has_ticket_signal) withTicketSignal += 1;
              if (ticket.assigned) withAssigned += 1;

              let keep = false;
              if (mode === "waiting_for_reply") keep = waiting.waiting;
              else if (mode === "assigned_open") keep = ticket.assigned_open;
              else if (mode === "assigned_open_waiting") {
                keep = ticket.assigned_open && waiting.waiting;
              }

              if (keep) {
                matches.push({
                  ...conv,
                  contactLabel: contactLabel(conv),
                  waiting,
                  ticket,
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
          message_scan_limit: maxMsgs,
          next_scan_offset: pageOffset,
          totalActiveCount: totalActive,
          stats: {
            with_ticket_signal: withTicketSignal,
            with_assigned: withAssigned,
            matches: matches.length,
          },
          filter: {
            status: "active",
            proxy: mode,
            ids: ids || null,
            api: "MessageBird Conversations API only",
            disclaimer:
              "assigned_open is reconstructed from ticketLifecycle* message events. " +
              "Threads without those events in the scanned window are invisible to this filter. " +
              "This is NOT an official MessageBird list filter for Inbox assignee.",
            definitions: {
              waiting_for_reply:
                "Last non-event message is direction=received; no later human Inbox agent reply.",
              assigned_open:
                "Conversation status=active AND latest ticketLifecycleAssigned " +
                "(with real agentId) is more recent than any Unassigned in the message window.",
              assigned_open_waiting: "assigned_open AND waiting_for_reply",
            },
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
        "bot replies have origin=flows. Ticket proxy events: ticketLifecycleAssigned, " +
        "ticketLifecycleSubstatusActive/Pending.",
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
