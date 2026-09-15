#!/usr/bin/env node
// @check-role: on-change
// @check-guards: scripts/probe.mjs
//
// check-probe.mjs — scripts/probe.mjs 의 계약 테스트.
//
// 무엇을 지키는 검사인가:
//   probe 는 "브라우저에서만 보이던 실패가 터미널에 나타나는가"를 위해 있다. 그래서 이 도구가
//   고장 나는 모양은 에러가 아니라 **조용한 침묵**이다 — 페이지에 콘솔 에러가 있는데 출력에
//   안 적히거나, 404 가 났는데 한 줄도 안 뜨거나, 응답 본문이 빠져서 상태 코드만 남는다.
//   셋 다 "잡힌 것 없음"으로 읽히고, 그건 정상 통과와 겉이 같다.
//
//   그래서 검사는 **실패를 일부러 내는 페이지를 띄워 놓고** probe 가 그것들을 집어내는지 본다.
//   테스트 서버는 이 파일이 직접 띄운다(node 기본 http 모듈, 외부 의존성 없음).
//
//   **없는 것만 확인하는 항목을 두지 않는다.** "실패 표시가 없다"만 보면 아무 일도 안 일어난
//   실행이 제일 깨끗해 보인다. 무엇이 실제로 일어났다는 증거를 같은 항목에 넣는다.
//
// 쓰는 법:
//   node scripts/check-probe.mjs
//
// 브라우저를 띄우므로 수십 초가 걸린다. playwright 나 브라우저 바이너리가 없으면 A0 이 그것을
// 맨 앞에서 잡는다 — 그 경우 나머지 항목의 빨간불은 probe 의 결함이 아니라 환경 문제다.

import { createServer } from "node:http";
import { spawn } from "node:child_process";
import { existsSync, rmSync, mkdtempSync, statSync } from "node:fs";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { tmpdir } from "node:os";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const PROBE = join(ROOT, "scripts", "probe.mjs");
const CHILD_TIMEOUT = 60000;

const results = [];
const check = (id, cond, okMsg, badMsg) => results.push({ id, pass: !!cond, msg: cond ? okMsg : badMsg });

// ── 일부러 실패를 내는 페이지 ────────────────────────────────────────────
// 심은 위반 여섯: 콘솔 에러(문자열) / 콘솔 에러(객체 인자) / 처리되지 않은 거부 /
//                잡히지 않은 예외 / 404(본문 있음) / 콘솔 경고.
// 정상 요청(200)과 조용한 콘솔(log)도 같이 넣는다 — probe 가 그것까지 실패로 세면 그것도 고장이다.
const BROKEN_HTML = `<!doctype html><meta charset="utf-8"><title>깨진 페이지</title>
<body><h1 id="hello">깨진 페이지</h1><button id="go">눌러</button>
<script>
console.log("이건 조용한 줄이다");
console.warn("느린 응답 경고");
console.error("BOOM-CONSOLE 설정을 읽지 못했다");
console.error("객체가 붙은 줄", { where: "settings", inner: { code: "BOOM-DEEP" } });
Promise.reject(new Error("BOOM-REJECT 아무도 안 받은 거부"));
fetch("/api/missing").then(r => r.text()).catch(() => {});
fetch("/api/ok").then(r => r.text()).catch(() => {});
document.getElementById("go").addEventListener("click", () => {
  const el = document.createElement("div");
  el.id = "clicked";
  el.textContent = "눌렸다";
  document.body.appendChild(el);
});
setTimeout(() => { throw new Error("BOOM-PAGEERROR 렌더 중 터졌다"); }, 10);
</script></body>`;

const CLEAN_HTML = `<!doctype html><meta charset="utf-8"><title>멀쩡한 페이지</title>
<body><h1>멀쩡한 페이지</h1><script>console.log("조용하다");</script></body>`;

function startServer() {
  return new Promise((ok) => {
    const server = createServer((req, res) => {
      const path = (req.url ?? "/").split("?")[0];
      if (path === "/broken") {
        res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
        res.end(BROKEN_HTML);
      } else if (path === "/clean") {
        res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
        res.end(CLEAN_HTML);
      } else if (path === "/api/ok") {
        res.writeHead(200, { "content-type": "application/json" });
        res.end(JSON.stringify({ ok: true }));
      } else if (path === "/api/missing") {
        res.writeHead(404, { "content-type": "application/json" });
        res.end(JSON.stringify({ error: "BOOM-BODY 그런 자리가 없다" }));
      } else {
        res.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
        res.end("없다");
      }
    });
    server.listen(0, "127.0.0.1", () => ok({ server, port: server.address().port }));
  });
}

