// 환경변수 **이름**이 맞는지만 확인한다. 값은 어디에도 출력하지 않는다.
//
// 이 스크립트가 존재하는 이유: 이름이 틀리면 `process.env.X` 가 조용히 undefined 가 되고,
// 증상은 한참 뒤 "Supabase 클라이언트 생성 실패"로 나타난다. 어느 이름이 없는지 바로 보게 한다.
//
// 출력 규칙(어기지 말 것): 이름과 있음/없음만. 값·길이·앞글자 어느 것도 찍지 않는다.
// 예외 하나 — Supabase 프로젝트 ref 는 비밀이 아니고(DECISIONS 2026-07-24)
// 마이그레이션 적용에 필요해서 URL 에서 뽑아 보여준다.

// @next/env 는 CommonJS 라 이름 있는 import 가 안 된다 — 기본 export 로 받는다.
import nextEnv from "@next/env";

// Next 가 쓰는 것과 같은 로더다. 우리가 .env 를 직접 파싱하면 규칙(우선순위·따옴표 처리)이
// 실제 실행과 갈릴 수 있고, 그러면 "여기선 보이는데 앱에선 안 보인다"가 된다.
nextEnv.loadEnvConfig(process.cwd(), true, { info: () => {}, error: () => {} });

const PUBLIC = ["NEXT_PUBLIC_SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY"];
const SERVER = ["SUPABASE_SECRET_KEY", "ANTHROPIC_API_KEY"];

/** 흔히 헷갈리는 다른 이름들 — 이게 잡히면 "없음"의 원인이 오타가 아니라 이름 규칙이다. */
const NEAR_MISSES = [
  "SUPABASE_URL",
  "NEXT_SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_ANON_KEY",
  "SUPABASE_ANON_KEY",
  "SUPABASE_PUBLISHABLE_KEY",
  "NEXT_SUPABASE_PUBLISHABLE_KEY",
  "NEXT_PUBLIC_SUPABASE_KEY",
];

const has = (name) => typeof process.env[name] === "string" && process.env[name].trim() !== "";
const mark = (name) => `  ${has(name) ? "있음  " : "없음  "} ${name}`;

console.log("공개 (브라우저까지 감)");
for (const n of PUBLIC) console.log(mark(n));
console.log("\n서버 전용 (아직 없어도 된다 — 수집·요약 붙일 때 필요)");
for (const n of SERVER) console.log(mark(n));

const found = NEAR_MISSES.filter(has);
if (found.length > 0) {
  console.log("\n⚠ 비슷한 다른 이름이 설정돼 있다:");
  for (const n of found) console.log(`  ${n}`);
  console.log("  → Next 는 NEXT_PUBLIC_ 접두사가 붙은 것만 브라우저로 보낸다.");
  console.log("    위 '공개' 목록의 이름으로 바꿔야 한다 (.env.example 참조).");
}

