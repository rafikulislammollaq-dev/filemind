import { spawn } from "node:child_process";
import assert from "node:assert/strict";

function rpc(proc, msg) {
  proc.stdin.write(JSON.stringify(msg) + "\n");
}

function collect(proc, id, timeout = 10000) {
  return new Promise((resolve, reject) => {
    let buf = "";
    const timer = setTimeout(() => reject(new Error("timeout waiting for response " + id)), timeout);
    const onData = (chunk) => {
      buf += chunk.toString();
      const lines = buf.split("\n");
      for (const line of lines) {
        if (!line.trim()) continue;
        try {
          const obj = JSON.parse(line);
          if (obj.id === id) {
            clearTimeout(timer);
            proc.stdout.off("data", onData);
            resolve(obj);
            return;
          }
        } catch {}
      }
    };
    proc.stdout.on("data", onData);
  });
}

const proc = spawn("node", ["dist/index.js"], { stdio: ["pipe", "pipe", "pipe"] });
let passed = 0, failed = 0;
async function test(name, fn) {
  try { await fn(); console.log("PASS:", name); passed++; }
  catch (e) { console.log("FAIL:", name, "-", e.message); failed++; }
}

await test("initialize", async () => {
  rpc(proc, { jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2024-11-05", capabilities: {}, clientInfo: { name: "e2e", version: "1" } } });
  const r = await collect(proc, 1);
  assert.equal(r.result.serverInfo.name, "filemind");
});

await test("tools/list", async () => {
  rpc(proc, { jsonrpc: "2.0", id: 2, method: "tools/list", params: {} });
  const r = await collect(proc, 2);
  assert.ok(r.result.tools.length >= 13);
});

await test("identify_file via mcp", async () => {
  rpc(proc, { jsonrpc: "2.0", id: 3, method: "tools/call", params: { name: "identify_file", arguments: { path: "tests/fixtures/sample.png" } } });
  const r = await collect(proc, 3);
  const obj = JSON.parse(r.result.content[0].text);
  assert.equal(obj.detected.ext, "png");
});

await test("list_capabilities via mcp", async () => {
  rpc(proc, { jsonrpc: "2.0", id: 4, method: "tools/call", params: { name: "list_capabilities", arguments: {} } });
  const r = await collect(proc, 4);
  const obj = JSON.parse(r.result.content[0].text);
  assert.equal(obj.status, "ok");
});

proc.kill();
console.log(`\nE2E: ${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
PY