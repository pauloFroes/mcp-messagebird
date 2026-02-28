import { z } from "zod";
import { apiRequest, toolResult, toolError } from "../client.js";
export function registerTemplateTools(server) {
    // --- List templates ---
    server.registerTool("list_templates", {
        title: "List WhatsApp Templates",
        description: "List all WhatsApp message templates. Returns paginated list with status, category, and components.",
        inputSchema: {
            offset: z.string().optional().describe("Number of items to skip (default: 0)"),
            limit: z.string().optional().describe("Max items per page (max: 50, default: 50)"),
            waba_id: z.string().optional().describe("Filter by WhatsApp Business Account ID"),
            channel_id: z.string().optional().describe("Filter by channel ID"),
        },
        annotations: {
            readOnlyHint: true,
            destructiveHint: false,
            openWorldHint: true,
        },
    }, async ({ offset, limit, waba_id, channel_id }) => {
        try {
            const data = await apiRequest("/v3/platforms/whatsapp/templates", "GET", undefined, {
                offset,
                limit,
                wabaId: waba_id,
                channelId: channel_id,
            }, "integrations");
            return toolResult(data);
        }
        catch (error) {
            return toolError(`Failed to list templates: ${error.message}`);
        }
    });
    // --- Get template ---
    server.registerTool("get_template", {
        title: "Get Template Details",
        description: "Get details of a specific WhatsApp template by name and language code.",
        inputSchema: {
            name: z.string().describe("Template name (lowercase with underscores)"),
            language: z.string().describe("Language code (e.g. en, pt_BR)"),
        },
        annotations: {
            readOnlyHint: true,
            destructiveHint: false,
            openWorldHint: true,
        },
    }, async ({ name, language }) => {
        try {
            const data = await apiRequest(`/v3/platforms/whatsapp/templates/${name}/${language}`, "GET", undefined, undefined, "integrations");
            return toolResult(data);
        }
        catch (error) {
            return toolError(`Failed to get template: ${error.message}`);
        }
    });
    // --- Create template ---
    server.registerTool("create_template", {
        title: "Create WhatsApp Template",
        description: "Create a new WhatsApp message template for Meta approval. Templates are required to initiate conversations outside the 24h window.",
        inputSchema: {
            name: z
                .string()
                .describe("Template name (lowercase, underscores, no spaces)"),
            language: z.string().describe("Language code (e.g. en, pt_BR)"),
            category: z
                .enum(["UTILITY", "MARKETING", "AUTHENTICATION"])
                .describe("Template category"),
            body_text: z
                .string()
                .describe("Body text with {{1}}, {{2}} etc. for variables"),
            header_type: z
                .enum(["TEXT", "IMAGE", "VIDEO", "DOCUMENT"])
                .optional()
                .describe("Header format type"),
            header_text: z
                .string()
                .optional()
                .describe("Header text (when header_type=TEXT)"),
            header_example_url: z
                .string()
                .url()
                .optional()
                .describe("Example media URL for header (when header_type=IMAGE/VIDEO/DOCUMENT)"),
            footer_text: z.string().optional().describe("Footer text"),
            button_type: z
                .enum(["PHONE_NUMBER", "URL", "QUICK_REPLY"])
                .optional()
                .describe("Button type (max 2 buttons per template)"),
            button_text: z.string().optional().describe("Button display text"),
            button_value: z
                .string()
                .optional()
                .describe("Button value (phone number or URL depending on type)"),
            body_examples: z
                .array(z.string())
                .optional()
                .describe("Example values for body variables (for Meta approval)"),
            waba_id: z.string().optional().describe("WhatsApp Business Account ID"),
            allow_category_change: z
                .boolean()
                .optional()
                .describe("Allow Meta to reassign category"),
        },
        annotations: {
            readOnlyHint: false,
            destructiveHint: false,
            openWorldHint: true,
        },
    }, async ({ name, language, category, body_text, header_type, header_text, header_example_url, footer_text, button_type, button_text, button_value, body_examples, waba_id, allow_category_change, }) => {
        try {
            const components = [];
            // Header
            if (header_type) {
                const header = {
                    type: "HEADER",
                    format: header_type,
                };
                if (header_type === "TEXT" && header_text) {
                    header.text = header_text;
                }
                else if (header_example_url) {
                    header.example = { header_url: [header_example_url] };
                }
                components.push(header);
            }
            // Body (required)
            const body = {
                type: "BODY",
                text: body_text,
            };
            if (body_examples && body_examples.length > 0) {
                body.example = { body_text: [body_examples] };
            }
            components.push(body);
            // Footer
            if (footer_text) {
                components.push({ type: "FOOTER", text: footer_text });
            }
            // Buttons
            if (button_type && button_text) {
                const button = {
                    type: button_type,
                    text: button_text,
                };
                if (button_type === "PHONE_NUMBER" && button_value) {
                    button.phone_number = button_value;
                }
                else if (button_type === "URL" && button_value) {
                    button.url = button_value;
                    if (button_value.includes("{{")) {
                        button.example = [
                            button_value.replace(/\{\{\d+\}\}/g, "example_value"),
                        ];
                    }
                }
                components.push({
                    type: "BUTTONS",
                    buttons: [button],
                });
            }
            const requestBody = {
                name,
                language,
                category,
                components,
            };
            if (waba_id)
                requestBody.wabaId = waba_id;
            if (allow_category_change !== undefined) {
                requestBody.allowCategoryChange = allow_category_change;
            }
            const data = await apiRequest("/v2/platforms/whatsapp/templates", "POST", requestBody, undefined, "integrations");
            return toolResult(data);
        }
        catch (error) {
            return toolError(`Failed to create template: ${error.message}`);
        }
    });
    // --- Update template ---
    server.registerTool("update_template", {
        title: "Update WhatsApp Template",
        description: "Update an existing WhatsApp template. Only the components can be modified.",
        inputSchema: {
            name: z.string().describe("Template name"),
            language: z.string().describe("Language code"),
            waba_id: z.string().describe("WhatsApp Business Account ID"),
            components: z
                .string()
                .describe("Updated components as JSON string (array of component objects)"),
            category: z
                .enum(["TRANSACTIONAL", "MARKETING", "AUTHENTICATION"])
                .optional()
                .describe("New category"),
        },
        annotations: {
            readOnlyHint: false,
            destructiveHint: false,
            openWorldHint: true,
        },
    }, async ({ name, language, waba_id, components, category }) => {
        try {
            let parsedComponents;
            try {
                parsedComponents = JSON.parse(components);
            }
            catch {
                return toolError("Invalid JSON in components parameter");
            }
            const body = {
                wabaId: waba_id,
                components: parsedComponents,
            };
            if (category)
                body.category = category;
            const data = await apiRequest(`/v2/platforms/whatsapp/templates/${name}/${language}`, "PUT", body, undefined, "integrations");
            return toolResult(data);
        }
        catch (error) {
            return toolError(`Failed to update template: ${error.message}`);
        }
    });
    // --- Delete template (all languages) ---
    server.registerTool("delete_template", {
        title: "Delete Template",
        description: "Delete a WhatsApp template and ALL its language variants. This action cannot be undone.",
        inputSchema: {
            name: z.string().describe("Template name to delete"),
        },
        annotations: {
            readOnlyHint: false,
            destructiveHint: true,
            openWorldHint: true,
        },
    }, async ({ name }) => {
        try {
            await apiRequest(`/v3/platforms/whatsapp/templates/${name}`, "DELETE", undefined, undefined, "integrations");
            return toolResult({ deleted: true, name });
        }
        catch (error) {
            return toolError(`Failed to delete template: ${error.message}`);
        }
    });
    // --- Delete specific template variant ---
    server.registerTool("delete_template_variant", {
        title: "Delete Template Variant",
        description: "Delete a specific language variant of a WhatsApp template. This action cannot be undone.",
        inputSchema: {
            name: z.string().describe("Template name"),
            language: z.string().describe("Language code to delete (e.g. en, pt_BR)"),
        },
        annotations: {
            readOnlyHint: false,
            destructiveHint: true,
            openWorldHint: true,
        },
    }, async ({ name, language }) => {
        try {
            await apiRequest(`/v3/platforms/whatsapp/templates/${name}/${language}`, "DELETE", undefined, undefined, "integrations");
            return toolResult({ deleted: true, name, language });
        }
        catch (error) {
            return toolError(`Failed to delete template variant: ${error.message}`);
        }
    });
}
