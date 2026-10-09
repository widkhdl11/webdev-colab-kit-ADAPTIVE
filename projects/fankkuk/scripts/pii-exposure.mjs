// 배포 전 개인정보 노출 검사 (address-protection INV-P9 · S9, 원본 설계 「배포 규칙」 2번).
//
// 두 가지를 본다. 하나라도 걸리거나 끝까지 확인하지 못하면 실패다.
// 1) 응답 검사 — 익명·로그인 권한마다 데이터 API 가 그 권한에 내주는 목록(OpenAPI)에서 열린 표와 함수를 모두 찾아 부르고,
//    응답에 실명·주소·전화번호·이메일 칸이나 그런 꼴의 값이 있으면 실패. 손으로 적은 목록이 아니라서 새 함수가 생겨도 빠지지 않는다.
//    - 함수는 GET 으로만 부른다. 데이터 API 는 GET 을 읽기 전용 거래로 돌리므로 쓰기 함수를 불러도 아무것도 바뀌지 않는다.
//      이 전제는 먼저 확인한다 — 크리에이터 알림 설정을 지금 값 그대로 다시 저장하게 GET 으로 불러 읽기 전용 오류(25006)가 나야 한다
//      (전제가 깨져 실제로 써져도 바뀌는 값이 없다). 확인하지 못하면 검사를 시작하지 않는다.
//    - 인자가 필요한 함수는 앞선 성공 응답에 나온 값(인자 이름에서 p_ 를 뗀 칸)을 3개까지 차례로 넣어 본다.
//    - 성공(2xx)한 호출만 「부름」으로 센다. 서버 오류(5xx)는 실패, 로그인 권한에 열린 것이 하나도 없으면 실패.
// 2) 구조 검사 — 쓰기 함수는 GET 으로 응답을 볼 수 없다(기록을 쓰고 개인정보를 돌려주는 함수가 그 꼴이다). 그래서 로그인 키로 부를 수 있는
//    함수 중 개인정보 구역(pii)에 닿는 것(다른 함수를 거쳐 닿는 것 포함)은 이유를 적은 아래 허용 목록에 있어야 한다. 새로 닿는 함수가 생기면
//    여기서 걸리고, 사람이 그 함수가 무엇을 돌려주는지 보고 목록에 올린다. 목록에 있는데 이제 닿지 않는 함수도 실패(목록을 정직하게).
//
// 이 검사가 보지 않는 길: 앱의 POST 경로(부르면 쓰기가 일어난다 — 응답 꼴은 경로별 유닛 시험이 본다), 서버 화면(page) — 화면은 DB 함수를
// 로그인 토큰으로 불러 그리므로 1) 이 덮는다, GraphQL·Storage·realtime(BACKLOG). 앱 GET 경로는 --app 주소를 줄 때 로그인하지 않고 부른다.
// 출력에는 개인정보 값을 찍지 않는다(address-protection INV-P10) — 자리와 종류만.
//
// 실행: npm run check:pii [-- --app http://127.0.0.1:3311]
//   기본은 로컬 Supabase(`supabase status`)·로컬 DB 컨테이너와 시드 시험 계정(팬·크리에이터·직원·대표).
//   다른 DB 를 볼 때: PII_CHECK_API_URL · PII_CHECK_ANON_KEY · PII_CHECK_DB_URL(psql 접속 주소) ·
//   PII_CHECK_LOGINS("이메일:비밀번호" 를 ; 로 이어서, 크리에이터 계정 하나 이상). 하나라도 없으면 실패한다.

import { execFileSync, execSync } from "node:child_process";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { pathToFileURL } from "node:url";

// 실명·주소·전화번호·이메일 꼴의 칸 이름(봉인된 주소 envelope 포함, 원 송장 봉투 번호 envelope_no 는 아니다)
export const PII_KEY = /(real_?name|recipient|phone|mobile|address|addr|zip_?code|postcode|email|ciphertext|wrapped_key|envelope(?!_no))/i;

