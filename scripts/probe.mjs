#!/usr/bin/env node
//
// probe.mjs — 브라우저에서만 보이는 실패를 터미널로 끌어오는 관측 도구.
//
// 무엇을 푸는가:
//   페이지가 깨져도 터미널에는 아무것도 안 뜬다. 콘솔 에러도, 401 로 돌아온 요청도
//   브라우저 안에서만 보인다. 그래서 에이전트는 "고쳤다"고 보고하고 사람이 화면을 열어
//   같은 실패를 발견하는 일이 반복된다. 이 스크립트는 그 셋(콘솔·실패한 요청·페이지 예외)을
//   읽어서 표준 출력에 적는다.
//
// 판정은 하지 않는다. 종료 코드는 언제나 0 이다 —
//   이건 수시로 부르는 관측 도구고, 통과/실패를 정하는 것은 qa 테스트의 일이다.
//   (예외: 인자를 잘못 줬을 때만 2. 그건 관측 결과가 아니라 쓰는 법이 틀린 것이다)
//
// 서버는 띄우지 않는다. 이미 도는 URL 을 받는다 — 가볍고 빨라야 하기 때문이다.
//
// 쓰는 법:
//   node scripts/probe.mjs <URL>
//   node scripts/probe.mjs http://localhost:3000/posts --click "button[type=submit]" --wait ".toast"
//
//   --click <선택자>    클릭한다. 여러 번 줄 수 있고 준 순서대로 누른다
//   --wait <선택자>     캡처 전에 이 요소가 나타날 때까지 기다린다 (한 번만)
//   --settle <ms>       로드 후 기다리는 시간 (기본 800). 늦게 뜨는 요청을 놓치지 않으려는 것
//   --timeout <ms>      이동·클릭·대기 한 번의 상한 (기본 15000)
//   --collect <ms>      응답 본문·콘솔 인자를 마저 받는 데 쓸 상한 (기본 2000)
//   --body-max <n>      실패 응답 본문을 몇 자까지 찍을지 (기본 400, 0 이면 본문을 안 읽는다)
//   --project <slug>    스크린샷을 둘 프로젝트 (기본: 루트 ACTIVE)
//   --out <경로>        스크린샷 경로를 직접 지정한다 (상대 경로는 지금 디렉터리 기준)
//   --no-shot           스크린샷을 찍지 않는다
//   --json              사람이 읽는 줄 대신 JSON 한 덩어리를 찍는다
//
// 실패 메시지에 응답 본문을 같이 싣는 이유: 상태 코드만으로는 다음 수정 방향이 안 정해진다.
// 401 이 "로그인 안 됨"인지 "RLS 정책 없음"인지는 본문에 적혀 있다.
//
// 계약 테스트: scripts/check-probe.mjs

import { mkdirSync, readFileSync } from "node:fs";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

const DEFAULTS = { settle: 800, timeout: 15000, bodyMax: 400, collect: 2000 };
const CONSOLE_LOUD = new Set(["error", "warning", "assert"]);

const firstLine = (e) => String(e?.message ?? e).split("\n")[0];
const sleep = (ms) => new Promise((ok) => setTimeout(ok, ms));

