import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { apiRequest, toolResult, toolError } from "../client.js";

export function registerConversationTools(server: McpServer) {
  // --- List conversations ---
  server.registerTool(
    "list_conversations",
    {
      title: "List Conversations",
      description:
        "List all conversations. Returns paginated list of conversation threads across all channels.",
      inputSchema: {
        offset: z.string().optional().describe("Number of items to skip (default: 0)"),
        limit: z.string().optional().describe("Max items per page (default: 20)"),
      },
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        openWorldHint: true,
      },
    },
    async ({ offset, limit }) => {
      try {
        const data = await apiRequest("/conversations", "GET", undefined, {
          offset,
          limit,
        });
        return toolResult(data);
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
        "List all messages in a specific conversation. Returns paginated message history.",
      inputSchema: {
        conversation_id: z.string().describe("Conversation ID"),
        offset: z.string().optional().describe("Number of items to skip (default: 0)"),
        limit: z.string().optional().describe("Max items per page (default: 20)"),
      },
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        openWorldHint: true,
      },
    },
    async ({ conversation_id, offset, limit }) => {
      try {
        const data = await apiRequest(
          `/conversations/${conversation_id}/messages`,
          "GET",
          undefined,
          { offset, limit },
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
        "List messages across all conversations. Useful for searching or monitoring all messaging activity.",
      inputSchema: {
        offset: z.string().optional().describe("Number of items to skip (default: 0)"),
        limit: z.string().optional().describe("Max items per page (default: 20)"),
      },
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        openWorldHint: true,
      },
    },
    async ({ offset, limit }) => {
      try {
        const data = await apiRequest("/messages", "GET", undefined, {
          offset,
          limit,
        });
        return toolResult(data);
      } catch (error) {
        return toolError(`Failed to list messages: ${(error as Error).message}`);
      }
    },
  );
}