// 키의 **종류**만 알린다(값이 아니다). "Invalid API key" 가 났을 때 원인이
// 오타인지, 다른 프로젝트의 키인지, 형식이 아예 아닌지를 가르는 데 필요하다.
const key = (process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? "").trim();
if (key !== "") {
  const kind = key.startsWith("sb_publishable_")
    ? "새 형식 publishable (sb_publishable_…)"
    : key.startsWith("sb_secret_")
      ? "⚠ secret 키다 — 공개 자리에 두면 안 된다"
      : key.startsWith("eyJ")
        ? "예전 형식 anon JWT (eyJ…)"
        : "⚠ 알아볼 수 없는 형식";
  console.log(`\n공개 키 종류: ${kind}`);
  // 붙여넣기 사고를 잡는 정보만 — 값은 안 찍는다.
  const raw = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? "";
  if (raw !== raw.trim()) console.log("  ⚠ 앞뒤에 공백·개행이 붙어 있다.");
  if (/^["']|["']$/.test(raw.trim())) console.log("  ⚠ 따옴표가 값에 포함돼 있다.");
  if (/\s/.test(key)) console.log("  ⚠ 값 중간에 공백·개행이 있다 — 붙여넣다 잘렸을 수 있다.");
  if (key.startsWith("sb_publishable_")) {
    const body = key.slice("sb_publishable_".length);
    console.log(`  길이: ${key.length}자 (접두사 뒤 ${body.length}자)`);
    if (!/^[A-Za-z0-9_-]+$/.test(body)) console.log("  ⚠ 키에 쓰이지 않는 문자가 섞여 있다.");
    if (body.length < 30) console.log("  ⚠ 너무 짧다 — 값이 잘렸을 가능성이 크다.");
  }
  if (key.startsWith("eyJ")) {
    // JWT 의 payload 는 서명 없이 누구나 읽을 수 있는 공개 부분이다. role 과 ref 만 본다.
    try {
      const p = JSON.parse(Buffer.from(key.split(".")[1], "base64url").toString());
      console.log(`  role: ${p.role ?? "?"} / 키가 가리키는 ref: ${p.ref ?? "?"}`);
    } catch {
      console.log("  ⚠ JWT 처럼 생겼는데 payload 를 못 읽는다 — 값이 잘렸을 수 있다.");
    }
  }
}

// secret 키도 **종류만**. 공개 키와 세대가 다르면("예전 JWT" vs "새 sb_ 형식")
// 그 자체가 "다른 데서 복사해 왔다"는 신호다.
const secret = (process.env.SUPABASE_SECRET_KEY ?? "").trim();
if (secret !== "") {
  const kind = secret.startsWith("sb_secret_")
    ? "새 형식 secret (sb_secret_…)"
    : secret.startsWith("eyJ")
      ? "예전 형식 service_role JWT (eyJ…)"
      : "⚠ 알아볼 수 없는 형식";
  console.log(`서버 키 종류: ${kind}`);
  if (secret.startsWith("eyJ")) {
    try {
      const p = JSON.parse(Buffer.from(secret.split(".")[1], "base64url").toString());
      console.log(`  role: ${p.role ?? "?"} / 키가 가리키는 ref: ${p.ref ?? "?"}`);
    } catch {
      console.log("  ⚠ payload 를 못 읽는다 — 값이 잘렸을 수 있다.");
    }
  }
}

const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const ref = /^https:\/\/([a-z0-9]+)\.supabase\.co\/?$/.exec(url.trim())?.[1];
if (ref) {
  console.log(`\n프로젝트 ref: ${ref}  (비밀 아님 — 마이그레이션 적용에 쓴다)`);
} else if (url !== "") {
  console.log("\n⚠ URL 이 https://<ref>.supabase.co 모양이 아니다.");
}

const missing = PUBLIC.filter((n) => !has(n));
if (missing.length > 0) {
  console.log(`\n공개 변수 ${missing.length}개가 없다 — 위 이름 그대로 .env 에 넣어야 한다.`);
  process.exit(1);
}
console.log("\n공개 변수 이름 확인됨.");

// ── 실제로 붙여 본다 ────────────────────────────────────────────────────────
// 이름과 형식이 다 맞아도 **다른 프로젝트의 키**면 서버가 거절한다. 그건 여기서만 드러난다
// (2026-08-09 에 실제로 그랬다 — 형식·길이 다 정상인데 Invalid API key).
// --offline 을 주면 건너뛴다.
if (!process.argv.includes("--offline")) {
  const probe = async (label, apikey) => {
    if (!apikey) return;
    try {
      const res = await fetch(`${url.replace(/\/$/, "")}/rest/v1/item?select=id&limit=1`, {
        headers: { apikey, Authorization: `Bearer ${apikey}` },
      });
      if (res.ok) {
        console.log(`  ${label}: 붙었다 (item 조회 OK)`);
        return;
      }
      // 응답 본문에는 키가 들어가지 않는다 — PostgREST 의 오류 메시지뿐이다.
      const body = await res.text();
      const msg = (() => {
        try {
          return JSON.parse(body).message ?? body;
        } catch {
          return body;
        }
      })();
      console.log(`  ${label}: 거절됨 (HTTP ${res.status}) — ${String(msg).slice(0, 120)}`);
      if (/Invalid API key/i.test(String(msg))) {
        console.log("    → 형식은 맞는데 이 프로젝트의 키가 아니다. 대시보드에서 다시 복사하세요.");
        console.log(`       (이 URL 이 가리키는 프로젝트: ${ref ?? "?"})`);
      }
    } catch (e) {
      console.log(`  ${label}: 요청 실패 — ${e instanceof Error ? e.message : String(e)}`);
    }
  };

  console.log("\n실제 연결 확인");
  await probe("publishable", process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY);
  await probe("secret     ", process.env.SUPABASE_SECRET_KEY);
}
