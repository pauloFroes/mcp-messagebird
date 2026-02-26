#!/usr/bin/env node
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { registerMessagingTools } from "./tools/messaging.js";
import { registerConversationTools } from "./tools/conversations.js";
import { registerTemplateTools } from "./tools/templates.js";
import { registerContactTools } from "./tools/contacts.js";
const server = new McpServer({
    name: "mcp-messagebird",
    version: "1.0.0",
});
registerMessagingTools(server);
registerConversationTools(server);
registerTemplateTools(server);
registerContactTools(server);
async function main() {
    const transport = new StdioServerTransport();
    await server.connect(transport);
    console.error("mcp-messagebird server running on stdio");
}
main().catch((error) => {
    console.error("Fatal error:", error);
    process.exit(1);
});
