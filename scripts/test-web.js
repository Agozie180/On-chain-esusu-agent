// Smoke-test the configured static output, or a deployed URL passed on the command line.
const assert = require("node:assert/strict");
const fs = require("node:fs");
const http = require("node:http");
const path = require("node:path");
const vm = require("node:vm");

async function main() {
  let server;
  let base = process.argv[2];
  if (!base) {
    const config = require("../vercel.json");
    const root = path.resolve(__dirname, "..", config.outputDirectory || ".");
    server = http.createServer((req, res) => {
      const pathname = new URL(req.url, "http://localhost").pathname;
      const file = path.resolve(root, "." + (pathname === "/" ? "/index.html" : pathname));
      if (!file.startsWith(root + path.sep) || !fs.existsSync(file) || !fs.statSync(file).isFile()) {
        res.writeHead(404); return res.end();
      }
      res.setHeader("Content-Type", file.endsWith(".html") ? "text/html" : "text/javascript");
      res.end(fs.readFileSync(file));
    });
    await new Promise((resolve, reject) => {
      server.once("error", reject);
      server.listen(0, "127.0.0.1", resolve);
    });
    base = `http://127.0.0.1:${server.address().port}/`;
  }

  try {
    const get = async (pathname, status, type) => {
      const response = await fetch(new URL(pathname, base), { signal: AbortSignal.timeout(30000) });
      assert.equal(response.status, status, `${pathname}: expected HTTP ${status}`);
      if (type) assert.match(response.headers.get("content-type") || "", type, `${pathname}: wrong content type`);
      console.log(`PASS ${pathname}: HTTP ${status}`);
      return response.text();
    };
    const html = await get("/", 200, /text\/html/);
    assert.match(html, /id="btnConnect"/, "the homepage must be the dapp");
    const scripts = [...html.matchAll(/<script\b[^>]*\bsrc="([^"]+)"/g)]
      .map((match) => match[1]).filter((src) => new URL(src, base).origin === new URL(base).origin);
    assert(scripts.length > 0, "the homepage must reference its local scripts");
    const context = vm.createContext({ window: {} });
    for (const src of scripts) {
      const body = await get(src, 200, /(?:java|ecma)script/);
      const script = new vm.Script(body, { filename: src });
      if (["config.js", "contracts.js", "risk.js"].includes(src)) script.runInContext(context, { timeout: 1000 });
    }
    assert.equal(context.window.ESUSU_CONFIG.chainId, 420420777);
    assert.match(context.window.ESUSU_CONFIG.registry, /^0x[0-9a-fA-F]{40}$/);
    for (const name of ["circle", "vault", "registry"]) {
      assert(context.window.ESUSU[name].abi.length > 0, `${name}: missing ABI`);
      assert.match(context.window.ESUSU[name].bytecode, /^0x[0-9a-fA-F]+$/, `${name}: missing bytecode`);
    }
    assert.equal(typeof context.window.POLICY.assessCircle, "function");
    await get("/package.json", 404);
    await get("/agent/agent.js", 404);
    console.log("Static deployment smoke test passed.");
  } finally {
    if (server) await new Promise((resolve) => server.close(resolve));
  }
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
