#!/usr/bin/env node
// 시안(mockups) 미리보기용 정적 서버.
//
// 왜 파일을 그냥 안 여나: Playwright MCP 가 file: 프로토콜을 막는다("Access to file: protocol is blocked").
// 그래서 시안을 브라우저로 열어 확인(대비 실측·스크린샷)하려면 http 로 서빙해야 한다.
// 사람이 더블클릭해서 보는 데는 필요 없다 — 이 스크립트는 '검증하는 쪽'을 위한 것.
//
// 사용:
//   node scripts/preview.mjs <프로젝트명>        # projects/<이름>/docs/design/mockups 를 4321 포트로
//   node scripts/preview.mjs <프로젝트명> 5000   # 포트 지정
//   node scripts/preview.mjs --dir <경로> [포트]  # 임의 디렉터리
//
// 백그라운드로 띄우고, 확인이 끝나면 끈다.

import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import { join, extname, resolve, normalize } from "node:path";

const TYPES = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".woff2": "font/woff2",
};

const args = process.argv.slice(2);
if (args.length === 0 || args[0] === "--help" || args[0] === "-h") {
  console.error("사용: node scripts/preview.mjs <프로젝트명> [포트]  |  node scripts/preview.mjs --dir <경로> [포트]");
  process.exit(1);
}

let root, port;
if (args[0] === "--dir") {
  root = resolve(args[1] ?? ".");
  port = Number(args[2] ?? 4321);
} else {
  root = resolve("projects", args[0], "docs", "design", "mockups");
  port = Number(args[1] ?? 4321);
}

try {
  const s = await stat(root);
  if (!s.isDirectory()) throw new Error("디렉터리가 아님");
} catch {
  console.error(`서빙할 디렉터리가 없다: ${root}`);
  console.error("시안이 아직 없거나 프로젝트명이 틀렸다 (projects/<이름>/docs/design/mockups).");
  process.exit(1);
}

const server = createServer(async (req, res) => {
  // 경로 탈출 차단: 정규화 후 root 밖이면 거부
  const rel = decodeURIComponent((req.url ?? "/").split("?")[0]);
  const target = normalize(join(root, rel));
  if (!target.startsWith(root)) {
    res.writeHead(403).end("forbidden");
    return;
  }
  try {
    let file = target;
    const s = await stat(file).catch(() => null);
    if (s?.isDirectory()) file = join(file, "index.html");
    const buf = await readFile(file);
    res.writeHead(200, {
      "content-type": TYPES[extname(file).toLowerCase()] ?? "application/octet-stream",
      "cache-control": "no-store",   // 시안은 계속 고쳐가며 보므로 캐시 금지
    });
    res.end(buf);
  } catch {
    res.writeHead(404).end("not found");
  }
});

server.listen(port, () => {
  console.log(`시안 미리보기: http://localhost:${port}/`);
  console.log(`서빙 중: ${root}`);
});
