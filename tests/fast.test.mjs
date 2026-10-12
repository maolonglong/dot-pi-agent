import assert from "node:assert/strict";
import fs from "node:fs";
import { chmod, mkdir, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { createRequire, syncBuiltinESMExports } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { pathToFileURL } from "node:url";
import { stripVTControlCharacters } from "node:util";

const piUrl = process.env.PI_PACKAGE_DIR
	? pathToFileURL(`${process.env.PI_PACKAGE_DIR}/dist/index.js`).href
	: import.meta.resolve("@earendil-works/pi-coding-agent");
const { FooterComponent, initTheme } = await import(piUrl);
const { theme } = await import(new URL("modes/interactive/theme/theme.js", piUrl));
const { loadExtensions } = await import(new URL("core/extensions/loader.js", piUrl));
const { visibleWidth } = await import(createRequire(piUrl).resolve("@earendil-works/pi-tui"));
initTheme();

async function setup(t, { initial, model } = {}) {
	const root = await mkdtemp(join(tmpdir(), "pi-fast-"));
	const agentDir = join(root, "agent");
	const configPath = join(agentDir, "fast.json");
	if (initial !== undefined) {
		await mkdir(agentDir);
		await writeFile(configPath, initial);
	}
	const previousAgentDir = process.env.PI_CODING_AGENT_DIR;
	process.env.PI_CODING_AGENT_DIR = agentDir;
	t.after(async () => {
		if (previousAgentDir === undefined) delete process.env.PI_CODING_AGENT_DIR;
		else process.env.PI_CODING_AGENT_DIR = previousAgentDir;
		await rm(root, { recursive: true, force: true });
	});
	const result = await loadExtensions([new URL("../extensions/fast.ts", import.meta.url).pathname], process.cwd());
	assert.deepEqual(result.errors, []);
	let extension = result.extensions[0];
	const notices = [];
	const statuses = new Map([["ponytail", "🐴 ponytail: ⚡ FULL"]]);
	const ctx = {
		model: { provider: "openai", id: "gpt-test", reasoning: true, contextWindow: 272000, ...model },
		thinkingLevel: "medium",
		mode: "tui",
		hasUI: true,
		ui: {
			theme,
			setStatus(key, value) { value === undefined ? statuses.delete(key) : statuses.set(key, value); },
			notify(message, level) { notices.push({ message, level }); },
		},
	};
	const session = {
		get state() { return { model: ctx.model, thinkingLevel: ctx.thinkingLevel }; },
		sessionManager: {
			getEntries: () => [], getEntryCount: () => 0, getSessionId: () => "test", getLeafId: () => null,
			getCwd: () => "/tmp/fast-test", getSessionName: () => undefined,
		},
		getContextUsage: () => ({ percent: 24.6, contextWindow: 272000 }),
		modelRuntime: { isUsingSubscription: () => false },
	};
	const footer = new FooterComponent(session, {
		getGitBranch: () => "main", getAvailableProviderCount: () => 1, getExtensionStatuses: () => statuses,
	});
	const event = async (name, data = {}) => {
		let result;
		for (const handler of extension.handlers.get(name) ?? []) result = await handler(data, ctx);
		return result;
	};
	const originalRender = FooterComponent.prototype.render;
	t.after(async () => {
		await event("session_shutdown");
		assert.equal(FooterComponent.prototype.render, originalRender);
	});
	await event("session_start");
	return {
		ctx, statuses, event, notices, agentDir, configPath,
		readConfig: async () => JSON.parse(await readFile(configPath, "utf8")),
		reload: async () => {
			await event("session_shutdown");
			const result = await loadExtensions([new URL("../extensions/fast.ts", import.meta.url).pathname], process.cwd());
			assert.deepEqual(result.errors, []);
			extension = result.extensions[0];
			await event("session_start");
		},
		render: (width = 100) => footer.render(width).map(stripVTControlCharacters),
		toggle: () => extension.commands.get("fast").handler("", ctx),
	};
}

test("toggles priority with fast beside the model and preserves the other footer rows", async (t) => {
	const app = await setup(t);
	const before = app.render();
	const payload = { model: "gpt-test", input: "test", service_tier: "auto" };
	assert.equal((await app.event("before_provider_request", { payload })).service_tier, "default");
	await app.toggle();
	const after = app.render();
	assert.match(after[1], /gpt-test • medium • fast$/);
	assert.equal(visibleWidth(after[1]), 100);
	assert.equal(after[0], before[0]);
	assert.equal(after[2], before[2]);
	assert.equal(app.statuses.has("fast"), false);
	assert.deepEqual(await app.event("before_provider_request", { payload }), { ...payload, service_tier: "priority" });
	assert.equal(payload.service_tier, "auto");
	await app.toggle();
	assert.deepEqual(app.render(), before);
	assert.equal((await app.event("before_provider_request", { payload })).service_tier, "default");
});

test("Magpie codex models support fast while other providers and models remain untouched", async (t) => {
	const app = await setup(t);
	app.ctx.model.id = "codex/gpt-6.1-sol";
	app.ctx.model.provider = "magpie";
	await app.toggle();
	assert.match(app.render()[1], /codex\/gpt-6\.1-sol • medium • fast$/);
	const payload = { model: app.ctx.model.id };
	assert.equal((await app.event("before_provider_request", { payload })).service_tier, "priority");
	for (const model of [{ provider: "magpie", id: "gpt-6.1-sol" }, { provider: "anthropic", id: "claude-test" }]) {
		app.ctx.model = { ...app.ctx.model, ...model };
		await app.event("model_select");
		assert.doesNotMatch(app.render()[1], / • fast$/);
		assert.equal(await app.event("before_provider_request", { payload }), undefined);
	}
	app.ctx.model = { ...app.ctx.model, provider: "magpie", id: "codex/gpt-6.1-sol" };
	await app.event("model_select");
	assert.match(app.render()[1], / • fast$/);
});

test("narrow terminals never overflow or put fast beside truncated model text", async (t) => {
	const app = await setup(t);
	await app.toggle();
	for (const width of [1, 7, 20, 40, 41, 42, 43, 44, 80, 100]) {
		const lines = app.render(width);
		for (const line of lines) assert.ok(visibleWidth(line) <= width, `${width}: ${line}`);
		if (lines[1].endsWith(" • fast")) assert.match(lines[1], /gpt-test • medium • fast$/);
	}
});

test("new sessions and reloaded extensions restore saved fast, while malformed payloads are ignored", async (t) => {
	const app = await setup(t);
	await app.toggle();
	assert.deepEqual(await app.readConfig(), { enabled: true });
	await app.event("session_start");
	assert.match(app.render()[1], / • fast$/);
	await app.reload();
	assert.match(app.render()[1], / • fast$/);
	await app.toggle();
	assert.deepEqual(await app.readConfig(), { enabled: false });
	await app.reload();
	assert.doesNotMatch(app.render()[1], / • fast$/);
	for (const payload of [null, undefined, "text", []]) assert.equal(await app.event("before_provider_request", { payload }), undefined);
});

test("request behavior works without terminal UI", async (t) => {
	const app = await setup(t);
	app.ctx.mode = "json";
	app.ctx.hasUI = false;
	app.ctx.ui = {};
	await app.toggle();
	assert.equal((await app.event("before_provider_request", { payload: {} })).service_tier, "priority");
});

test("missing configuration starts disabled without creating a file", async (t) => {
	const app = await setup(t);
	assert.doesNotMatch(app.render()[1], / • fast$/);
	await assert.rejects(readFile(app.configPath), { code: "ENOENT" });
	assert.deepEqual(app.notices, []);
});

test("saved preference is gated by the startup model and can be disabled on unsupported models", async (t) => {
	const app = await setup(t, {
		initial: '{"enabled":true}\n',
		model: { provider: "magpie", id: "gpt-6.1-sol" },
	});
	const payload = { model: app.ctx.model.id };
	assert.doesNotMatch(app.render()[1], / • fast$/);
	assert.equal(await app.event("before_provider_request", { payload }), undefined);
	assert.deepEqual(await app.readConfig(), { enabled: true });
	app.ctx.model.id = "codex/gpt-6.1-sol";
	await app.event("model_select");
	assert.match(app.render()[1], / • fast$/);
	assert.equal((await app.event("before_provider_request", { payload })).service_tier, "priority");
	app.ctx.model = { ...app.ctx.model, provider: "anthropic", id: "claude-test" };
	await app.event("model_select");
	await app.toggle();
	assert.deepEqual(await app.readConfig(), { enabled: false });
	await app.reload();
	app.ctx.model = { ...app.ctx.model, provider: "openai", id: "gpt-test" };
	await app.event("model_select");
	assert.doesNotMatch(app.render()[1], / • fast$/);
	assert.equal((await app.event("before_provider_request", { payload })).service_tier, "default");
});

test("unsupported models cannot enable fast or create configuration", async (t) => {
	const app = await setup(t, { model: { provider: "magpie", id: "gpt-6.1-sol" } });
	await app.toggle();
	await assert.rejects(readFile(app.configPath), { code: "ENOENT" });
	assert.equal(app.notices.at(-1).level, "warning");
	app.ctx.model.id = "codex/gpt-6.1-sol";
	await app.event("model_select");
	assert.doesNotMatch(app.render()[1], / • fast$/);
});

for (const initial of ['{broken', 'null', '[]', '{}', '{"enabled":"true"}']) {
	test(`invalid configuration is preserved and blocks writes: ${initial}`, async (t) => {
		const app = await setup(t, { initial });
		assert.doesNotMatch(app.render()[1], / • fast$/);
		assert.equal(app.notices.length, 1);
		assert.equal(app.notices[0].level, "warning");
		const payload = {};
		assert.equal((await app.event("before_provider_request", { payload })).service_tier, "default");
		assert.equal(app.notices.length, 1);
		await app.toggle();
		assert.equal(await readFile(app.configPath, "utf8"), initial);
		assert.equal(app.notices.at(-1).level, "error");
		assert.doesNotMatch(app.render()[1], / • fast$/);
		await writeFile(app.configPath, '{"enabled":false}\n');
		await app.toggle();
		assert.deepEqual(await app.readConfig(), { enabled: true });
	});
}

test("write failure preserves enabled state and saved file without temporary files", {
	skip: process.getuid?.() === 0,
}, async (t) => {
	const initial = '{"enabled":true}\n';
	const app = await setup(t, { initial });
	await chmod(app.agentDir, 0o500);
	try {
		await app.toggle();
		assert.equal(app.notices.at(-1).level, "error");
		assert.match(app.render()[1], / • fast$/);
		assert.equal(await readFile(app.configPath, "utf8"), initial);
		assert.deepEqual(await readdir(app.agentDir), ["fast.json"]);
	} finally {
		await chmod(app.agentDir, 0o700);
	}
});

test("rename failure cleans up the temporary file and preserves the previous preference", async (t) => {
	const initial = '{"enabled":true}\n';
	const app = await setup(t, { initial });
	const mock = t.mock.method(fs, "renameSync", (from, to) => {
		assert.equal(to, app.configPath);
		assert.equal(fs.existsSync(from), true);
		throw Object.assign(new Error("Injected rename failure"), { code: "EACCES" });
	});
	syncBuiltinESMExports();
	try {
		await app.toggle();
	} finally {
		mock.mock.restore();
		syncBuiltinESMExports();
	}
	assert.match(app.notices.at(-1).message, /Injected rename failure/);
	assert.equal(app.notices.at(-1).level, "error");
	assert.match(app.render()[1], / • fast$/);
	assert.equal(await readFile(app.configPath, "utf8"), initial);
	assert.deepEqual(await readdir(app.agentDir), ["fast.json"]);
});

test("configuration corrupted after startup cannot be overwritten by a toggle", async (t) => {
	const app = await setup(t);
	await app.toggle();
	await writeFile(app.configPath, "broken");
	await app.toggle();
	assert.equal(app.notices.at(-1).level, "error");
	assert.match(app.render()[1], / • fast$/);
	assert.equal(await readFile(app.configPath, "utf8"), "broken");
	await app.event("session_start");
	assert.doesNotMatch(app.render()[1], / • fast$/);
});

test("rapid toggles save the last preference and leave only the complete config file", async (t) => {
	const app = await setup(t);
	await Promise.all([app.toggle(), app.toggle(), app.toggle()]);
	assert.deepEqual(await app.readConfig(), { enabled: true });
	assert.deepEqual(await readdir(app.agentDir), ["fast.json"]);
	await app.reload();
	assert.match(app.render()[1], / • fast$/);
});

test("writes inspectable footer output at wide and narrow widths", async (t) => {
	const app = await setup(t);
	app.ctx.model = { ...app.ctx.model, provider: "magpie", id: "codex/gpt-6.1-sol" };
	const before = app.render(100);
	await app.toggle();
	const wide = app.render(100);
	const narrow = app.render(40);
	assert.match(wide[1], /codex\/gpt-6\.1-sol • medium • fast$/);
	assert.equal(wide[2], "🐴 ponytail: ⚡ FULL");
	await writeFile("/tmp/pi-fast-footer-preview.txt", `OFF (100 columns)\n${before.join("\n")}\n\nON (100 columns)\n${wide.join("\n")}\n\nON (40 columns)\n${narrow.join("\n")}\n`);
});