const VALUE_KINDS = [
  // 앞뒤가 다른 글자·숫자와 붙어 있지 않을 때만 — 무작위 id·송장번호 안의 숫자는 아니다
  ["전화번호", /(?<![0-9A-Za-z])(?:\+82[- .]?1[016789]|01[016789])[- .]?\d{3,4}[- .]?\d{4}(?![0-9A-Za-z])/],
  ["주소", /[가-힣]+(시|도)\s[가-힣]+(구|군|시)(\s|$)|[가-힣]+(구|군)\s[가-힣0-9]+(로|길)\s?\d+/],
  ["이메일", /[\w.+-]+@[\w-]+\.[\w.-]+/],
];

// 스펙이 허용한 칸 — 그 함수의 응답에서, 값이 그 꼴일 때만 통과한다. 꼴이 다르면(예: 가린 칸에 전체 번호) 그대로 실패다.
export const ALLOWED = [
  // my-account INV-A2: 내 정보 읽기는 본인 번호를 가운데 넷을 가린 모양으로만 돌려준다
  { fn: "my_account", key: /^phone_masked$/, value: /^01[016789]-\*{4}-\d{4}$/ },
  // my-account INV-A4·A7: 내 정보 읽기는 본인의 확인된 이메일과 확인 대기 이메일을 돌려준다(로그인 토큰의 본인 줄만)
  { fn: "my_account", key: /^(email|pending_email)$/, value: /^[\w.+-]+@[\w-]+\.[\w.-]+$/ },
];

// 로그인 키로 부를 수 있으면서 개인정보 구역에 닿는 함수 — 무엇을 돌려주는지 사람이 보고 올린 것만
export const PII_FUNCTIONS = {
  accept_revgift: "역조공 받기 — 팬이 봉인한 주소를 저장만 한다, 돌려주는 것은 결과 글자(reverse-gift INV-R3)",
  confirm_my_email: "확인 메일 토큰으로 이메일을 확정한다, 돌려주는 것은 결과 글자(my-account INV-A7)",
  my_account: "내 정보 — 본인 이메일·가린 번호만(my-account INV-A2, 위 허용 칸)",
  my_creator_address_status: "주소 등록 여부만, 주소 값은 돌려주지 않는다(address-protection INV-P9)",
  update_my_account: "닉네임·확인 대기 이메일·알림 저장, 돌려주는 것 없음(my-account INV-A4)",
  update_my_creator_notify: "크리에이터 알림 두 개 저장, 돌려주는 것 없음(my-account INV-A11)",
  // 아래 일곱은 사무실 처리 → office_sync → close_revgift_share(출고·반송이 끝난 역조공 몫의 팬 주소를 지운다, reverse-gift INV-R9)로 닿는다.
  // 주소를 지우는 길이고 읽어 돌려주지 않는다
  find_held_parcel: "보류 상자 찾기 → 몫 닫기, 돌려주는 것은 결과 글자",
  office_confirm_label: "라벨 부착 확인 → 몫 닫기, 돌려주는 것 없음",
  office_confirm_return: "반송 확정 → 몫 닫기(주소 지움), 돌려주는 것 없음",
  office_confirm_shipment: "출고 확정 → 몫 닫기(주소 지움), 돌려주는 것 없음",
  office_print_return_label: "반송 송장 출력 → 몫 닫기, 돌려주는 것은 원 송장 봉투 번호",
  office_scan_inbound: "입고 스캔 → 몫 닫기, 돌려주는 것은 결과·QR(office-workflow INV-W1)",
  office_scan_inspect: "검수 완료 스캔 → 몫 닫기, 돌려주는 것은 다음 단계 글자",
};

