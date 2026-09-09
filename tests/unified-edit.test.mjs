import assert from "node:assert/strict";
import fs from "node:fs/promises";
import { syncBuiltinESMExports } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import register from "../extensions/unified-edit.ts";

let tool;
register({ registerTool(definition) { tool = definition; } });

async function workspace(t, initial) {
	const cwd = await fs.mkdtemp(join(tmpdir(), "unified-edit-test-"));
	t.after(() => fs.rm(cwd, { recursive: true, force: true }));
	for (const [path, contents] of Object.entries(initial)) await fs.writeFile(join(cwd, path), contents);
	return {
		cwd,
		read: (path) => fs.readFile(join(cwd, path), "utf8"),
		run: (text, signal) => tool.execute("test", tool.prepareArguments(text), signal, undefined, { cwd }),
	};
}

function patch(path, hunks) {
	return `*** Begin Patch\n*** Update File: ${path}\n${hunks}\n*** End Patch`;
}

// Inject an external edit exactly between planning and the locked mutation read.
function changeBeforeMutation(t, path, contents) {
	const readFile = fs.readFile;
	let reads = 0;
	fs.readFile = async function (target, ...args) {
		if (target === path && ++reads === 2) await fs.writeFile(path, contents);
		return readFile.call(this, target, ...args);
	};
	syncBuiltinESMExports();
	t.after(() => {
		fs.readFile = readFile;
		syncBuiltinESMExports();
	});
}

test("blank context targets the intended block rather than a similar block", async (t) => {
	const w = await workspace(t, { file: "head\n\ntail\nhead\ntail\n" });
	await w.run("[file]\n@REPLACE\n head\n \n-tail\n+new");
	assert.equal(await w.read("file"), "head\n\nnew\nhead\ntail\n");
});

test("row operations distinguish an empty file from a single blank line", async (t) => {
	const w = await workspace(t, { blank: "\n", empty: "" });
	await w.run("[blank]\n@DEL 1");
	assert.equal(await w.read("blank"), "");
	await assert.rejects(w.run("[empty]\n@DEL 1"), /file has 0 line/);
	await w.run("[empty]\n@INS.PRE 1\n+first");
	assert.equal(await w.read("empty"), "first\n");
});

test("normal row and patch edits preserve BOM and CRLF", async (t) => {
	const w = await workspace(t, { file: "\uFEFFold\r\nkeep\r\n" });
	await w.run("[file]\n@REPLACE\n-old\n+new");
	await w.run(patch("file", "@@\n-new\n+patched\n keep"));
	assert.equal(await w.read("file"), "\uFEFFpatched\r\nkeep\r\n");
});

test("mutation rejects concurrent changes instead of fuzzy matching the snapshot", async (t) => {
	const w = await workspace(t, { file: "old\n" });
	changeBeforeMutation(t, join(w.cwd, "file"), "old  \n");
	await assert.rejects(w.run("[file]\n@REPLACE\n-old\n+new"), /file changed since preflight/);
	assert.equal(await w.read("file"), "old  \n");
});

test("partial failure reports completed files without rolling them back", async (t) => {
	const w = await workspace(t, { a: "old\n", b: "old\n", c: "old\n" });
	changeBeforeMutation(t, join(w.cwd, "b"), "changed\n");
	await assert.rejects(
		w.run("[a]\n@REPLACE\n-old\n+new\n[b]\n@REPLACE\n-old\n+new\n[c]\n@REPLACE\n-old\n+new"),
		(error) => {
			assert.match(error.message, /Failed while applying b/);
			assert.match(error.message, /Already applied \(not rolled back\):\n- update a/);
			return true;
		},
	);
	assert.equal(await w.read("a"), "new\n");
	assert.equal(await w.read("b"), "changed\n");
	assert.equal(await w.read("c"), "old\n");
});

test("EOF hunks cannot revisit a region consumed by an earlier hunk", async (t) => {
	const w = await workspace(t, { file: "x\n" });
	await assert.rejects(w.run(patch("file", "@@\n-x\n+A\n@@\n-x\n+B\n*** End of File")), /Failed to find expected lines/);
	assert.equal(await w.read("file"), "x\n");
});

test("fuzzy patch context keeps original indentation and Unicode", async (t) => {
	const w = await workspace(t, { file: "  keep  \nold\n‘quote’\n" });
	await w.run(patch("file", "@@\n keep\n-old\n+new\n 'quote'"));
	assert.equal(await w.read("file"), "  keep  \nnew\n‘quote’\n");
});

test("patch context handles blank lines and missing final newline", async (t) => {
	const w = await workspace(t, { file: "  keep\n\nold" });
	await w.run(patch("file", "@@\n keep\n \n-old\n+new\n \n*** End of File"));
	assert.equal(await w.read("file"), "  keep\n\nnew\n");
});

test("same-position insertions retain script order", async (t) => {
	const w = await workspace(t, { file: "base\n" });
	await w.run(patch("file", "@@\n+A\n@@\n+B"));
	assert.equal(await w.read("file"), "base\nA\nB\n");
});

test("preflight errors and cancellation leave all files unchanged", async (t) => {
	const w = await workspace(t, { file: "old\n" });
	await assert.rejects(w.run("[file]\n@REPLACE\n-old\n+new\n[missing]\n@DEL 1"), /Could not read missing/);
	await assert.rejects(w.run("[file]\n@REPLACE\n-old\n+new", AbortSignal.abort()), /Operation aborted/);
	assert.equal(await w.read("file"), "old\n");
});
