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
// 3) 나만 보는 선물 메모(together INV-F8) — 자유 글이라 위 꼴 검사로는 잡히지 않는다(새도 0건). 그래서 따로 둘을 본다.
//    - 구조: DB 함수 본문 전체(로그인 키에 닫힌 함수 포함)에서 메모 표(gift_memos)를 참조하는 함수가 허용 목록 셋뿐인지,
//      메모 표를 읽는 뷰가 없는지, 메모 표에 화면 쪽 키 권한이 없는지·행 보안이 켜져 있는지.
//    - 응답: memoCanary(심은 값·그 주문번호·보낸 사람)를 주면 모든 권한의 성공 응답에서 그 값을 찾는다. 보낸 사람 말고는 한 번도 나오면 안 되고,
//      보낸 사람에게는 나와야 한다(안 나오면 심기가 안 됐거나 읽기 함수가 빠졌다 — 아무것도 못 본 검사가 통과하지 않게).
//      심은 값은 시험이 넣는다(통합 시험 gift-memo-db). 값은 출력에 찍지 않는다.
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
  accept_revgift: "역조공 받기 — 팬의 등록 주소 암호문을 그 몫에 복사만 한다, 돌려주는 것 없음(reverse-gift INV-R4)",
  // 팬 받을 주소(address-protection INV-P17, manual/0019) — 로그인한 팬 본인 칸만
  set_my_fan_address: "팬 받을 주소 저장 — 봉인된 값과 이름표를 저장만 한다, 돌려주는 것은 결과 글자(saved·not_fan)",
  delete_my_fan_address: "팬 받을 주소 지우기 — 돌려주는 것은 결과 글자(deleted·none·not_fan)",
  my_fan_address_status: "본인 받을 주소의 등록 여부·고른 이름표·바꾼 시각만, 주소 값은 돌려주지 않는다(address-protection INV-P16·P17)",
  confirm_my_email: "확인 메일 토큰으로 이메일을 확정한다, 돌려주는 것은 결과 글자(my-account INV-A7)",
  my_account: "내 정보 — 본인 이메일·가린 번호만(my-account INV-A2, 위 허용 칸)",
  my_creator_address_status: "본인 주소의 등록 여부·고른 이름표·바꾼 시각만, 주소 값은 돌려주지 않는다(address-protection INV-P9·P16)",
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
  // 크리에이터가 고른 블루투스 상자의 운영자 처리(office-workflow INV-W13). 같은 office_sync 경로로 닿는다 — 크리에이터 확인은 역조공 몫에 생기지 않지만 공통 정리를 부른다
  office_process_creator_check: "크리에이터 선택의 운영자 처리 → 몫 닫기, 돌려주는 것은 결과 글자(accepted·returned·no_choice·changed·processed·expired·closed·not_found)",
  // 신고 보관 상자의 경찰 인계 기록(office-workflow INV-W14). 같은 office_sync 경로로 닿는다
  office_record_police_handover: "경찰 인계 기록 → 몫 정리 경로, 돌려주는 것은 결과 글자(handed)",
  // 처분 대상 상자의 처분 기록(office-workflow INV-W15). 같은 office_sync 경로로 닿는다(처분된 몫 상자의 몫 닫기 — 받는 팬 주소 복사본을 지운다)
  office_record_disposal: "처분 기록 → 몫 정리 경로(주소를 지우는 길), 돌려주는 것은 결과 글자(disposed)",
  // 반송 주소 확인(office-workflow INV-W15 · address-protection INV-P18, manual/0020) — 로그인한 보낸 사람 본인의 상자에만, 등록 주소 암호문을 상자에 복사만 한다
  confirm_return_address: "반송 주소 확인 — 보낸 사람 본인의 등록 주소 암호문을 그 상자에 복사만 한다, 돌려주는 것은 결과 글자(confirmed·not_found·no_address·expired·closed)",
  // 운영자 몫 옮기기(inbound-address-code INV-C11) — 옮긴 상자로 office_sync 를 부른다. 주소를 읽어 돌려주지 않는다
  // 운영자 잇기(inbound-address-code INV-C12) — 입고 마무리(office_finish_held_receive → office_sync)로 닿는다. 돌려주는 것은 결과 글자(linked)
  admin_link_held_parcel: "6자리 없이 온 상자를 문의한 팬의 입고 전 상자에 잇기 → 몫 정리 경로, 돌려주는 것은 결과 글자(linked)",
  // 7일 자동 처리(office-workflow INV-W6·W13) — 받기를 고른 확인 대기 상자를 검수 완료로 넘길 때 office_sync 를 부른다. 돌려주는 것은 처리 건수(jsonb)
  office_run_expiry: "기한 자동 처리 → 몫 정리 경로, 돌려주는 것은 단계별 처리 건수",
  admin_move_held_share: "찾기로 이은 상자를 같은 크리에이터의 다른 팬별 선물로 옮김 → 몫 정리, 돌려주는 것은 결과 글자(moved)",
};

