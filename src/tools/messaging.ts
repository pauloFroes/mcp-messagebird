import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { apiRequest, toolResult, toolError } from "../client.js";

export function registerMessagingTools(server: McpServer) {
  // --- Send text message ---
  server.registerTool(
    "send_text",
    {
      title: "Send Text Message",
      description:
        "Send a WhatsApp text message to a phone number. Use for simple text messages within or outside the 24h window (if template not required).",
      inputSchema: {
        to: z.string().describe("Recipient phone number in E.164 format (e.g. +5511999999999)"),
        from: z.string().describe("WhatsApp Channel ID (from MessageBird Channel Directory)"),
        text: z.string().min(1).describe("Message text content"),
        disable_url_preview: z
          .boolean()
          .optional()
          .describe("Disable URL preview in text messages (default: false)"),
        report_url: z
          .string()
          .optional()
          .describe("HTTPS URL for delivery status updates"),
      },
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        openWorldHint: true,
      },
    },
    async ({ to, from, text, disable_url_preview, report_url }) => {
      try {
        const body: Record<string, unknown> = {
          to,
          from,
          type: "text",
          content: {
            text,
            ...(disable_url_preview !== undefined
              ? { disableUrlPreview: disable_url_preview }
              : {}),
          },
        };
        if (report_url) body.reportUrl = report_url;

        const data = await apiRequest("/send", "POST", body);
        return toolResult(data);
      } catch (error) {
        return toolError(`Failed to send text message: ${(error as Error).message}`);
      }
    },
  );

  // --- Send media message ---
  server.registerTool(
    "send_media",
    {
      title: "Send Media Message",
      description:
        "Send a WhatsApp media message (image, video, audio, or file). Media URL must be publicly accessible.",
      inputSchema: {
        to: z.string().describe("Recipient phone number in E.164 format"),
        from: z.string().describe("WhatsApp Channel ID"),
        media_type: z
          .enum(["image", "video", "audio", "file"])
          .describe("Type of media to send"),
        media_url: z.string().url().describe("Publicly accessible URL of the media file"),
        caption: z.string().optional().describe("Optional caption (not supported for audio)"),
      },
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        openWorldHint: true,
      },
    },
    async ({ to, from, media_type, media_url, caption }) => {
      try {
        const mediaContent: Record<string, unknown> = { url: media_url };
        if (caption && media_type !== "audio") {
          mediaContent.caption = caption;
        }

        const data = await apiRequest("/send", "POST", {
          to,
          from,
          type: media_type,
          content: { [media_type]: mediaContent },
        });
        return toolResult(data);
      } catch (error) {
        return toolError(`Failed to send media message: ${(error as Error).message}`);
      }
    },
  );

  // --- Send location ---
  server.registerTool(
    "send_location",
    {
      title: "Send Location Message",
      description: "Send a WhatsApp location message with coordinates.",
      inputSchema: {
        to: z.string().describe("Recipient phone number in E.164 format"),
        from: z.string().describe("WhatsApp Channel ID"),
        latitude: z.number().describe("Latitude coordinate"),
        longitude: z.number().describe("Longitude coordinate"),
        name: z.string().optional().describe("Location name"),
        address: z.string().optional().describe("Location address"),
      },
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        openWorldHint: true,
      },
    },
    async ({ to, from, latitude, longitude, name, address }) => {
      try {
        const location: Record<string, unknown> = { latitude, longitude };
        if (name) location.name = name;
        if (address) location.address = address;

        const data = await apiRequest("/send", "POST", {
          to,
          from,
          type: "location",
          content: { location },
        });
        return toolResult(data);
      } catch (error) {
        return toolError(`Failed to send location: ${(error as Error).message}`);
      }
    },
  );

  // --- Send template (HSM) message ---
  server.registerTool(
    "send_template",
    {
      title: "Send Template Message",
      description:
        "Send a WhatsApp template (HSM) message. Required to initiate conversations outside the 24h window. Template must be pre-approved by Meta.",
      inputSchema: {
        to: z.string().describe("Recipient phone number in E.164 format"),
        from: z.string().describe("WhatsApp Channel ID"),
        namespace: z.string().describe("Template namespace UUID (from WhatsApp Template Manager)"),
        template_name: z
          .string()
          .describe("Template name (lowercase with underscores)"),
        language_code: z.string().describe("Language code (e.g. en, pt_BR, es)"),
        parameters: z
          .array(z.string())
          .optional()
          .describe("Template body parameter values in order (e.g. ['John', 'Order #123'])"),
        header_image_url: z
          .string()
          .url()
          .optional()
          .describe("Public URL for image header (if template has image header)"),
        header_video_url: z
          .string()
          .url()
          .optional()
          .describe("Public URL for video header (if template has video header)"),
        header_document_url: z
          .string()
          .url()
          .optional()
          .describe("Public URL for document header (if template has document header)"),
        button_url_suffix: z
          .string()
          .optional()
          .describe("Dynamic suffix for URL button (appended to template URL)"),
      },
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        openWorldHint: true,
      },
    },
    async ({
      to,
      from,
      namespace,
      template_name,
      language_code,
      parameters,
      header_image_url,
      header_video_url,
      header_document_url,
      button_url_suffix,
    }) => {
      try {
        const hsm: Record<string, unknown> = {
          namespace,
          templateName: template_name,
          language: { policy: "deterministic", code: language_code },
        };

        // Simple params (legacy format)
        if (parameters && parameters.length > 0 && !header_image_url && !header_video_url && !header_document_url && !button_url_suffix) {
          hsm.params = parameters.map((p) => ({ default: p }));
        }

        // Components format (for media headers and/or buttons)
        const components: Array<Record<string, unknown>> = [];

        if (header_image_url) {
          components.push({
            type: "header",
            parameters: [{ type: "image", image: { url: header_image_url } }],
          });
        } else if (header_video_url) {
          components.push({
            type: "header",
            parameters: [{ type: "video", video: { url: header_video_url } }],
          });
        } else if (header_document_url) {
          components.push({
            type: "header",
            parameters: [
              { type: "document", document: { url: header_document_url } },
            ],
          });
        }

        if (parameters && parameters.length > 0 && components.length > 0) {
          components.push({
            type: "body",
            parameters: parameters.map((p) => ({ type: "text", text: p })),
          });
        }

        if (button_url_suffix) {
          components.push({
            type: "button",
            sub_type: "url",
            parameters: [{ type: "text", text: button_url_suffix }],
          });
        }

        if (components.length > 0) {
          hsm.components = components;
          // When using components format, body params go in components
          if (parameters && parameters.length > 0) {
            delete hsm.params;
          }
        }

        const data = await apiRequest("/send", "POST", {
          to,
          from,
          type: "hsm",
          content: { hsm },
        });
        return toolResult(data);
      } catch (error) {
        return toolError(`Failed to send template message: ${(error as Error).message}`);
      }
    },
  );

  // --- Send interactive button message ---
  server.registerTool(
    "send_interactive_buttons",
    {
      title: "Send Interactive Button Message",
      description:
        "Send a WhatsApp interactive message with quick reply buttons (max 3 buttons).",
      inputSchema: {
        to: z.string().describe("Recipient phone number in E.164 format"),
        from: z.string().describe("WhatsApp Channel ID"),
        body_text: z.string().describe("Main message body text"),
        buttons: z
          .array(
            z.object({
              id: z.string().describe("Unique button identifier"),
              title: z.string().describe("Button display text (max 20 chars)"),
            }),
          )
          .min(1)
          .max(3)
          .describe("Reply buttons (1-3)"),
        header_text: z.string().optional().describe("Optional header text"),
        header_image_url: z.string().url().optional().describe("Optional header image URL"),
        footer_text: z.string().optional().describe("Optional footer text"),
      },
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        openWorldHint: true,
      },
    },
    async ({ to, from, body_text, buttons, header_text, header_image_url, footer_text }) => {
      try {
        const interactive: Record<string, unknown> = {
          type: "button",
          body: { text: body_text },
          action: {
            buttons: buttons.map((b) => ({
              id: b.id,
              type: "reply",
              title: b.title,
            })),
          },
        };

        if (header_text) {
          interactive.header = { type: "text", text: header_text };
        } else if (header_image_url) {
          interactive.header = {
            type: "image",
            image: { url: header_image_url },
          };
        }

        if (footer_text) interactive.footer = { text: footer_text };

        const data = await apiRequest("/send", "POST", {
          to,
          from,
          type: "interactive",
          content: { interactive },
        });
        return toolResult(data);
      } catch (error) {
        return toolError(`Failed to send interactive buttons: ${(error as Error).message}`);
      }
    },
  );

  // --- Send interactive list message ---
  server.registerTool(
    "send_interactive_list",
    {
      title: "Send Interactive List Message",
      description:
        "Send a WhatsApp interactive list message with selectable menu options organized in sections.",
      inputSchema: {
        to: z.string().describe("Recipient phone number in E.164 format"),
        from: z.string().describe("WhatsApp Channel ID"),
        body_text: z.string().describe("Main message body text"),
        button_label: z.string().describe("Text displayed on the menu trigger button"),
        sections: z
          .array(
            z.object({
              title: z.string().describe("Section title"),
              rows: z
                .array(
                  z.object({
                    id: z.string().describe("Unique row identifier"),
                    title: z.string().describe("Row title (max 24 chars)"),
                    description: z
                      .string()
                      .optional()
                      .describe("Row description (max 72 chars)"),
                  }),
                )
                .min(1)
                .describe("Selectable items in this section"),
            }),
          )
          .min(1)
          .max(10)
          .describe("Menu sections (1-10)"),
        header_text: z.string().optional().describe("Optional header text"),
        footer_text: z.string().optional().describe("Optional footer text"),
      },
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        openWorldHint: true,
      },
    },
    async ({ to, from, body_text, button_label, sections, header_text, footer_text }) => {
      try {
        const interactive: Record<string, unknown> = {
          type: "list",
          body: { text: body_text },
          action: { button: button_label, sections },
        };

        if (header_text) {
          interactive.header = { type: "text", text: header_text };
        }
        if (footer_text) interactive.footer = { text: footer_text };

        const data = await apiRequest("/send", "POST", {
          to,
          from,
          type: "interactive",
          content: { interactive },
        });
        return toolResult(data);
      } catch (error) {
        return toolError(`Failed to send interactive list: ${(error as Error).message}`);
      }
    },
  );
}
