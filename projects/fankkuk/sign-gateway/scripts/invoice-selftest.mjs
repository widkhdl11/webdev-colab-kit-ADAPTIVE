// 송장 출력 자체 시험 — 서버에서 서비스와 같은 계정·설정·네트워크 제한으로 돌린다:
//   sudo bash /opt/sign-gateway/scripts/invoice-selftest.sh
//
// 송장 출력 함수가 맨 처음 부르는 DB 함수(invoice_print_context — 판정 재료 읽기, 쓰지 않음)를 없는 QR 로 부른다.
// ① 복호화 DB 토큰으로 → 정상 응답(없는 QR 이라 null)이어야 한다 — 토큰 서명·역할·함수 권한이 다 맞다는 뜻
// ② 토큰 없이(공개 키만) → 거부돼야 한다 — ① 이 통과한 것이 역할 덕분인지 가르는 비교(위반을 심어 보는 항목)
// ③ 로그인 확인 주소(auth)에 닿는지 — 대표 로그인 토큰 검증이 이 길을 쓴다
// 없는 QR 이라 아무것도 열리지 않고 열람 기록도 남지 않는다. 출력은 상태 코드와 DB 오류 코드뿐이다(토큰·키는 찍지 않는다).

import { loadConfig } from "../lib/config.mjs";
import { createGuardedFetch } from "../lib/guarded-fetch.mjs";

const config = loadConfig();
const inv = config.invoice;
const missing = ["supabaseUrl", "supabaseKey", "dbKey", "ownerUserId"].filter((k) => !inv[k]);
if (missing.length > 0) {
  console.log(`설정 비어 있음: ${missing.join(", ")}`);
  process.exit(1);
}
const guarded = createGuardedFetch([new URL(inv.supabaseUrl).hostname]);
// DB 주소는 비밀이 아니다 — 어느 DB 를 보고 있는지 알아야 결과를 읽을 수 있다
console.log(`DB 주소: ${new URL(inv.supabaseUrl).hostname} · 시험 사이트 표시: ${inv.testSite ? "켜짐" : "꺼짐"}`);
const QR = "Q-000000"; // 꼴(Q-숫자 6자리)은 맞고 발급되지 않는 번호

async function rpc(withToken) {
  const headers = { apikey: inv.supabaseKey, "content-type": "application/json" };
  if (withToken) headers.authorization = `Bearer ${inv.dbKey}`;
  const res = await guarded(`${inv.supabaseUrl}/rest/v1/rpc/invoice_print_context`, {
    method: "POST",
    headers,
    body: JSON.stringify({ p_qr: QR }),
  });
  const text = await res.text();
  let code = "";
  let message = "";
  try {
    const j = JSON.parse(text);
    code = j?.code ?? "";
    message = j?.message ?? "";
  } catch {
    // 본문이 JSON 이 아니면 상태 코드만 본다
  }
  return { status: res.status, body: text.trim(), code, message };
}

let failed = false;

const a = await rpc(true);
if (a.status === 200 && a.body === "null") {
  console.log("통과 ① — 복호화 DB 토큰으로 판정 재료 읽기 함수가 정상 응답(없는 QR → 없음)");
} else {
  failed = true;
  console.log(`실패 ① — 상태 ${a.status} ${a.code} ${a.message}`.trim());
  if (a.status === 401) console.log("   토큰을 DB 가 받지 않았다 — JWT 비밀이 이 프로젝트의 것인지, 폐기되지 않았는지 본다(set-decrypt-db-key.mjs 다시)");
  if (a.code === "42501") console.log("   토큰은 통했지만 권한이 없다 — 이 DB 에 복호화 전용 역할·함수 권한(supabase/manual/0008~0010)이 적용됐는지 본다");
  if (a.code === "PGRST202") console.log("   함수가 없다 — supabase/manual/0008~0010 이 이 DB 에 적용되지 않았다");
  if (a.code === "22P02" || a.code === "PGRST116") console.log("   함수는 있지만 응답 꼴이 다르다 — 이 DB 의 수동 SQL 판이 앱과 같은지 본다");
}

const b = await rpc(false);
if (b.status === 401 || b.status === 403 || b.code === "42501") {
  console.log(`통과 ② — 토큰 없이는 거부(${b.status}${b.code ? ` ${b.code}` : ""}) — ① 은 복호화 역할 덕분이다`);
} else {
  failed = true;
  console.log(`실패 ② — 토큰 없이도 응답했다(상태 ${b.status}) — 판정 재료 함수가 공개 역할에 열려 있다`);
}

const c = await guarded(`${inv.supabaseUrl}/auth/v1/settings`, { headers: { apikey: inv.supabaseKey } });
if (c.status === 200) console.log("통과 ③ — 로그인 확인 주소에 닿는다");
else {
  failed = true;
  console.log(`실패 ③ — 로그인 확인 주소 상태 ${c.status} — SUPABASE_PUBLISHABLE_KEY 가 이 프로젝트의 것인지 본다`);
}

process.exit(failed ? 1 : 0);