// 메모 표를 참조해도 되는 함수 — 스펙 together INV-F8 의 셋(등록 때 저장 · 보낸 팬 본인의 선물 상세 · 보낸 팬 본인의 보낸 선물 목록).
// 키는 「구역.이름(인자 모양)」이다 — 이름만 맞추면 같은 이름에 계정 ID 인자를 받는 판(my_gifts(p_fan_id uuid))을 더 만들어도 통과한다.
// 인자 모양은 pg_get_function_identity_arguments 가 내는 글자 그대로(인자 이름·타입, 기본값 없음)다.
export const MEMO_TABLE = "gift_memos";
export const MEMO_FUNCTIONS = {
  "public.register_order(p_fan_id uuid, p_creator_id uuid, p_order_no text, p_item_kind text, p_has_electronics_or_metal boolean, p_tiers parcel_tier[], p_toss_order_id text, p_goods_krw integer, p_service_fee_krw integer, p_inspection_fee_krw integer, p_shipping_fee_krw integer, p_amount_krw integer, p_anniversary_name text, p_item_category text, p_hard_notice_category text, p_memo_title text, p_memo_body text)":
    "선물 등록 — 같은 처리에서 메모를 저장만 한다, 서버 비밀 키 전용(돌려주는 것은 주문 id)",
  "public.my_gift_memo(p_order_no text)": "선물 상세 — 로그인 토큰의 계정이 보낸 주문의 메모만, 계정 ID 인자 없음",
  "public.my_gifts()": "보낸 선물 목록 — 로그인 토큰의 계정이 보낸 주문의 선물 이름만",
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
export async function scanRole({ apiUrl, anonKey, token, label, memoCanary }) {
  const { tables, rpcs } = await listEndpoints(apiUrl, anonKey, token);
  const findings = [];
  const problems = [];
  const pool = new Map();
  // 심은 메모의 주문번호를 맨 앞에 둔다 — 함수는 첫 성공에서 멈추고 칸마다 값 셋만 모으므로, 다른 주문번호가 먼저 모이면
  // 메모 함수가 심은 주문으로 한 번도 불리지 않는다(2026-10-16 통합 전체 실행에서 별빛 my_gift_memo 0번). 다른 권한도 이 주문번호로 불러 본다
  if (memoCanary) pool.set("order_no", [memoCanary.orderNo]);
  const called = [];
  const refused = [];
  // together INV-F8: 심은 메모 값이 나온 자리 · 그 주문번호가 나온 자리(「0번」이 그 주문을 못 본 것이 아님을 보이는 근거)
  const memoHits = [];
  const orderSeen = [];
  if (token && tables.length + rpcs.length === 0) problems.push(`${label}: 열린 표·함수가 하나도 보이지 않는다 — 데이터 API 목록이 꺼졌거나 막혔다`);
  const record = (where, fn, r) => {
    // 데이터 API 는 함수가 스스로 낸 거부(P0002 없음·55000 단계 등)와 쓰기 함수의 읽기 전용 오류(25006)도 500 으로 돌려준다 — 그것은 거부다.
    // 서버 오류는 코드가 없거나(게이트웨이·서버 장애) DB 내부·자원·연결 계열일 때만이다. 쓰기 함수의 응답은 볼 수 없고 구조 검사가 맡는다
    if (r.status >= 500 && isServerFault(r.body)) problems.push(`${label} ${where}: 서버 오류 ${r.status} ${errorCode(r.body) ?? ""}`);
    if (r.status >= 300) return false;
    collectValues(r.body, pool);
    if (memoCanary) {
      const text = JSON.stringify(r.body);
      if (memoCanary.values.some((v) => text.includes(v))) memoHits.push(where);
      if (text.includes(memoCanary.orderNo)) orderSeen.push(where);
    }
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
    memoHits: [...new Set(memoHits)],
    orderSeen: [...new Set(orderSeen)],
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

/**
 * 구조 검사(together INV-F8): 메모 표를 참조하는 함수·뷰·권한. sql 은 piiTouchingFunctions 와 같은 꼴.
 * 함수는 로그인 키에 열렸는지와 상관없이 본다 — 닫힌 함수도 열린 함수가 부르면 길이 된다.
 */
export function memoStructureProblems(sql) {
  const problems = [];
  const re = new RegExp(`\\b${MEMO_TABLE}\\b`, "i");
  const names = new Set(
    sql("select n.nspname || '.' || p.proname || '(' || pg_get_function_identity_arguments(p.oid) || ')' || '|' || replace(replace(p.prosrc, chr(10), ' '), chr(13), ' ') from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname not in ('pg_catalog', 'information_schema')")
      .split(/\r?\n/)
      .map((line) => {
        const i = line.indexOf("|");
        return i < 0 ? null : re.test(line.slice(i + 1)) ? line.slice(0, i) : null;
      })
      .filter((n) => n !== null),
  );
  for (const name of [...names].sort()) {
    if (!(name in MEMO_FUNCTIONS)) problems.push(`구조: 메모 표(${MEMO_TABLE})를 참조하는 함수 ${name} — 허용 목록(등록·본인 상세·본인 목록) 밖이다`);
  }
  for (const name of Object.keys(MEMO_FUNCTIONS)) {
    if (!names.has(name)) problems.push(`구조: 허용 목록의 ${name} 는 이제 메모 표(${MEMO_TABLE})를 참조하지 않는다 — 목록에서 뺀다`);
  }
  const views = sql(`select distinct v.relname from pg_depend d join pg_rewrite w on w.oid = d.objid join pg_class v on v.oid = w.ev_class where d.refobjid = to_regclass('public.${MEMO_TABLE}') and v.oid <> d.refobjid`)
    .split(/\r?\n/)
    .filter(Boolean);
  for (const v of views) problems.push(`구조: 메모 표(${MEMO_TABLE})를 읽는 뷰 ${v} — 메모는 정해진 함수 셋으로만 나간다`);
  const table = sql(`select coalesce((select relrowsecurity::text from pg_class where oid = to_regclass('public.${MEMO_TABLE}')), 'missing')`).trim();
  if (table === "missing") problems.push(`구조: 메모 표(${MEMO_TABLE})가 없다 — 검사할 대상을 찾지 못했다`);
  else {
    if (table !== "true") problems.push(`구조: 메모 표(${MEMO_TABLE})의 행 보안이 꺼져 있다`);
    for (const role of ["anon", "authenticated"]) {
      for (const priv of ["select", "insert", "update", "delete"]) {
        if (sql(`select has_table_privilege('${role}', 'public.${MEMO_TABLE}', '${priv}')`).trim() === "t")
          problems.push(`구조: 메모 표(${MEMO_TABLE})에 화면 쪽 키(${role}) ${priv} 권한이 있다`);
      }
    }
  }
  return problems;
}

/** 응답 검사(together INV-F8): 심은 메모 값이 보낸 사람 말고 어느 권한에 나왔는지, 보낸 사람에게는 나왔는지. */
export function memoResponseProblems(roles, memoCanary) {
  if (!memoCanary) return [];
  const problems = [];
  for (const r of roles) {
    if (r.label === memoCanary.owner) continue;
    for (const where of r.memoHits) problems.push(`메모: ${r.label} ${where} 응답에 심은 메모 값이 있다`);
  }
  const owner = roles.find((r) => r.label === memoCanary.owner);
  if (!owner) problems.push(`메모: 보낸 사람 ${memoCanary.owner} 로 로그인하지 않았다 — 심은 값이 본인에게 나오는지 보지 못했다`);
  else if (owner.memoHits.length === 0) problems.push(`메모: 보낸 사람 ${memoCanary.owner} 의 응답 어디에도 심은 메모 값이 없다 — 심기가 안 됐거나 본인 읽기 함수가 빠졌다`);
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
 * @param {{ apiUrl: string, anonKey: string, logins: [string, string][], sql?: (q: string) => string, appUrl?: string, appDir?: string, memoCanary?: { values: string[], orderNo: string, owner: string } }} options
 */
export async function runPiiExposureCheck({ apiUrl, anonKey, logins, sql, appUrl, appDir = "", memoCanary }) {
  const problems = [];
  if (logins.length === 0) problems.push("로그인 계정이 없다 — 일반 사용자 권한도 검사해야 한다");
  if (!sql) problems.push("DB 연결이 없다 — 구조 검사(개인정보 구역에 닿는 함수)를 하지 못했다");
  if (problems.length > 0) return { roles: [], app: null, touching: [], problems };
  const sessions = [];
  for (const [email, password] of logins) sessions.push({ label: email.split("@")[0], token: await signIn(apiUrl, anonKey, email, password) });
  try {
    await assertReadOnlyGet(apiUrl, anonKey, sessions.map((s) => s.token));
    const roles = [await scanRole({ apiUrl, anonKey, label: "익명", memoCanary })];
    for (const s of sessions) roles.push(await scanRole({ apiUrl, anonKey, token: s.token, label: s.label, memoCanary }));
    const app = appUrl ? await scanAppGets(appUrl, appDir) : null;
    const touching = piiTouchingFunctions(sql);
    const columns = piiColumns(sql);
    for (const r of roles) problems.push(...r.problems, ...r.findings);
    if (app) problems.push(...app.findings);
    problems.push(...structureProblems(touching, columns));
    problems.push(...memoStructureProblems(sql));
    problems.push(...memoResponseProblems(roles, memoCanary));
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
