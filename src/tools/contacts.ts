import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { apiRequest, toolResult, toolError } from "../client.js";

export function registerContactTools(server: McpServer) {
  // --- List contacts ---
  server.registerTool(
    "list_contacts",
    {
      title: "List Contacts",
      description: "List all contacts in the MessageBird account.",
      inputSchema: {
        offset: z.string().optional().describe("Number of items to skip"),
        limit: z.string().optional().describe("Max items per page"),
      },
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        openWorldHint: true,
      },
    },
    async ({ offset, limit }) => {
      try {
        const data = await apiRequest(
          "/contacts",
          "GET",
          undefined,
          { offset, limit },
          "rest",
        );
        return toolResult(data);
      } catch (error) {
        return toolError(`Failed to list contacts: ${(error as Error).message}`);
      }
    },
  );

  // --- Get contact ---
  server.registerTool(
    "get_contact",
    {
      title: "Get Contact",
      description:
        "Get details of a specific contact by ID, phone number (msisdn), or name.",
      inputSchema: {
        contact_id: z.string().optional().describe("Contact ID"),
        msisdn: z
          .string()
          .optional()
          .describe("Phone number to look up (E.164 format)"),
        name: z.string().optional().describe("Contact name to search"),
      },
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        openWorldHint: true,
      },
    },
    async ({ contact_id, msisdn, name }) => {
      try {
        if (contact_id) {
          const data = await apiRequest(
            `/contacts/${contact_id}`,
            "GET",
            undefined,
            undefined,
            "rest",
          );
          return toolResult(data);
        }

        const params: Record<string, string | undefined> = {};
        if (msisdn) params.msisdn = msisdn;
        if (name) params.name = name;

        const data = await apiRequest(
          "/contacts",
          "GET",
          undefined,
          params,
          "rest",
        );
        return toolResult(data);
      } catch (error) {
        return toolError(`Failed to get contact: ${(error as Error).message}`);
      }
    },
  );

  // --- Create contact ---
  server.registerTool(
    "create_contact",
    {
      title: "Create Contact",
      description: "Create a new contact with a phone number.",
      inputSchema: {
        msisdn: z
          .string()
          .describe("Phone number in E.164 format (e.g. +5511999999999)"),
        first_name: z.string().optional().describe("Contact first name"),
        last_name: z.string().optional().describe("Contact last name"),
        custom1: z.string().optional().describe("Custom field 1"),
        custom2: z.string().optional().describe("Custom field 2"),
        custom3: z.string().optional().describe("Custom field 3"),
        custom4: z.string().optional().describe("Custom field 4"),
      },
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        openWorldHint: true,
      },
    },
    async ({ msisdn, first_name, last_name, custom1, custom2, custom3, custom4 }) => {
      try {
        const body: Record<string, unknown> = { msisdn };
        if (first_name) body.firstName = first_name;
        if (last_name) body.lastName = last_name;
        if (custom1) body.custom1 = custom1;
        if (custom2) body.custom2 = custom2;
        if (custom3) body.custom3 = custom3;
        if (custom4) body.custom4 = custom4;

        const data = await apiRequest("/contacts", "POST", body, undefined, "rest");
        return toolResult(data);
      } catch (error) {
        return toolError(`Failed to create contact: ${(error as Error).message}`);
      }
    },
  );

  // --- Update contact ---
  server.registerTool(
    "update_contact",
    {
      title: "Update Contact",
      description: "Update an existing contact's information.",
      inputSchema: {
        contact_id: z.string().describe("Contact ID to update"),
        msisdn: z.string().optional().describe("New phone number"),
        first_name: z.string().optional().describe("New first name"),
        last_name: z.string().optional().describe("New last name"),
        custom1: z.string().optional().describe("Custom field 1"),
        custom2: z.string().optional().describe("Custom field 2"),
        custom3: z.string().optional().describe("Custom field 3"),
        custom4: z.string().optional().describe("Custom field 4"),
      },
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        openWorldHint: true,
      },
    },
    async ({ contact_id, msisdn, first_name, last_name, custom1, custom2, custom3, custom4 }) => {
      try {
        const body: Record<string, unknown> = {};
        if (msisdn) body.msisdn = msisdn;
        if (first_name) body.firstName = first_name;
        if (last_name) body.lastName = last_name;
        if (custom1) body.custom1 = custom1;
        if (custom2) body.custom2 = custom2;
        if (custom3) body.custom3 = custom3;
        if (custom4) body.custom4 = custom4;

        const data = await apiRequest(
          `/contacts/${contact_id}`,
          "PATCH",
          body,
          undefined,
          "rest",
        );
        return toolResult(data);
      } catch (error) {
        return toolError(`Failed to update contact: ${(error as Error).message}`);
      }
    },
  );

  // --- Delete contact ---
  server.registerTool(
    "delete_contact",
    {
      title: "Delete Contact",
      description:
        "Permanently delete a contact. This action cannot be undone.",
      inputSchema: {
        contact_id: z.string().describe("Contact ID to delete"),
      },
      annotations: {
        readOnlyHint: false,
        destructiveHint: true,
        openWorldHint: true,
      },
    },
    async ({ contact_id }) => {
      try {
        await apiRequest(
          `/contacts/${contact_id}`,
          "DELETE",
          undefined,
          undefined,
          "rest",
        );
        return toolResult({ deleted: true, id: contact_id });
      } catch (error) {
        return toolError(`Failed to delete contact: ${(error as Error).message}`);
      }
    },
  );
}