/** 응답 하나를 통째로 훑어 개인정보 꼴이 있는 자리를 돌려준다(값은 찍지 않는다). 칸 이름이 걸려도 값이 참·거짓·빈 값이면 개인정보가 아니다. */
export function piiFindings(value, fn = "", path = "$") {
  if (Array.isArray(value)) return value.flatMap((v, i) => piiFindings(v, fn, `${path}[${i}]`));
  if (value && typeof value === "object") {
    return Object.entries(value).flatMap(([k, v]) => {
      if (allowed(fn, k, v)) return [];
      return [...(PII_KEY.test(k) && carriesValue(v) ? [`${path}.${k} 칸 이름`] : []), ...piiFindings(v, fn, `${path}.${k}`)];
    });
  }
  if (typeof value !== "string") return [];
  return VALUE_KINDS.filter(([, re]) => re.test(value)).map(([kind]) => `${path} ${kind} 꼴(${value.length}자)`);
}

function allowed(fn, key, value) {
  return ALLOWED.some((a) => a.fn === fn && a.key.test(key) && typeof value === "string" && a.value.test(value));
}

function carriesValue(v) {
  if (v === null || v === undefined || typeof v === "boolean") return false;
  if (typeof v === "string") return v.trim() !== "";
  if (Array.isArray(v)) return v.length > 0;
  return true;
}

function headers(anonKey, token) {
  return { apikey: anonKey, Authorization: `Bearer ${token ?? anonKey}` };
}

