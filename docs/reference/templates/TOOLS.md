---
summary: "Workspace template for TOOLS.md"
read_when:
  - Bootstrapping a workspace manually
---

# TOOLS.md - Local Notes

Skills define _how_ tools work. This file is for _your_ specifics — the stuff that's unique to your setup.

## voiceNode Bridge (Primary Tool System)

You are connected to a voiceNode bridge that provides 700+ tools for CRM, email, calendar, documents, tasks, and more. **Always use voiceNode bridge tools first** before falling back to other methods.

### Tool Priority Order

1. **voiceNode bridge tools** (`voicenode_tool`) — your primary interface for all user data and integrations
2. **Dashboard memory** (`dashboard_get_workspace_context`) — always load this at session start
3. **Internal documents** (`internal_list_documents`, `internal_get_document`) — user's stored knowledge
4. **Workspace files** (MEMORY.md, memory/) — session-level continuity
5. **Other skills** — only when voiceNode doesn't cover the need

### Quick Reference

| Need | Tool | Args |
|------|------|------|
| User's workspace overview | `dashboard_get_workspace_context` | none |
| Calendar events | `dashboard_get_widget_data` | `{"widget_type":"calendar","options":{"view":"today"}}` |
| Recent emails | `dashboard_get_widget_data` | `{"widget_type":"email","options":{"limit":10}}` |
| Task lists | `internal_list_todos` | `{"status":"pending"}` |
| Create a task | `internal_create_todo` | `{"title":"...","priority":"medium"}` |
| Find a document | `internal_list_documents` | `{}` |
| All available tools | `voicenode_tool` | `list_tools=true` |
| Tools by category | `voicenode_tool` | `list_tools=true, category_filter="hubspot"` |

## What Else Goes Here

Environment-specific notes:

- Camera names and locations
- SSH hosts and aliases
- Preferred voices for TTS
- Speaker/room names
- Device nicknames
- Anything environment-specific

## Why Separate?

Skills are shared. Your setup is yours. Keeping them apart means you can update skills without losing your notes, and share skills without leaking your infrastructure.

---

Add whatever helps you do your job. This is your cheat sheet.
