import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
type Message = {
    id?: string;
    conversationId?: string;
    type?: string;
    platform?: string;
    direction?: string;
    status?: string;
    origin?: string;
    content?: {
        text?: string;
        [key: string]: unknown;
    };
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
/**
 * Client is waiting for a human when the most recent meaningful message is from
 * the contact (received), with no human Inbox agent reply after it.
 * Flow Builder / automation messages do not clear the waiting state.
 */
export declare function evaluateWaitingForReply(messages: Message[]): WaitingVerdict;
export declare function registerConversationTools(server: McpServer): void;
export {};
