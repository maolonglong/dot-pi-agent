# Subagent

Delegate a task to a specialized subagent with an isolated context window.

## Features

- **Isolated context**: Each subagent runs in a separate `pi` process
- **Streaming output**: See tool calls and progress as they happen
- **Markdown rendering**: Final output rendered with proper formatting (expanded view)
- **Usage tracking**: Shows turns, tokens, cost, and context usage
- **Abort support**: Ctrl+C propagates to kill the subagent process
- **Discovery injection**: Available subagents are listed in the system prompt as `<available_subagents>`, refreshed every turn

## Structure

```
subagent/
├── README.md            # This file
├── index.ts             # The extension (entry point)
├── agents.ts            # Agent discovery logic
└── agents/              # Sample agent definitions
    ├── scout.md         # Fast recon, returns compressed context
    ├── planner.md       # Creates implementation plans
    ├── reviewer.md      # Code review
    └── worker.md        # General-purpose (full capabilities)
```

## Usage

```
Use scout to find all authentication code
```

The main agent sees available subagents in `<available_subagents>` and calls the tool with `{ agent, task }`. The task must be self-contained — the subagent cannot see the parent conversation. Running subagents in parallel or in sequence is up to the main agent: it can emit multiple tool calls in one turn or call the tool across turns.

## Security Model

This tool executes a separate `pi` subprocess with a delegated system prompt and tool/model configuration.

**Project-local agents** (`.pi/agents/*.md`) are repo-controlled prompts that can instruct the model to read files, run bash commands, etc. When running interactively, the tool prompts for confirmation before running a project-local agent. Only approve for repositories you trust.

## Output Display

**Collapsed view** (default):
- Status icon (✓/✗) and agent name
- Last 10 items (tool calls and text)
- Usage stats: `3 turns ↑input ↓output RcacheRead WcacheWrite $cost ctx:contextTokens model`

**Expanded view** (Ctrl+O):
- Full task text
- All tool calls with formatted arguments
- Final output rendered as Markdown

**Tool call formatting** (mimics built-in tools):
- `$ command` for bash
- `read ~/path:1-10` for read
- `grep /pattern/ in ~/path` for grep
- etc.

## Agent Definitions

Agents are markdown files with YAML frontmatter:

```markdown
---
name: my-agent
description: What this agent does
tools: read, grep, find, ls
model: claude-haiku-4-5
---

System prompt for the agent goes here.
```

**Locations:**
- `~/.pi/agent/agents/*.md` - User-level
- `.pi/agents/*.md` - Project-level (nearest ancestor of cwd)

Project agents override user agents with the same name. Agents are discovered fresh on every turn, so edits take effect immediately.

## Sample Agents

| Agent | Purpose | Model | Tools |
|-------|---------|-------|-------|
| `scout` | Fast codebase recon | Haiku | read, grep, find, ls, bash |
| `planner` | Implementation plans | Sonnet | read, grep, find, ls |
| `reviewer` | Code review | Sonnet | read, grep, find, ls, bash |
| `worker` | General-purpose | Sonnet | (all default) |

## Error Handling

- **Exit code != 0**: Tool returns error with stderr/output
- **stopReason "error"**: LLM error propagated with error message
- **stopReason "aborted"**: User abort (Ctrl+C) kills the subprocess
- **Unknown agent**: Tool returns the list of available agent names

## Limitations

- Output truncated to last 10 items in collapsed view (expand to see all)
- Subagents run with `--no-session`; nothing is persisted between invocations