async function readBody(r) {
  const text = await r.text();
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

/** 그 권한에 열린 표·뷰와 함수(필수 인자 이름 포함). */
export async function listEndpoints(apiUrl, anonKey, token) {
  const r = await fetch(`${apiUrl}/rest/v1/`, { headers: { ...headers(anonKey, token), Accept: "application/openapi+json" } });
  if (!r.ok) throw new Error(`데이터 API 목록을 받지 못했다: ${r.status}`);
  const spec = await r.json();
  const tables = [];
  const rpcs = [];
  for (const [path, ops] of Object.entries(spec.paths ?? {})) {
    if (path === "/") continue;
    if (!path.startsWith("/rpc/")) {
      tables.push(path.slice(1));
      continue;
    }
    const body = (ops.post?.parameters ?? []).find((p) => p.in === "body");
    const getRequired = (ops.get?.parameters ?? []).filter((p) => p.required && p.in === "query").map((p) => p.name);
    rpcs.push({ name: path.slice(5), required: body?.schema?.required ?? getRequired });
  }
  return { tables: tables.sort(), rpcs: rpcs.sort((a, b) => a.name.localeCompare(b.name)) };
}

/** 함수를 읽기 전용(GET)으로 부른다. */
export async function callReadOnly(apiUrl, anonKey, token, name, args = {}) {
  const q = new URLSearchParams(Object.entries(args).map(([k, v]) => [k, String(v)]));
  const r = await fetch(`${apiUrl}/rest/v1/rpc/${name}?${q}`, { headers: headers(anonKey, token) });
  return { status: r.status, body: await readBody(r) };
}

const errorCode = (body) => (body && typeof body === "object" && !Array.isArray(body) ? body.code : undefined);

// 함수의 거부가 아니라 서버·DB 가 망가진 것 — 코드 없음, 또는 SQLSTATE 계열 XX(내부)·53(자원)·57(운영 개입)·58(시스템)·08(연결)
function isServerFault(body) {
  const code = errorCode(body);
  return typeof code !== "string" || /^(XX|53|57|58|08)/.test(code);
}

/**
 * GET 이 정말 읽기 전용 거래로 도는지 — 데이터 API 서버 전체의 성질이라 한 번 확인하면 된다.
 * 크리에이터 계정으로 알림 설정을 지금 값 그대로 다시 저장하게 GET 으로 불러 25006 이 나야 한다. 성공(2xx)이면 멈춘다(바뀐 값은 없다).
 */
export async function assertReadOnlyGet(apiUrl, anonKey, tokens) {
  for (const token of tokens) {
    const me = await callReadOnly(apiUrl, anonKey, token, "my_account");
    const row = Array.isArray(me.body) ? me.body[0] : undefined;
    if (me.status >= 300 || typeof row?.notify_kakao !== "boolean" || typeof row?.notify_email !== "boolean") continue;
    const r = await callReadOnly(apiUrl, anonKey, token, "update_my_creator_notify", { p_notify_kakao: row.notify_kakao, p_notify_email: row.notify_email });
    if (r.status < 300) throw new Error("GET 으로 쓰기 함수가 성공했다(같은 값을 다시 저장해 바뀐 것은 없다) — 쓰기가 일어날 수 있어 검사를 멈춘다");
    if (errorCode(r.body) === "25006") return;
  }
  throw new Error("GET 이 읽기 전용으로 도는지 확인하지 못했다 — 크리에이터 계정을 넣는다");
}

/** 성공 응답에서 인자로 쓸 만한 값(글자·숫자)을 칸 이름별로 모은다. */
function collectValues(value, pool) {
  if (Array.isArray(value)) return value.forEach((v) => collectValues(v, pool));
  if (!value || typeof value !== "object") return;
  for (const [k, v] of Object.entries(value)) {
    if (typeof v === "string" || typeof v === "number") {
      if (!pool.has(k)) pool.set(k, []);
      const list = pool.get(k);
      if (list.length < 3 && !list.includes(v)) list.push(v);
    } else collectValues(v, pool);
  }
}

// 인자 이름 → 응답 칸 이름(p_ 를 뗀 이름과 다른 것만)
const ARG_ALIASES = { qr: ["qr", "qr_code"], slug: ["slug", "handle"] };

/** 필수 인자마다 모아 둔 값을 i 번째 것으로 — 하나라도 없으면 null. */
function argsFor(required, pool, i) {
  const args = {};
  for (const name of required) {
    const bare = name.replace(/^p_/, "");
    const values = (ARG_ALIASES[bare] ?? [bare]).flatMap((k) => pool.get(k) ?? []);
    if (values.length === 0) return null;
    args[name] = values[Math.min(i, values.length - 1)];
  }
  return args;
}

const TABLE_LIMIT = 1000;

/** 한 권한으로 열린 표·함수를 모두 부르고 개인정보 꼴을 찾는다. */
export async function scanRole({ apiUrl, anonKey, token, label }) {
  const { tables, rpcs } = await listEndpoints(apiUrl, anonKey, token);
  const findings = [];
  const problems = [];
  const pool = new Map();
  const called = [];
  const refused = [];
  if (token && tables.length + rpcs.length === 0) problems.push(`${label}: 열린 표·함수가 하나도 보이지 않는다 — 데이터 API 목록이 꺼졌거나 막혔다`);
  const record = (where, fn, r) => {
    // 데이터 API 는 함수가 스스로 낸 거부(P0002 없음·55000 단계 등)와 쓰기 함수의 읽기 전용 오류(25006)도 500 으로 돌려준다 — 그것은 거부다.
    // 서버 오류는 코드가 없거나(게이트웨이·서버 장애) DB 내부·자원·연결 계열일 때만이다. 쓰기 함수의 응답은 볼 수 없고 구조 검사가 맡는다
    if (r.status >= 500 && isServerFault(r.body)) problems.push(`${label} ${where}: 서버 오류 ${r.status} ${errorCode(r.body) ?? ""}`);
    if (r.status >= 300) return false;
    collectValues(r.body, pool);
    for (const f of piiFindings(r.body, fn)) findings.push(`${label} ${where} ${f}`);
    return true;
  };
  for (const t of tables) {
    const res = await fetch(`${apiUrl}/rest/v1/${t}?select=*&limit=${TABLE_LIMIT + 1}`, { headers: headers(anonKey, token) });
    const r = { status: res.status, body: await readBody(res) };
    if (record(`표 ${t}`, t, r)) called.push(t);
    if (Array.isArray(r.body) && r.body.length > TABLE_LIMIT) problems.push(`${label} 표 ${t}: ${TABLE_LIMIT}줄을 넘어 끝까지 보지 못했다`);
  }
  // 인자 없는 함수 먼저 — 그 성공 응답의 값으로 인자가 필요한 함수를 채운다. 새로 부른 것이 없을 때까지 돈다.
  let pending = rpcs;
  for (let round = 0; round < 4 && pending.length > 0; round++) {
    const next = [];
    for (const fn of pending) {
      let tried = false;
      let ok = false;
      let last;
      for (let i = 0; i < 3 && !ok; i++) {
        const args = argsFor(fn.required, pool, i);
        if (args === null) break;
        tried = true;
        last = await callReadOnly(apiUrl, anonKey, token, fn.name, args);
        ok = record(`함수 ${fn.name}`, fn.name, last);
        if (fn.required.length === 0) break;
      }
      if (ok) called.push(fn.name);
      else if (tried) refused.push(`${fn.name}:${errorCode(last?.body) ?? last?.status}`);
      else next.push(fn);
    }
    if (next.length === pending.length) break;
    pending = next;
  }
  return {
    label,
    writes: refused.filter((x) => x.endsWith(":25006")).length,
    tables: tables.length,
    rpcs: rpcs.length,
    called: called.length,
    refused,
    skipped: pending.map((f) => `${f.name}(${f.required.join(",")})`),
    findings: [...new Set(findings)],
    problems: [...new Set(problems)],
  };
}

/** 앱 서버의 GET 경로(동적 구간 없는 것)를 로그인하지 않고 부른다. */
export async function scanAppGets(appUrl, appDir) {
  const routes = [];
  const walk = (dir) => {
    for (const name of readdirSync(dir)) {
      const p = join(dir, name);
      if (statSync(p).isDirectory()) walk(p);
      else if (name === "route.ts" && /export (async )?(function|const) GET\b/.test(readFileSync(p, "utf8"))) routes.push(p);
    }
  };
  walk(join(appDir, "api"));
  const findings = [];
  const skipped = [];
  let called = 0;
  for (const file of routes) {
    const route = "/" + relative(appDir, file).split(sep).slice(0, -1).join("/");
    if (route.includes("[")) {
      skipped.push(route);
      continue;
    }
    const r = await fetch(`${appUrl}${route}`, { redirect: "manual" });
    called++;
    for (const f of piiFindings(await readBody(r))) findings.push(`익명 앱 GET ${route} ${f}`);
    for (const f of piiFindings(decodeURIComponent(r.headers.get("location") ?? ""))) findings.push(`익명 앱 GET ${route} 돌려보내는 주소 ${f}`);
  }
  return { routes: routes.length, called, skipped, findings };
}

/**
 * 구조 검사: 로그인 키(anon·authenticated)로 부를 수 있는 public 함수 중 pii 구역에 닿는 것(다른 public 함수를 거쳐 닿는 것 포함).
 * sql 은 SQL 한 문장을 받아 결과 글자(줄마다 「이름|본문」)를 돌려주는 함수.
 */
export function piiTouchingFunctions(sql) {
  const out = sql(
    "select p.proname || '|' || (has_function_privilege('anon', p.oid, 'execute') or has_function_privilege('authenticated', p.oid, 'execute'))::text || '|' || replace(replace(p.prosrc, chr(10), ' '), chr(13), ' ') from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public'",
  );
  const fns = new Map();
  for (const line of out.split(/\r?\n/)) {
    const [name, exposed, ...rest] = line.split("|");
    if (!name || rest.length === 0) continue;
    const src = rest.join("|");
    const prev = fns.get(name);
    fns.set(name, { exposed: exposed === "true" || prev?.exposed === true, src: (prev?.src ?? "") + " " + src });
  }
  const touching = new Set([...fns].filter(([, f]) => /\bpii\./i.test(f.src)).map(([n]) => n));
  for (let changed = true; changed; ) {
    changed = false;
    for (const [name, f] of fns) {
      if (touching.has(name)) continue;
      if ([...touching].some((t) => new RegExp(`\\b(public\\.)?${t}\\s*\\(`).test(f.src))) {
        touching.add(name);
        changed = true;
      }
    }
  }
  return [...touching].filter((n) => fns.get(n)?.exposed).sort();
}

/** 구조 검사: public 구역(데이터 API 에 열린 구역)의 표·뷰에 개인정보 꼴 이름의 칸이 있으면 그 이름들(address-protection INV-P9). */
export function piiColumns(sql) {
  return sql("select table_name || '.' || column_name from information_schema.columns where table_schema = 'public'")
    .split(/\r?\n/)
    .filter((c) => c && PII_KEY.test(c.split(".")[1] ?? ""))
    .sort();
}

export function structureProblems(touching, columns = []) {
  const problems = columns.map((c) => `구조: public 표 칸 ${c} — 개인정보는 pii 구역에만 둔다`);
  for (const name of touching) if (!(name in PII_FUNCTIONS)) problems.push(`구조: 로그인 키로 부를 수 있는 ${name} 가 개인정보 구역에 닿는다 — 무엇을 돌려주는지 보고 허용 목록에 올린다`);
  for (const name of Object.keys(PII_FUNCTIONS)) if (!touching.includes(name)) problems.push(`구조: 허용 목록의 ${name} 는 이제 개인정보 구역에 닿지 않거나 로그인 키에 닫혔다 — 목록에서 뺀다`);
  return problems;
}

async function signIn(apiUrl, anonKey, email, password) {
  const r = await fetch(`${apiUrl}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: { apikey: anonKey, "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  const j = await readBody(r);
  if (!r.ok || typeof j !== "object" || !j.access_token) throw new Error(`로그인 실패: ${email} (${r.status})`);
  return j.access_token;
}

async function signOut(apiUrl, anonKey, token) {
  await fetch(`${apiUrl}/auth/v1/logout`, { method: "POST", headers: headers(anonKey, token) }).catch(() => undefined);
}

/**
 * 전체 검사. 실패(개인정보 꼴·확인 못 함)면 problems 가 비어 있지 않다.
 * @param {{ apiUrl: string, anonKey: string, logins: [string, string][], sql?: (q: string) => string, appUrl?: string, appDir?: string }} options
 */
export async function runPiiExposureCheck({ apiUrl, anonKey, logins, sql, appUrl, appDir = "" }) {
  const problems = [];
  if (logins.length === 0) problems.push("로그인 계정이 없다 — 일반 사용자 권한도 검사해야 한다");
  if (!sql) problems.push("DB 연결이 없다 — 구조 검사(개인정보 구역에 닿는 함수)를 하지 못했다");
  if (problems.length > 0) return { roles: [], app: null, touching: [], problems };
  const sessions = [];
  for (const [email, password] of logins) sessions.push({ label: email.split("@")[0], token: await signIn(apiUrl, anonKey, email, password) });
  try {
    await assertReadOnlyGet(apiUrl, anonKey, sessions.map((s) => s.token));
    const roles = [await scanRole({ apiUrl, anonKey, label: "익명" })];
    for (const s of sessions) roles.push(await scanRole({ apiUrl, anonKey, token: s.token, label: s.label }));
    const app = appUrl ? await scanAppGets(appUrl, appDir) : null;
    const touching = piiTouchingFunctions(sql);
    const columns = piiColumns(sql);
    for (const r of roles) problems.push(...r.problems, ...r.findings);
    if (app) problems.push(...app.findings);
    problems.push(...structureProblems(touching, columns));
    return { roles, app, touching, problems };
  } finally {
    for (const s of sessions) await signOut(apiUrl, anonKey, s.token);
  }
}

function localStatus() {
  let out = "";
  try {
    out = execSync("npx supabase status --output env", { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] });
  } catch {
    // 아래에서 안내한다
  }
  const status = Object.fromEntries(
    out
      .split(/\r?\n/)
      .filter((l) => /^[A-Z_]+=/.test(l))
      .map((l) => {
        const i = l.indexOf("=");
        return [l.slice(0, i), l.slice(i + 1).replace(/^"|"$/g, "")];
      }),
  );
  if (!status.API_URL) throw new Error("로컬 Supabase 가 꺼져 있다 — `npx supabase start` 뒤 다시 돌린다(다른 DB 는 PII_CHECK_* 로)");
  return status;
}

function localSql() {
  const projectId = /^project_id\s*=\s*"([^"]+)"/m.exec(readFileSync(join(process.cwd(), "supabase", "config.toml"), "utf8"))?.[1];
  if (!projectId) throw new Error("supabase/config.toml 에 project_id 가 없다");
  return (q) => execFileSync("docker", ["exec", "-i", `supabase_db_${projectId}`, "psql", "-U", "postgres", "-At", "-v", "ON_ERROR_STOP=1", "-c", q], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
}

function remoteSql(dbUrl) {
  return (q) => execFileSync("psql", [dbUrl, "-At", "-v", "ON_ERROR_STOP=1", "-c", q], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
}

function parseLogins(raw) {
  return raw
    .split(";")
    .filter(Boolean)
    .map((s) => {
      const i = s.indexOf(":");
      if (i <= 0) throw new Error("PII_CHECK_LOGINS 형식은 「이메일:비밀번호」를 ; 로 잇는다");
      return [s.slice(0, i), s.slice(i + 1)];
    });
}

// 로컬 시드 계정(seed.sql) — 로컬 DB 전용 값이라 비밀이 아니다
const LOCAL_LOGINS = ["byeolbit_fan", "haru_creator", "fankkuk_staff", "fankkuk_admin"].map((id) => [`${id}@fankkuk.test`, "fankkuk-local-1234"]);

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  try {
    const appIdx = process.argv.indexOf("--app");
    const appUrl = appIdx > 0 ? process.argv[appIdx + 1] : undefined;
    const remote = process.env.PII_CHECK_API_URL;
    const local = remote ? null : localStatus();
    const apiUrl = remote ?? local.API_URL;
    const anonKey = process.env.PII_CHECK_ANON_KEY ?? local?.ANON_KEY ?? "";
    const logins = process.env.PII_CHECK_LOGINS ? parseLogins(process.env.PII_CHECK_LOGINS) : remote ? [] : LOCAL_LOGINS;
    const sql = process.env.PII_CHECK_DB_URL ? remoteSql(process.env.PII_CHECK_DB_URL) : remote ? undefined : localSql();
    const result = await runPiiExposureCheck({ apiUrl, anonKey, logins, sql, appUrl, appDir: join(process.cwd(), "src", "app") });
    for (const r of result.roles) {
      console.log(`${r.label}: 표 ${r.tables} · 함수 ${r.rpcs} · 성공 ${r.called} · 쓰기 함수 ${r.writes} · 거부 ${r.refused.length - r.writes} · 인자 없어 못 부름 ${r.skipped.length}`);
    }
    if (result.app) console.log(`앱 GET 경로 ${result.app.routes}개 · 부름 ${result.app.called}${result.app.skipped.length ? ` · 동적 구간이라 못 부름 ${result.app.skipped.join(" ")}` : ""}`);
    if (result.touching.length) console.log(`개인정보 구역에 닿는 로그인 키 함수 ${result.touching.length}개 — 모두 허용 목록에 있음 확인`);
    if (result.problems.length > 0) {
      console.error(`개인정보 노출 검사 실패 — ${result.problems.length}건`);
      for (const p of result.problems) console.error(`  ${p}`);
      process.exit(1);
    }
    console.log("개인정보 노출 검사 통과 — 실명·주소·전화번호·이메일 꼴 0건");
  } catch (e) {
    console.error(`개인정보 노출 검사를 끝내지 못했다: ${e instanceof Error ? e.message : String(e)}`);
    process.exit(1);
  }
}
