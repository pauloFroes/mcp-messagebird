import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { apiRequest, toolResult, toolError } from "../client.js";

export function registerAccountTools(server: McpServer) {
  // --- Get balance ---
  server.registerTool(
    "get_balance",
    {
      title: "Get Balance",
      description:
        "Get the current balance of the MessageBird account. Returns the payment " +
        "model (prepaid/postpaid), the currency type (e.g. BRL, euros), and the " +
        "amount available. For postpaid accounts the amount is always 0.",
      inputSchema: {},
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        openWorldHint: true,
      },
    },
    async () => {
      try {
        const data = await apiRequest(
          "/balance",
          "GET",
          undefined,
          undefined,
          "rest",
        );
        return toolResult(data);
      } catch (error) {
        return toolError(`Failed to get balance: ${(error as Error).message}`);
      }
    },
  );
}