// 확실히 아무도 안 듣는 포트를 얻는다. `port + 1` 은 옆 번호가 비어 있길 바라는 것이라,
// 누가 쓰고 있으면 검사가 이유 없이 빨개지고 65535 였으면 엉뚱한 근거로 통과한다.
function closedPort() {
  return new Promise((ok) => {
    const s = createServer();
    s.listen(0, "127.0.0.1", () => {
      const p = s.address().port;
      s.close(() => ok(p));
    });
  });
}

// 자식 프로세스를 **비동기로** 돌린다. spawnSync 를 쓰면 이 프로세스의 이벤트 루프가 멈춰서
// 위의 테스트 서버가 요청에 응답하지 못한다 — 그러면 probe 쪽은 전부 "페이지를 열지 못했다"가
// 되고, 검사는 그걸 probe 의 고장으로 읽는다.
// (2026-09-15 실측: 열일곱 항목 중 열이 그렇게 깨졌고, 나머지 일곱은 빈손으로 통과했다)
function runProbe(args) {
  return new Promise((ok) => {
    const child = spawn(process.execPath, [PROBE, ...args], { cwd: ROOT, timeout: CHILD_TIMEOUT });
    let out = "";
    let err = "";
    child.stdout.on("data", (d) => (out += d));
    child.stderr.on("data", (d) => (err += d));
    // error 이벤트를 안 받으면 spawn 실패가 예외로 던져지고, 그때까지 모은 결과가
    // 보고도 없이 통째로 사라진다.
    child.on("error", (e) => ok({ status: -1, out, err: `${err}${e.message}` }));
    child.on("close", (status) => ok({ status, out, err }));
  });
}

const tmpDir = mkdtempSync(join(tmpdir(), "check-probe-"));
const shot = join(tmpDir, "shot.png");
const forbiddenShot = join(tmpDir, "must-not-exist.png");
const { server, port } = await startServer();
const base = `http://127.0.0.1:${port}`;

