import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
type Message = {
    id?: string;
    conversationId?: string;
    type?: string;
    platform?: string;
    direction?: string;
    status?: string;
    origin?: string;
    eventType?: string;
    content?: {
        text?: string;
        [key: string]: unknown;
    };
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
        sender?: {
            displayName?: string;
            [key: string]: unknown;
        };
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
/**
 * Client is waiting for a human when the most recent meaningful message is from
 * the contact (received), with no human Inbox agent reply after it.
 * Flow Builder / automation messages do not clear the waiting state.
 */
export declare function evaluateWaitingForReply(messages: Message[]): WaitingVerdict;
/**
 * Reconstruct Inbox-ish ticket state from Conversations message events.
 * Only MessageBird Conversations API — events like ticketLifecycleAssigned
 * appear as type=event rows when the Inbox product wrote them.
 *
 * Messages are expected newest-first (API default). We process oldest→newest
 * so the last assignment/substatus wins.
 */
export declare function evaluateTicketProxy(messagesNewestFirst: Message[], conversationStatus?: string): TicketProxy;
export declare function registerConversationTools(server: McpServer): void;
export {};
