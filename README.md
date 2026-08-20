# dot-pi-agent

My personal configuration for [pi](https://github.com/earendil-works/pi), the coding agent CLI. This repo is what I actually use day to day — extensions, themes, and shims — checked into git so it's reproducible across machines.

## What's in here

Only a subset of `~/.pi/agent` is tracked (see [`.gitignore`](.gitignore)); the rest (auth tokens, session logs, model caches, etc.) is local-only.

```
extensions/            Pi extensions (TypeScript), loaded via package.json's `pi.extensions`
intercepted-commands/  Shell shims placed on PATH to redirect Python tooling to uv
themes/                Custom pi TUI theme(s)
package.json           Declares this repo as a pi package (extensions/skills/themes)
APPEND_SYSTEM.md        Extra system-prompt instructions appended to every session
settings.json           Personal pi settings (model, theme, packages, subagents...)
```

## Recommended plugins (installed via `pi install`)

These are not tracked in this repo — they're installed as npm packages and picked up from `~/.pi/agent/npm/node_modules`:

```bash
pi install npm:@ff-labs/pi-fff               # FFF-powered fuzzy file & content search
pi install npm:@juicesharp/rpiv-web-tools    # web search & fetch with pluggable providers
pi install npm:@juicesharp/rpiv-todo         # live todo overlay that survives /reload & compaction
pi install npm:@juicesharp/rpiv-btw          # /btw one-off side question without polluting the conversation
pi install npm:@juicesharp/rpiv-ask-user-question  # structured questionnaire tool with typed options
pi install npm:@tintinweb/pi-subagents            # Claude Code-style autonomous sub-agents
```

## Credits / sources

- [mitsuhiko/agent-stuff](https://github.com/mitsuhiko/agent-stuff)
- [pi's official extension examples](https://github.com/earendil-works/pi/tree/main/packages/coding-agent/examples/extensions)
- [rtk-ai/rtk](https://github.com/rtk-ai/rtk)
- [dmtrKovalenko/fff](https://github.com/dmtrKovalenko/fff)
- [juicesharp/rpiv-mono](https://github.com/juicesharp/rpiv-mono)
- [herdr](https://herdr.dev)

## Usage

This repo mirrors (parts of) `~/.pi/agent`. To use it:

```bash
git clone <this-repo> ~/.pi/agent
cd ~/.pi/agent
npm install
```

Pi will pick up `extensions/`, `themes/`, and `package.json`'s `pi` field automatically on next launch. Skills, sessions, credentials, and other machine-specific state are not part of this repo and are managed separately (see `.gitignore`).