export function parseArgs(argv) {
  const out = { url: null, clicks: [], wait: null, shot: true, json: false, ...DEFAULTS, project: null, outPath: null };
  const need = (i, flag) => {
    const v = argv[i + 1];
    if (v === undefined || v.startsWith("--")) throw new Error(`--${flag} 의 값이 빠졌다`);
    return v;
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--click") out.clicks.push(need(i++, "click"));
    else if (a === "--wait") {
      // --click 은 쌓이는데 --wait 는 덮어쓰면, 둘을 준 사람은 앞의 것이 사라진 줄 모른다.
      if (out.wait !== null) throw new Error("--wait 는 한 번만 준다 (여러 개를 기다리려면 마지막 것 하나로 줄인다)");
      out.wait = need(i++, "wait");
    } else if (a === "--settle") out.settle = Number(need(i++, "settle"));
    else if (a === "--timeout") out.timeout = Number(need(i++, "timeout"));
    else if (a === "--collect") out.collect = Number(need(i++, "collect"));
    else if (a === "--body-max") out.bodyMax = Number(need(i++, "body-max"));
    else if (a === "--project") out.project = need(i++, "project");
    else if (a === "--out") out.outPath = need(i++, "out");
    else if (a === "--no-shot") out.shot = false;
    else if (a === "--json") out.json = true;
    else if (a.startsWith("--")) throw new Error(`모르는 옵션 ${a}`);
    else if (out.url === null) out.url = a;
    else throw new Error(`URL 을 둘 줬다 (${out.url}, ${a})`);
  }
  if (!out.url) throw new Error("URL 이 없다. 사용: node scripts/probe.mjs <URL> [옵션]");
  if (!/^https?:\/\//.test(out.url)) throw new Error(`URL 은 http(s) 여야 한다: ${out.url}`);
  for (const [k, v] of [["settle", out.settle], ["timeout", out.timeout], ["body-max", out.bodyMax], ["collect", out.collect]]) {
    if (!Number.isFinite(v) || v < 0) throw new Error(`--${k} 는 0 이상의 숫자여야 한다`);
  }
  return out;
}

function activeSlug() {
  try {
    return readFileSync(join(ROOT, "ACTIVE"), "utf-8").trim();
  } catch {
    return "";
  }
}

export function shotPath(opts, now = new Date()) {
  if (opts.outPath) return resolve(opts.outPath);
  const slug = (opts.project ?? activeSlug()).trim();
  const stamp = now.toISOString().replace(/[:.]/g, "-").replace("Z", "");
  const dir = slug ? join(ROOT, "projects", slug, "report", "probe") : join(ROOT, ".probe");
  return join(dir, `${stamp}.png`);
}

// 콘솔 줄의 인자를 실제 값으로 푼다.
// m.text() 는 객체·에러 인자를 `JSHandle@object` 로 돌려준다 — 원인 문자열이 통째로 사라지고
// "실패 JSHandle@object" 만 남는다. 에러가 아니라 내용이 비는 모양이라 제일 나쁜 고장이다.
async function expandConsole(m) {
  const args = m.args();
  if (!args.length) return null;
  const parts = await Promise.all(
    args.map((a) =>
      a
        .evaluate((v) => {
          if (v instanceof Error) return v.stack || String(v);
          if (typeof v === "object" && v !== null) {
            try {
              return JSON.stringify(v);
            } catch {
              return String(v);
            }
          }
          return String(v);
        })
        .catch(() => null),
    ),
  );
  const joined = parts.filter((p) => p !== null && p !== "").join(" ").trim();
  return joined || null;
}

// ── 관측 ──────────────────────────────────────────────────────────────
export async function runProbe(opts) {
  const { chromium } = await import("playwright");
  const found = {
    url: opts.url,
    status: null,
    navError: null,
    console: [],
    consoleQuiet: {},
    pageErrors: [],
    failedRequests: [],
    steps: [],
    shot: null,
    shotError: null,
    collectTimedOut: false,
    ms: 0,
  };
  const started = Date.now();
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  const jobs = []; // 나중에 도착하는 것들(응답 본문·콘솔 인자)을 마저 받을 자리

  page.on("console", (m) => {
    const type = m.type();
    if (!CONSOLE_LOUD.has(type)) {
      found.consoleQuiet[type] = (found.consoleQuiet[type] ?? 0) + 1;
      return;
    }
    const loc = m.location();
    // 먼저 자리를 잡아 순서를 지키고, 푼 값이 오면 그 자리를 채운다.
    const rec = { type, text: m.text(), at: loc?.url ? `${loc.url}:${loc.lineNumber ?? 0}:${loc.columnNumber ?? 0}` : null };
    found.console.push(rec);
    jobs.push(
      expandConsole(m)
        .then((t) => {
          if (t) rec.text = t;
        })
        .catch(() => {}),
    );
  });

  page.on("pageerror", (e) => {
    found.pageErrors.push({ message: firstLine(e), stack: String(e?.stack ?? "").split("\n").slice(1, 3).join(" / ") });
  });

  page.on("requestfailed", (req) => {
    found.failedRequests.push({
      kind: "failed",
      status: null,
      method: req.method(),
      url: req.url(),
      reason: req.failure()?.errorText ?? "요청이 끝나지 않았다",
      body: null,
    });
  });

  page.on("response", (res) => {
    if (res.status() < 400) return;
    const rec = { kind: "http", status: res.status(), method: res.request().method(), url: res.url(), reason: null, body: null };
    found.failedRequests.push(rec);
    if (opts.bodyMax === 0) return;
    // 본문은 늦게 온다. 여기서 await 하면 이벤트 처리가 페이지 진행을 붙잡으므로
    // 기다릴 자리를 모아 두고 마지막에 한 번에 받는다 (--collect 로 상한을 둔다).
    jobs.push(
      res
        .text()
        .then((t) => {
          const one = String(t).replace(/\s+/g, " ").trim();
          rec.body = one.length > opts.bodyMax ? `${one.slice(0, opts.bodyMax)}…` : one;
        })
        .catch(() => {
          rec.body = null;
        }),
    );
  });

  const step = async (kind, target, fn) => {
    try {
      await fn();
      found.steps.push({ kind, target, ok: true, detail: null });
    } catch (e) {
      found.steps.push({ kind, target, ok: false, detail: firstLine(e) });
    }
  };

  try {
    try {
      const res = await page.goto(opts.url, { waitUntil: "domcontentloaded", timeout: opts.timeout });
      found.status = res?.status() ?? null;
    } catch (e) {
      found.navError = firstLine(e);
    }

    if (!found.navError) {
      for (const sel of opts.clicks) await step("click", sel, () => page.click(sel, { timeout: opts.timeout }));
      if (opts.wait) await step("wait", opts.wait, () => page.waitForSelector(opts.wait, { timeout: opts.timeout }));
      if (opts.settle > 0) await page.waitForTimeout(opts.settle);
    }

    if (opts.shot) {
      const p = shotPath(opts);
      try {
        mkdirSync(dirname(p), { recursive: true });
        await page.screenshot({ path: p, fullPage: true, timeout: opts.timeout });
        found.shot = p;
      } catch (e) {
        found.shot = null;
        found.shotError = firstLine(e);
      }
    }
  } finally {
    // 수거에 상한을 둔다. res.text() 는 --timeout 의 적용을 받지 않아서, 멈춘 응답 하나가
    // 여기를 붙들면 probe 가 출력 한 줄 없이 영영 매달린다.
    if (jobs.length) {
      const done = Symbol("done");
      const r = await Promise.race([Promise.allSettled(jobs).then(() => done), sleep(opts.collect)]);
      if (r !== done) found.collectTimedOut = true;
    }
    await browser.close().catch(() => {});
    found.ms = Date.now() - started;
  }
  return found;
}

// ── 보고 ──────────────────────────────────────────────────────────────
export function format(found) {
  const L = [];
  L.push(
    found.navError
      ? `▶ probe ${found.url} — 페이지를 열지 못했다 (${(found.ms / 1000).toFixed(1)}초)`
      : `▶ probe ${found.url} — HTTP ${found.status ?? "?"} (${(found.ms / 1000).toFixed(1)}초)`,
  );
  if (found.navError) L.push(`  · ${found.navError}`);

  if (found.console.length) {
    L.push(`✖ 콘솔 ${found.console.length}건`);
    for (const c of found.console) L.push(`  · [${c.type}] ${c.text}${c.at ? `  @ ${c.at}` : ""}`);
  }
  if (found.pageErrors.length) {
    L.push(`✖ 페이지 예외 ${found.pageErrors.length}건`);
    for (const e of found.pageErrors) L.push(`  · ${e.message}${e.stack ? `  ← ${e.stack}` : ""}`);
  }
  if (found.failedRequests.length) {
    L.push(`✖ 실패한 요청 ${found.failedRequests.length}건`);
    for (const r of found.failedRequests) {
      L.push(`  · ${r.status ?? r.reason ?? "?"} ${r.method} ${r.url}`);
      if (r.body) L.push(`      본문: ${r.body}`);
    }
  }

  // 한 동작도 성공한 줄로 적는다. 실패만 적으면 "못 한 동작이 없다"가
  // 「다 됐다」와 「시도조차 안 했다」 둘 다를 뜻하게 된다.
  const stepsBad = found.steps.filter((s) => !s.ok);
  if (found.steps.length) {
    L.push(`· 시킨 동작 ${found.steps.length}건: ${found.steps.map((s) => `${s.kind} ${s.target} ${s.ok ? "됨" : "못 함"}`).join(" · ")}`);
  }
  if (stepsBad.length) {
    L.push(`✖ 못 한 동작 ${stepsBad.length}건`);
    for (const s of stepsBad) L.push(`  · ${s.kind} ${s.target} — ${s.detail}`);
  }

  const quiet = Object.entries(found.consoleQuiet).sort();
  if (quiet.length) L.push(`· 콘솔 그 밖: ${quiet.map(([k, v]) => `${k} ${v}`).join(" · ")}`);
  if (found.collectTimedOut) L.push("· 늦게 오는 응답 본문 일부를 못 받았다 (--collect 를 늘린다)");
  if (found.shot) L.push(`▣ 스크린샷 ${found.shot}`);
  else if (found.shotError) L.push(`▣ 스크린샷 실패 — ${found.shotError}`);

  const n = found.console.length + found.pageErrors.length + found.failedRequests.length + stepsBad.length + (found.navError ? 1 : 0);
  L.push(n === 0 ? "관측 끝 — 잡힌 것 없음 (판정은 하지 않는다)" : `관측 끝 — 잡힌 것 ${n}건 (판정은 하지 않는다)`);
  return L.join("\n");
}

// ── CLI ───────────────────────────────────────────────────────────────
// process.exit() 를 쓰지 않는다. stdout 이 파이프면(= 이 출력을 누가 받아 읽으면) 쓰기가
// 비동기라 버퍼를 넘긴 뒷부분이 버려진다 — 이 도구의 고장 모양이 정확히 "뒷부분이 없어졌는데
// 겉은 정상"이다. exitCode 만 정하고 자연 종료시킨다(브라우저는 이미 닫혔다).
const isCli = process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url));
if (isCli) {
  let opts = null;
  try {
    opts = parseArgs(process.argv.slice(2));
  } catch (e) {
    console.error(firstLine(e));
    process.exitCode = 2;
  }
  if (opts) {
    try {
      const found = await runProbe(opts);
      console.log(opts.json ? JSON.stringify(found, null, 2) : format(found));
    } catch (e) {
      // 도구 자신이 깨진 경우. 관측 결과가 아니므로 구분해서 적되, 종료 코드는 0 을 지킨다 —
      // 이 스크립트의 종료 코드를 판정으로 읽는 자리가 생기면 안 된다.
      console.log(`▶ probe ${opts.url} — 관측 도구가 실패했다: ${firstLine(e)}`);
    }
    process.exitCode = 0;
  }
}