try {
  // ── A0. 환경 ────────────────────────────────────────────────────────
  //    브라우저가 없으면 아래 대부분이 빨개지는데, 그건 probe 의 결함이 아니다.
  //    구분이 안 되면 "11/17" 같은 숫자를 놓고 엉뚱한 코드를 뜯게 된다.
  const smoke = await runProbe([`${base}/clean`, "--no-shot", "--settle", "100"]);
  const toolBroke = /관측 도구가 실패했다/.test(smoke.out);
  check("A0 브라우저", !toolBroke,
    "playwright 와 브라우저 바이너리가 있다",
    `브라우저를 띄우지 못했다 — 아래 빨간불은 probe 의 결함이 아니라 환경 문제다. 'npx playwright install chromium':\n${smoke.out}`);

  check("A1 파일", existsSync(PROBE), "scripts/probe.mjs 가 있다", "scripts/probe.mjs 가 없다 — 지키는 대상이 사라졌다");

  // ── B~H. 심은 위반이 출력에 나타나는가 ───────────────────────────────
  const broken = await runProbe([`${base}/broken`, "--out", shot, "--settle", "600"]);

  check("B 콘솔 에러", broken.out.includes("BOOM-CONSOLE"),
    "페이지의 console.error 가 출력에 적힌다",
    `console.error 가 출력에 없다 — 브라우저에서만 보이는 실패가 그대로 숨는다:\n${broken.out}`);

  // **한 겹 안쪽** 값을 본다. Chromium 이 만드는 미리보기는 얕아서 중첩된 객체가 `Object` 로만
  // 찍힌다(m.text() 실측: "{code: OBJ-CODE, deep: Object}"). 겉만 보면 인자를 안 풀어도
  // 통과해서 이 항목이 아무것도 증명하지 않는다 — 2026-09-15 에 심어 보고 확인했다.
  check("B2 객체 인자", broken.out.includes("BOOM-DEEP") && !/JSHandle@/.test(broken.out),
    "객체를 실은 console.error 가 중첩된 값까지 풀려서 적힌다",
    `객체 인자의 안쪽이 사라졌다 (미리보기는 'deep: Object' 까지만 보여 준다) — 원인 값이 안 보인다:\n${broken.out}`);

  check("C 페이지 예외", broken.out.includes("BOOM-PAGEERROR"),
    "잡히지 않은 예외가 출력에 적힌다",
    `잡히지 않은 예외가 출력에 없다:\n${broken.out}`);

  check("C2 처리 안 된 거부", broken.out.includes("BOOM-REJECT"),
    "아무도 안 받은 Promise 거부가 출력에 적힌다 — 실제 앱에서 가장 흔한 실패 모양이다",
    `처리되지 않은 거부가 출력에 없다:\n${broken.out}`);

  check("D 실패한 요청", /404/.test(broken.out) && broken.out.includes("/api/missing"),
    "404 로 돌아온 요청이 상태 코드와 함께 적힌다",
    `404 요청이 출력에 없다:\n${broken.out}`);

  check("E 응답 본문", broken.out.includes("BOOM-BODY"),
    "실패 응답의 본문이 같이 적힌다 — 상태 코드만으로는 다음 수정 방향이 안 정해진다",
    `실패 응답 본문이 빠졌다 — 401 이 '로그인 안 됨'인지 '정책 없음'인지 못 가린다:\n${broken.out}`);

  check("F 경고", broken.out.includes("느린 응답 경고"),
    "console.warn 도 적힌다",
    `console.warn 이 빠졌다:\n${broken.out}`);

  check("G 스크린샷", existsSync(shot) && statSync(shot).size > 0 && broken.out.includes(shot),
    "스크린샷을 지정한 자리에 남기고(빈 파일이 아니다) 경로를 알린다",
    `스크린샷이 없거나 비었거나 경로를 안 알렸다:\n${broken.out}`);

  check("H 판정 안 함", broken.status === 0,
    "실패를 잔뜩 관측하고도 종료 코드는 0 이다 — 판정은 qa 의 일이다",
    `종료 코드가 ${broken.status} 다. 관측 도구가 판정을 하면 부르는 자리가 이것을 게이트로 쓴다`);

  // ── I~J. 멀쩡한 페이지를 실패로 읽지 않는가 ──────────────────────────
  //    잡는 쪽만 보면 "전부 에러라고 적는 도구"도 B~H 를 통과한다.
  check("I 조용한 페이지", smoke.out.includes("잡힌 것 없음"),
    "멀쩡한 페이지에는 잡힌 것이 없다고 적는다",
    `멀쩡한 페이지를 실패로 읽었다 — 늘 빨간 도구는 아무도 안 본다:\n${smoke.out}`);

  check("J 조용한 콘솔 집계", /콘솔 그 밖: .*log/.test(smoke.out),
    "console.log 는 건수로만 적는다 — 에러 자리를 안 채운다",
    `조용한 콘솔 집계 줄이 없다:\n${smoke.out}`);

  // ── K~L. 동작을 시키는 자리 ─────────────────────────────────────────
  //    "못 한 동작이 없다"만 보면 클릭·대기 옵션이 통째로 무시된 실행도 초록이다.
  //    그래서 시킨 동작이 실제로 기록됐는지를 --json 으로 직접 본다(있음을 보는 단언).
  const clicked = await runProbe([`${base}/broken`, "--no-shot", "--settle", "300", "--json", "--click", "#go", "--wait", "#clicked"]);
  let steps = null;
  try {
    steps = JSON.parse(clicked.out).steps;
  } catch {
    steps = null;
  }
  const didClick = Array.isArray(steps) && steps.some((s) => s.kind === "click" && s.target === "#go" && s.ok === true);
  const didWait = Array.isArray(steps) && steps.some((s) => s.kind === "wait" && s.target === "#clicked" && s.ok === true);
  check("K 클릭·대기", didClick && didWait,
    "#go 를 눌러 #clicked 가 생긴 것이 steps 에 성공으로 기록된다",
    `클릭·대기가 기록되지 않았다 (클릭 ${didClick} · 대기 ${didWait}). steps=${JSON.stringify(steps)}\n${clicked.err}`);

  check("K2 JSON 온전함", steps !== null && clicked.out.trim().endsWith("}"),
    "--json 출력이 잘리지 않고 끝까지 나온다",
    `--json 출력이 깨졌거나 잘렸다 (${clicked.out.length}자, 끝: ${JSON.stringify(clicked.out.slice(-40))})`);

  const missSel = await runProbe([`${base}/clean`, "--no-shot", "--settle", "200", "--timeout", "1200", "--wait", "#없는요소"]);
  check("L 못 한 동작", /못 한 동작 1건/.test(missSel.out) && missSel.status === 0,
    "없는 요소를 기다리면 '못 한 동작'으로 적힌다 — 조용히 넘어가지 않는다",
    `없는 요소를 기다렸는데 아무 말이 없다 (종료 ${missSel.status}):\n${missSel.out}`);

  // ── M~N. 열리지 않는 주소 ───────────────────────────────────────────
  //    페이지가 안 뜨는 것도 관측 결과다. 도구가 조용히 끝나면 그게 제일 나쁘다.
  const dead = await runProbe([`http://127.0.0.1:${await closedPort()}/`, "--no-shot", "--timeout", "2000"]);
  check("M 안 열리는 주소", /페이지를 열지 못했다/.test(dead.out),
    "열리지 않는 주소를 '열지 못했다'로 적는다",
    `열리지 않는 주소에 아무 말이 없다:\n${dead.out}`);
  check("N 안 열려도 판정 안 함", dead.status === 0,
    "열리지 않아도 종료 코드는 0 이다",
    `종료 코드가 ${dead.status} 다`);

  // ── O~P. 쓰는 법이 틀린 것은 관측 결과와 구분한다 ─────────────────────
  const noUrl = await runProbe([]);
  check("O 인자 오류", noUrl.status === 2 && /URL 이 없다/.test(noUrl.err),
    "URL 없이 부르면 종료 코드 2 로 쓰는 법을 알린다",
    `URL 없이 불렀는데 종료 ${noUrl.status} 다 — 관측 결과와 구분이 안 된다:\n${noUrl.err}`);
  const badUrl = await runProbe(["localhost:3000"]);
  check("P 주소 형식", badUrl.status === 2 && /URL 은 http\(s\) 여야 한다/.test(badUrl.err),
    "http(s) 가 아닌 주소를 거른다",
    `스킴 없는 주소를 그대로 받았다 (종료 ${badUrl.status}):\n${badUrl.err}`);

  // ── Q. 스크린샷을 안 찍으라면 안 찍는다 ──────────────────────────────
  //    파일 개수 같은 간접 지표로는 확인이 안 된다 — --out 을 안 주면 스크린샷은
  //    기본 경로로 떨어지므로, --no-shot 을 통째로 무시해도 임시 폴더는 그대로다.
  const noShot = await runProbe([`${base}/clean`, "--no-shot", "--out", forbiddenShot, "--settle", "200"]);
  check("Q --no-shot", !existsSync(forbiddenShot) && !/▣ 스크린샷/.test(noShot.out),
    "--no-shot 은 --out 을 같이 줘도 파일을 만들지 않고 스크린샷 줄도 안 적는다",
    `--no-shot 인데 찍었다 (파일 ${existsSync(forbiddenShot)}):\n${noShot.out}`);

  // ── R. 검사가 놓친 것이 stderr 로 새지 않았나 ────────────────────────
  const noisy = [["broken", broken], ["clean", smoke], ["clicked", clicked]].filter(([, r]) => r.err.trim() !== "");
  check("R stderr", noisy.length === 0,
    "정상 실행은 stderr 에 아무것도 안 쓴다 — 판정은 stdout 만 본다",
    `stderr 에 뭔가 나왔다: ${noisy.map(([n, r]) => `${n}: ${r.err.trim().split("\n")[0]}`).join(" / ")}`);
} finally {
  server.closeAllConnections?.();
  server.close();
  rmSync(tmpDir, { recursive: true, force: true });

  let failed = 0;
  for (const r of results) {
    if (r.pass) console.log(`  ok  ${r.id} — ${r.msg}`);
    else {
      failed += 1;
      console.log(`FAIL  ${r.id} — ${r.msg}`);
    }
  }
  console.log(`\n${results.length - failed}/${results.length} 통과`);
  process.exitCode = failed === 0 ? 0 : 1;
}
