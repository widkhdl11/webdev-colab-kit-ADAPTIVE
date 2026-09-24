#!/usr/bin/env node
//
// report-serve.mjs — 대시보드를 띄운다. 정적 서버 + 브라우저 열기를 명령 하나로.
//
//   node scripts/report-serve.mjs [--project <slug>] [--port 4321] [--no-open]
//
// 읽기 전용이 원칙이고 쓰기 경로는 **하나뿐이다** — 판정 검토의 답
// (POST /api/review-samples/<주차>, report-contract 13·14절). 검증은 scripts/lib/review-answer.mjs 가 한다.
//
// 왜 정적 서버가 필요한가: index.html 이 <script type="module"> 로 render.mjs 를 읽고
// fetch 로 json 을 읽는데, file:// 에서는 둘 다 막힌다.
// 의존성 없음 — node 기본 http 모듈만 쓴다.

import { createServer } from "node:http";
import { readFile, stat, writeFile, rename } from "node:fs/promises";
import { readFileSync } from "node:fs";
import { join, dirname, resolve, extname, normalize, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";
import { WEEK_RE, WRITE_PATH_RE, MAX_BODY_BYTES, isLocalRequest, isLocalHost, isClosed, validateAnswer, applyAnswer } from "./lib/review-answer.mjs";

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
// --report-dir 는 테스트(projects/signal/tests/verdict-review-server.test.ts)가 임시 디렉터리로 띄울 때만 쓴다.
const DIR = arg("report-dir") ? resolve(arg("report-dir")) : join(ROOT, "projects", slug, "report");
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

// 쓰기를 한 줄로 세운다(verdict-review INV-VR4). 빠르게 두 번 누르면 두 요청이 같은 옛 내용을
// 읽고 각자 쓰는데, 그러면 뒤의 쓰기가 앞의 답을 지운다.
let writeQueue = Promise.resolve();

function readBody(req) {
  return new Promise((ok, fail) => {
    const chunks = [];
    let size = 0;
    req.on("data", (c) => {
      size += c.length;
      if (size > MAX_BODY_BYTES) { fail(new Error("too large")); req.destroy(); return; }
      chunks.push(c);
    });
    req.on("end", () => ok(Buffer.concat(chunks).toString("utf-8")));
    req.on("error", fail);
  });
}

const sendJson = (res, status, obj) => {
  res.writeHead(status, { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" });
  res.end(JSON.stringify(obj));
};

/** 판정 검토의 답 하나. 검증에 실패하면 파일에 손대지 않는다. */
async function handleAnswer(req, res, week) {
  if (!isLocalRequest(req.headers, PORT, req.socket.remoteAddress)) { sendJson(res, 403, { error: "이 화면에서 온 요청이 아니다" }); return; }
  if (!String(req.headers["content-type"] ?? "").toLowerCase().startsWith("application/json")) {
    sendJson(res, 415, { error: "application/json 만 받는다" }); return;
  }
  if (!WEEK_RE.test(week)) { sendJson(res, 400, { error: "주차 형식이 아니다" }); return; }
  let raw;
  try { raw = await readBody(req); } catch { sendJson(res, 413, { error: "본문이 너무 크다" }); return; }
  const file = join(DIR, "review-samples", `${week}.json`);
  const job = writeQueue.then(async () => {
    let sample;
    try { sample = JSON.parse(await readFile(file, "utf-8")); } catch { return [404, { error: "그 주의 표본이 없다" }]; }
    let summary = [];
    try {
      summary = (await readFile(join(DIR, "review-summary.jsonl"), "utf-8")).split(/\r?\n/)
        .filter((l) => l.trim()).flatMap((l) => { try { return [JSON.parse(l)]; } catch { return []; } });
    } catch { /* 집계 줄이 아직 없다 */ }
    const closing = await stat(join(DIR, "review-samples", `${week}.closing`)).then(() => true, () => false);
    const v = validateAnswer(sample, raw, isClosed(sample, summary, Date.now(), closing));
    if (!v.ok) return [v.status, { error: v.error }];
    const next = applyAnswer(sample, v, new Date().toISOString());
    // 임시 파일에 쓰고 이름을 바꾼다 — 쓰다가 죽어도 반쯤 쓴 JSON 이 남지 않는다.
    const tmp = `${file}.${process.pid}.tmp`;
    await writeFile(tmp, JSON.stringify(next, null, 2) + "\n", "utf-8");
    // Windows 는 백신·색인기가 파일을 잠깐 잡고 있으면 이름 바꾸기가 EPERM 으로 실패한다. 몇 번만 다시 한다.
    for (let i = 0; ; i += 1) {
      try { await rename(tmp, file); break; } catch (e) {
        if (i >= 4 || (e.code !== "EPERM" && e.code !== "EBUSY" && e.code !== "EACCES")) throw e;
        await new Promise((r) => setTimeout(r, 50 * (i + 1)));
      }
    }
    return [200, next];
  });
  writeQueue = job.catch(() => {});
  try { const [status, body] = await job; sendJson(res, status, body); }
  catch { sendJson(res, 500, { error: "쓰기에 실패했다" }); }
}

const server = createServer(async (req, res) => {
  // 모든 응답: 다른 사이트가 이 화면을 투명한 틀에 넣고 클릭을 유도하면(클릭재킹) 요청이 이 화면에서
  // 나가므로 Origin 검사가 통과한다 — 틀에 넣는 것 자체를 막는다.
  res.setHeader("x-frame-options", "DENY");
  res.setHeader("content-security-policy", "frame-ancestors 'none'");
  res.setHeader("x-content-type-options", "nosniff");
  // 읽기도 Host 를 본다 — 127.0.0.1 바인딩만으로는 DNS 재바인딩한 외부 페이지가 활동 기록을 읽어 간다.
  if (!isLocalHost(req.headers, PORT, req.socket.remoteAddress)) { res.writeHead(403).end(); return; }
  if (req.method !== "GET" && req.method !== "HEAD") {
    const m = WRITE_PATH_RE.exec((req.url ?? "").split("?")[0]);
    if (req.method === "POST" && m) { await handleAnswer(req, res, m[1]); return; }
    res.writeHead(405, { allow: "GET, HEAD" }).end();
    return;
  }
  let decoded;
  try { decoded = decodeURIComponent((req.url ?? "/").split("?")[0]); } catch { res.writeHead(400).end(); return; }
  const rel = normalize(decoded).replace(/^[\\/]+/, "");
  const path = join(DIR, rel === "" ? "index.html" : rel);
  // report/ 밖으로는 나가지 않는다 — 이 서버는 로컬이지만 경로 조작에 문을 열어 둘 이유가 없다.
  // 구분자까지 붙여 비교한다: 앞부분만 보면 옆 폴더 `report-old/` 도 안쪽으로 통과한다.
  const base = resolve(DIR);
  if (resolve(path) !== base && !resolve(path).startsWith(base + sep)) { res.writeHead(403).end("nope"); return; }
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
