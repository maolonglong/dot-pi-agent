import { randomUUID } from "node:crypto";
import { mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { FooterComponent, getAgentDir, type ExtensionAPI, type ExtensionContext } from "@earendil-works/pi-coding-agent";
import { visibleWidth } from "@earendil-works/pi-tui";

export default function (pi: ExtensionAPI) {
	const agentDir = getAgentDir();
	const configPath = join(agentDir, "fast.json");
	const readPreference = (): boolean => {
		let text: string;
		try {
			text = readFileSync(configPath, "utf8");
		} catch (error) {
			if ((error as NodeJS.ErrnoException).code === "ENOENT") return false;
			throw error;
		}
		const config = JSON.parse(text);
		if (!config || typeof config !== "object" || Array.isArray(config) || typeof config.enabled !== "boolean") {
			throw new Error("fast.json must contain a boolean enabled field.");
		}
		return config.enabled;
	};
	let enabled = false;
	let footerContext: ExtensionContext | undefined;
	let restoreFooter: (() => void) | undefined;
	const supportsFast = (ctx: ExtensionContext) =>
		ctx.model?.provider === "openai" ||
		(ctx.model?.provider === "magpie" && ctx.model.id.startsWith("codex/"));
	const updateStatus = (ctx: ExtensionContext) => {
		footerContext = ctx;
		if (ctx.mode === "tui") ctx.ui.setStatus("fast", undefined);
	};

	pi.registerCommand("fast", {
		description: "Toggle priority processing for OpenAI or Magpie codex models",
		handler: async (_args, ctx) => {
			if (!enabled && !supportsFast(ctx)) {
				if (ctx.hasUI) ctx.ui.notify("/fast requires an OpenAI model or a Magpie codex/ model.", "warning");
				return;
			}
			const next = !enabled;
			try {
				// Refuse to overwrite a config that became invalid since startup.
				readPreference();
				mkdirSync(agentDir, { recursive: true });
				const temporaryPath = join(agentDir, `.fast-${randomUUID()}.tmp`);
				try {
					writeFileSync(temporaryPath, `${JSON.stringify({ enabled: next }, null, 2)}\n`, { flag: "wx", mode: 0o600 });
					renameSync(temporaryPath, configPath);
				} finally {
					rmSync(temporaryPath, { force: true });
				}
			} catch (error) {
				if (ctx.hasUI) ctx.ui.notify(`Could not save ${configPath}: ${error instanceof Error ? error.message : String(error)}`, "error");
				return;
			}
			enabled = next;
			updateStatus(ctx);
			if (ctx.hasUI) ctx.ui.notify(`Fast ${enabled ? "enabled" : "disabled"}.`, "info");
		},
	});

	pi.on("session_start", (_event, ctx) => {
		try {
			enabled = readPreference();
		} catch (error) {
			enabled = false;
			if (ctx.hasUI) ctx.ui.notify(`Fast disabled: could not read ${configPath}: ${error instanceof Error ? error.message : String(error)}`, "warning");
		}
		updateStatus(ctx);
		restoreFooter?.();
		restoreFooter = undefined;
		if (ctx.mode !== "tui") return;

		// shortcut: Pi has no model-label hook; revisit when the footer exposes one.
		const render = FooterComponent.prototype.render;
		const renderWithFast = function (this: FooterComponent, width: number): string[] {
			const lines = render.call(this, width);
			const current = footerContext;
			if (!enabled || current?.mode !== "tui" || !supportsFast(current)) return lines;
			const badge = current.ui.theme.fg("accent", " • fast");
			const badgeWidth = visibleWidth(badge);
			if (width <= badgeWidth) return lines;
			const compact = render.call(this, width - badgeWidth);
			const level = current.thinkingLevel ?? "off";
			const modelLabel = current.model!.id + (current.model!.reasoning ? ` • ${level === "off" ? "thinking off" : level}` : "");
			if (compact[1]?.includes(modelLabel)) lines[1] = compact[1] + badge;
			return lines;
		};
		FooterComponent.prototype.render = renderWithFast;
		restoreFooter = () => {
			if (FooterComponent.prototype.render === renderWithFast) FooterComponent.prototype.render = render;
		};
	});
	pi.on("session_shutdown", () => {
		restoreFooter?.();
		restoreFooter = undefined;
	});
	pi.on("model_select", (_event, ctx) => updateStatus(ctx));
	pi.on("before_provider_request", (event, ctx) => {
		if (!supportsFast(ctx) || !event.payload || typeof event.payload !== "object" || Array.isArray(event.payload)) return;
		return { ...event.payload, service_tier: enabled ? "priority" : "default" };
	});
}
