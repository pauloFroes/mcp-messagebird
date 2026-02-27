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

```bash
claude mcp add messagebird -s user \
  -e MESSAGEBIRD_API_KEY=your-key \
  -- npx -y github:pauloFroes/mcp-messagebird
```

> Replace `-s user` with `-s local` or `-s project` as needed.

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
| `list_conversations` | List all conversation threads |
| `get_conversation` | Get conversation details by ID |
| `update_conversation` | Update conversation status (active/archived) |
| `list_conversation_messages` | List messages in a conversation |
| `get_message` | Get a specific message |
| `reply_to_conversation` | Send a reply in an existing conversation |
| `list_messages` | List messages across all conversations |

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

## Authentication

Uses MessageBird API Key authentication. The key is passed via the `Authorization: AccessKey {key}` header on every request. The API key is set as the `MESSAGEBIRD_API_KEY` environment variable at installation time.

## License

MIT
