# AGENTS.md

This repo **is** `~/.pi/agent` — the live config directory for the [pi coding agent CLI](https://github.com/earendil-works/pi-coding-agent). There is no build or lint setup; changes take effect on the next pi launch. Treat edits as modifying a running tool's config, not a deployable app.

## Verification

- `npm run typecheck` — type-checks `extensions/` with `tsc --noEmit` (see `tsconfig.json`). Run it after editing any extension. `typescript` and `@types/node` are devDependencies; `npm install` restores them.

## Git: whitelist, not blacklist

`.gitignore` starts with `*` and re-includes only an explicit whitelist (see the file itself for the list). Everything else (`settings.json`, `auth.json`, `sessions/`, ...) is **local-only and untracked**. To track a new file, edit `.gitignore` first — `git add` alone will silently no-op.

## Layout & entrypoints

- `package.json` `pi` field registers `./extensions` and `./themes` with pi. Adding a new top-level extension requires no registration beyond placing the `.ts` file in `extensions/`.
- `extensions/*.ts` — pi extensions. Each file's default export is `(pi: ExtensionAPI) => void`, importing from `@earendil-works/pi-coding-agent`. Those `@earendil-works/*` packages are **peerDependencies** (`*`); run `npm install` after cloning so TypeScript/types resolve.
- `extensions/subagent/` — a directory-style extension (`index.ts` entry). Subagents are Markdown with YAML frontmatter (`name`, `description`, `tools`, `model`). Runtime discovery reads `~/.pi/agent/agents/` (user, i.e. the untracked `agents/` at this repo's root — **this is where the real custom agents live**) and `.pi/agents/` (project); project overrides user on name collision. `extensions/subagent/agents/*.md` are only bundled examples, not the active set.
- `intercepted-commands/` — shell shims prepended to `PATH` by the `uv.ts` extension. `pip`/`pip3`/`poetry` are hard-blocked with uv alternatives; `python`/`python3` redirect through `uv run`. When editing behavior, keep the shim scripts and `uv.ts`'s spawn-time blocking in sync — the shims alone are bypassable via explicit interpreter paths.

## Commits

- Use Conventional Commits: `<type>(<scope>): <summary>` — imperative, <= 72 chars, no trailing period, no sign-offs.
- **Always write a commit body** explaining the *why* (bullets welcome), not just the *what*.
- Only commit, never push. Stage only intended files — respect the whitelist `.gitignore`.

## Don'ts

- **Don't edit auto-generated extensions** — regenerate them with their owning tool instead:
  - `extensions/herdr-agent-state.ts` ← `herdr integration install pi`
  - `extensions/rtk.ts` ← `rtk init -g --agent pi`
- **Don't add rewrite rules to `extensions/rtk.ts`.** It delegates to the external `rtk rewrite` binary (requires rtk >= 0.23.0); rewrite rules live in rtk's Rust registry, not here.
- Don't commit anything under `sessions/`, `npm/`, `node_modules/`, or credential files — the whitelist should already prevent this; if `git status` shows them, the `.gitignore` was broken.
