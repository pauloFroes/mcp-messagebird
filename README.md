# mcp-messagebird

MCP server that wraps the [MessageBird Conversations API](https://developers.messagebird.com/api/conversations/) as semantic tools for LLM agents. Send and receive WhatsApp messages, manage templates, and handle contacts.

Works with **Claude Code**, **Codex**, **Claude Desktop**, **Cursor**, **VS Code**, **Windsurf**, and any MCP-compatible client.

---

## Prerequisites

- Node.js 18+
- MessageBird API key ([get one here](https://dashboard.messagebird.com))

| Variable | Where to find |
| -------- | ------------- |
| `MESSAGEBIRD_API_KEY` | Dashboard → Developers → API access |

## Installation

### Claude Code

Three installation scopes are available:

| Scope | Flag | Config file | Use case |
|-------|------|-------------|----------|
| **local** | `-s local` | `.mcp.json` | This project only (default) |
| **project** | `-s project` | `.claude/mcp.json` | Shared with team via git |
| **user** | `-s user` | `~/.claude/mcp.json` | All your projects |

**Quick setup (inline env vars):**

```bash
claude mcp add messagebird -s user \
  -e MESSAGEBIRD_API_KEY=your-key \
  -- npx -y github:pauloFroes/mcp-messagebird
```

> Replace `-s user` with `-s local` or `-s project` as needed.

**Persistent setup (.env file):**

Add to your `.mcp.json`:

```json
{
  "messagebird": {
    "command": "npx",
    "args": ["-y", "github:pauloFroes/mcp-messagebird"],
    "env": {
      "MESSAGEBIRD_API_KEY": "${MESSAGEBIRD_API_KEY}"
    }
  }
}
```

Then define the values in your `.env` file:

```
MESSAGEBIRD_API_KEY=your-api-key
```

> See `.env.example` for all required variables.

### Codex

Add to your Codex configuration:

```toml
[mcp_servers.messagebird]
command = "npx"
args = ["-y", "github:pauloFroes/mcp-messagebird"]
env_vars = ["MESSAGEBIRD_API_KEY"]
```

### Claude Desktop

Add to `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "messagebird": {
      "command": "npx",
      "args": ["-y", "github:pauloFroes/mcp-messagebird"],
      "env": {
        "MESSAGEBIRD_API_KEY": "your-key"
      }
    }
  }
}
```

### Cursor

Add to `~/.cursor/mcp.json`:

```json
{
  "mcpServers": {
    "messagebird": {
      "command": "npx",
      "args": ["-y", "github:pauloFroes/mcp-messagebird"],
      "env": {
        "MESSAGEBIRD_API_KEY": "your-key"
      }
    }
  }
}
```

### VS Code

Add to `.vscode/mcp.json` in your project:

```json
{
  "servers": {
    "messagebird": {
      "command": "npx",
      "args": ["-y", "github:pauloFroes/mcp-messagebird"],
      "env": {
        "MESSAGEBIRD_API_KEY": "your-key"
      }
    }
  }
}
```

### Windsurf

Add to `~/.codeium/windsurf/mcp_config.json`:

```json
{
  "mcpServers": {
    "messagebird": {
      "command": "npx",
      "args": ["-y", "github:pauloFroes/mcp-messagebird"],
      "env": {
        "MESSAGEBIRD_API_KEY": "your-key"
      }
    }
  }
}
```

## Available Tools

### Messaging

| Tool | Description |
|------|-------------|
| `send_text` | Send a WhatsApp text message |
| `send_media` | Send image, video, audio, or file |
| `send_location` | Send a location with coordinates |
| `send_template` | Send a pre-approved template (HSM) message |
| `send_interactive_buttons` | Send quick reply buttons (max 3) |
| `send_interactive_list` | Send selectable list menu |

### Conversations

| Tool | Description |
|------|-------------|
| `list_conversations` | List conversation threads with filters (see below) |
| `get_conversation` | Get conversation details by ID |
| `update_conversation` | Update conversation status (active/archived) |
| `list_conversation_messages` | List messages in a conversation |
| `get_message` | Get a specific message |
| `reply_to_conversation` | Send a reply in an existing conversation |
| `list_messages` | Fetch messages by `ids` or recent `from` window (max 5 min) |

#### `list_conversations` filters

| Param | Values | Notes |
|-------|--------|-------|
| `status` | `active` (default), `archived`, `all` | Native Conversations API lifecycle filter. **Not** Inbox ticket status. |
| `ids` | comma-separated (max 20) | Fetch specific conversations |
| `offset` / `limit` | pagination | API max `limit` = 20 |
| `waiting_for_reply` | `true` / `false` | Intelligent filter: active threads where the **contact spoke last** and **no human Inbox agent** has replied yet. Flow Builder auto-replies (`origin=flows`) do **not** clear waiting state. |
| `scan_limit` | 1–100 (default 40) | Only with `waiting_for_reply`: how many recent active conversations to inspect |

**Important:** Conversations API has no assignee/ticket field. `waiting_for_reply` is the supported way to answer “client is waiting for a human”. Human reply = `origin=inbox` with a real `source.agentId` (not “Inbox Automation”).

### Templates

| Tool | Description |
|------|-------------|
| `list_templates` | List all WhatsApp message templates |
| `get_template` | Get template details by name and language |
| `create_template` | Create a new template for Meta approval |
| `update_template` | Update an existing template |
| `delete_template` | Delete template and all language variants |
| `delete_template_variant` | Delete a specific language variant |

### Contacts

| Tool | Description |
|------|-------------|
| `list_contacts` | List all contacts |
| `get_contact` | Get contact by ID, phone, or name |
| `create_contact` | Create a new contact |
| `update_contact` | Update contact information |
| `delete_contact` | Permanently delete a contact |

### Account

| Tool | Description |
|------|-------------|
| `get_balance` | Get the account balance (payment model, currency, and amount) |

## Authentication

Uses MessageBird API Key authentication. The key is passed via the `Authorization: AccessKey {key}` header on every request. The API key is set as the `MESSAGEBIRD_API_KEY` environment variable at installation time.

## License

MIT
