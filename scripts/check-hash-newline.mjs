#!/usr/bin/env node
// @check-role: on-change
// @check-guards: gates/graph-stop.mjs
//
// check-hash-newline.mjs — 줄바꿈만 바뀐 파일이 산출물 해시를 바꾸는지 검사한다.
//
// 무엇을 푸는가:
//   `gates/graph-stop.mjs` 의 `hashNode` 가 파일을 **바이트 그대로** 해시한다. 이 레포는
//   `core.autocrlf=true` 로 돌아가서, 같은 내용이 디스크에서는 CRLF 이고 저장소에서는 LF 다.
//   그래서 내용이 한 글자도 안 바뀌어도 해시가 달라지는 경로가 있다:
//     · 에이전트가 heredoc 으로 쓴 파일은 LF, 그 파일을 커밋했다 다시 받으면 CRLF
//     · `git checkout`·`git stash`·클론을 거친 작업본
//   해시가 달라지면 노드가 dirty 가 되고, 사인오프 노드는 `basis` 불일치로 재리뷰를 요구한다.
//   **아무도 아무것도 안 고쳤는데 재리뷰가 걸린다.** 커밋을 자동으로 끊기 시작하면 이 경로를
//   매 커밋 밟는다 — 그래서 커밋 자동화보다 이것이 먼저다.
//
// 이 검사가 판정하는 것:
//   A1 줄바꿈만 바꾼 파일은 같은 해시다                        ← 패치 전 실패
//   A2 내용을 진짜로 바꾸면 해시가 달라진다                     ← 패치 전후 통과(반대 방향 그물)
//   A3 이진 파일은 깨지지 않는다 — 바이트가 보존된다            ← 패치 전후 통과
//   S1 프로브  심은 차이(글자 하나)를 A1 의 대조가 잡는다       ← 패치 전후 통과
//
// **A1 과 A2 가 같은 코드의 반대 방향이다.** A1 만 보면 "전부 같은 해시"로 만들어도 통과한다 —
// 그러면 무엇을 고쳐도 노드가 영영 clean 이라 이 하네스가 통째로 눈을 감는다.
//
// 어떻게 재나: 임시 폴더에 킷 사본과 가짜 프로젝트를 만들고 Stop 훅을 돌려서, 훅이 `HANDOFF.md`
// 에 적은 해시를 읽는다. 해시 함수는 훅 안에 있어서 따로 불러올 수 없다 — **실제로 도는 코드를
// 그대로 밟는 것이 요점이기도 하다**(자기 사본을 검사하면 실제 코드는 아무도 안 밟는다).
//
// 사용: node scripts/check-hash-newline.mjs
// 이 레포의 파일은 하나도 건드리지 않는다. 임시 폴더는 끝나면 지운다.

import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const results = [];
const ok = (id, what, pass, note = "") => results.push({ id, what, pass, note });

/** 임시 킷 하나. `product` 노드가 내놓는 문서를 주어진 바이트로 채운다. */
function runWith(bytes, extra = null) {
  const dir = mkdtempSync(join(tmpdir(), "hash-newline-"));
  try {
    cpSync(join(ROOT, "gates"), join(dir, "gates"), { recursive: true });
    cpSync(join(ROOT, "graph.mjs"), join(dir, "graph.mjs"));
    writeFileSync(join(dir, "ACTIVE"), "probe\n");
    const p = join(dir, "projects", "probe");
    mkdirSync(join(p, "docs"), { recursive: true });
    mkdirSync(join(p, "workspace"), { recursive: true });
    writeFileSync(join(p, "docs", "PRODUCT.md"), bytes);
    if (extra) writeFileSync(join(p, "docs", extra.name), extra.bytes);
    spawnSync(process.execPath, [join(dir, "gates", "graph-stop.mjs")], { cwd: dir, encoding: "utf-8" });
    const h = readFileSync(join(p, "workspace", "HANDOFF.md"), "utf-8").match(/```json\s*([\s\S]*?)```/);
    const state = h ? JSON.parse(h[1]) : {};
    const back = extra ? readFileSync(join(p, "docs", extra.name)) : null;
    return { hash: state?.product?.hash ?? null, echoed: back };
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

const BODY = "# probe\n첫 줄\n둘째 줄\n";
const lf = Buffer.from(BODY, "utf-8");
const crlf = Buffer.from(BODY.split("\n").join("\r\n"), "utf-8");
const changed = Buffer.from(BODY.replace("둘째", "셋째"), "utf-8");

const a = runWith(lf);
const b = runWith(crlf);
const c = runWith(changed);

ok("A1", "줄바꿈만 바꾼 파일은 같은 해시다", a.hash != null && a.hash === b.hash,
   `LF=${a.hash} CRLF=${b.hash} — 패치 미적용이면 둘이 다르다`);
ok("A2", "내용을 바꾸면 해시가 달라진다 — 전부 같게 만드는 쪽으로 새지 않는다",
   a.hash != null && c.hash != null && a.hash !== c.hash, `원본=${a.hash} 고친뒤=${c.hash}`);

// A3 — 이진 파일이 깨지지 않는다. utf-8 로 왕복시키면 0x80~0xFF 가 치환문자로 뭉개진다.
{
  const bin = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x00, 0x1a, 0x0d, 0x0a, 0xff, 0xfe, 0x0d, 0x0a]);
  const r = runWith(lf, { name: "probe.png", bytes: bin });
  ok("A3", "이진 파일의 바이트는 보존된다 — 해시를 뜨느라 파일을 고치지 않는다",
     r.echoed != null && Buffer.compare(r.echoed, bin) === 0, "이진 파일이 바뀌었다");
}

// S1 — 심어서 확인. A1 의 대조가 실제로 차이를 보는가(둘을 무조건 같다고 말하는 것이 아닌가).
{
  const planted = runWith(Buffer.from(BODY.replace("첫", "첫번"), "utf-8"));
  ok("S1", "프로브    심은 글자 하나를 A1 의 대조가 잡는다 — 되돌리면 다시 같아진다",
     planted.hash !== a.hash && runWith(lf).hash === a.hash,
     `심은뒤=${planted.hash} 원본=${a.hash}`);
}

let failed = 0;
for (const r of results) {
  console.log(`${r.pass ? "✓" : "✗"} ${r.id} ${r.what}${r.pass ? "" : `  → ${r.note}`}`);
  if (!r.pass) failed++;
}
const applied = results.find((r) => r.id === "A1")?.pass;
console.log(`\ncheck-hash-newline: ${results.length - failed}/${results.length} 통과` +
            (applied ? "" : "  (A1 실패 = 패치 미적용)"));
process.exit(failed > 0 ? 1 : 0);
