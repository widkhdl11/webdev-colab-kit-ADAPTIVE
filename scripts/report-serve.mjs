#!/usr/bin/env node
//
// report-serve.mjs — 대시보드를 띄운다. 정적 서버 + 브라우저 열기를 명령 하나로.
//
//   node scripts/report-serve.mjs [--project <slug>] [--port 4321] [--no-open]
//
// 왜 정적 서버가 필요한가: index.html 이 <script type="module"> 로 render.mjs 를 읽고
// fetch 로 json 을 읽는데, file:// 에서는 둘 다 막힌다.
// 의존성 없음 — node 기본 http 모듈만 쓴다.

import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import { readFileSync } from "node:fs";
import { join, dirname, resolve, extname, normalize } from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const arg = (n) => {
  const i = process.argv.indexOf(`--${n}`);
  const v = i >= 0 ? process.argv[i + 1] : undefined;
  if (v !== undefined && v.startsWith("--")) {
    console.error(`--${n} 의 값이 빠졌다 (다음 인자가 ${v} 다).`);
    process.exit(2);
  }
  return v;
};
const slug = (arg("project") ?? (() => { try { return readFileSync(join(ROOT, "ACTIVE"), "utf-8").trim(); } catch { return ""; } })()).trim();
if (!slug) {
  console.error("프로젝트 slug 를 못 정했다. --project 로 주거나 루트 ACTIVE 를 채운다.");
  process.exit(2);
}
const DIR = join(ROOT, "projects", slug, "report");
const portArg = arg("port") ?? "4321";
const PORT = Number(portArg);
if (!Number.isInteger(PORT) || PORT < 1 || PORT > 65535) {
  console.error(`--port 값이 포트 번호가 아니다: ${portArg}`);
  process.exit(2);
}

// 127.0.0.1 에만 연다. 호스트를 안 주면 0.0.0.0 이 되어 같은 네트워크의 아무나 읽을 수 있는데,
// 이 서버가 내주는 activity.jsonl 에는 실행한 Bash 명령 원문이 들어간다. 로그인도 없다.
const HOST = "127.0.0.1";

const TYPES = { ".html": "text/html; charset=utf-8", ".mjs": "text/javascript; charset=utf-8",
                ".js": "text/javascript; charset=utf-8", ".json": "application/json; charset=utf-8",
                ".jsonl": "text/plain; charset=utf-8", ".css": "text/css; charset=utf-8" };

const server = createServer(async (req, res) => {
  const rel = normalize(decodeURIComponent((req.url ?? "/").split("?")[0])).replace(/^[\\/]+/, "");
  const path = join(DIR, rel === "" ? "index.html" : rel);
  // report/ 밖으로는 나가지 않는다 — 이 서버는 로컬이지만 경로 조작에 문을 열어 둘 이유가 없다
  if (!resolve(path).startsWith(resolve(DIR))) { res.writeHead(403).end("nope"); return; }
  try {
    if ((await stat(path)).isDirectory()) { res.writeHead(404).end(); return; }
    const body = await readFile(path);
    res.writeHead(200, { "content-type": TYPES[extname(path)] ?? "application/octet-stream", "cache-control": "no-store" });
    res.end(body);
  } catch {
    res.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
    res.end("없는 파일이다");
  }
});

function open(url) {
  if (process.argv.includes("--no-open")) return;
  const cmd = process.platform === "win32" ? ["cmd", ["/c", "start", "", url]]
            : process.platform === "darwin" ? ["open", [url]]
            : ["xdg-open", [url]];
  try { spawn(cmd[0], cmd[1], { detached: true, stdio: "ignore" }).unref(); } catch { /* 직접 열면 된다 */ }
}

// 그 포트에 이미 이 대시보드가 떠 있는가. workflow.json 이 우리 모양이면 맞다.
async function alreadyOurs(port) {
  try {
    const r = await fetch(`http://localhost:${port}/workflow.json`, { signal: AbortSignal.timeout(1500) });
    if (!r.ok) return false;
    const j = await r.json();
    return Array.isArray(j?.nodes) && Array.isArray(j?.edges);
  } catch {
    return false;
  }
}

// 포트가 잡혀 있을 때 스택 트레이스를 뱉지 않는다. 이 스크립트를 쓰는 사람이 알아야 하는 것은
// "주소가 무엇인가"지 어느 내부 함수에서 던져졌는가가 아니다.
// 이미 같은 대시보드가 떠 있으면 그 주소를 열어 주고 끝낸다 — 두 벌을 띄울 이유가 없다.
server.on("error", async (e) => {
  if (e.code !== "EADDRINUSE") {
    console.error(`서버를 못 띄웠다: ${e.message}`);
    process.exit(1);
  }
  const url = `http://localhost:${PORT}/`;
  if (await alreadyOurs(PORT)) {
    console.log(`이미 떠 있다: ${url}  (새로 띄우지 않았다)`);
    open(url);
    process.exit(0);
  }
  console.error(`포트 ${PORT} 을 다른 것이 쓰고 있다(이 대시보드가 아니다). 다른 포트로 띄운다:`);
  console.error(`  node scripts/report-serve.mjs --project ${slug} --port ${PORT + 1}`);
  process.exit(1);
});

server.listen(PORT, HOST, () => {
  const url = `http://localhost:${PORT}/`;
  console.log(`대시보드: ${url}  (projects/${slug}/report · Ctrl+C 로 끝낸다)`);
  open(url);
});
