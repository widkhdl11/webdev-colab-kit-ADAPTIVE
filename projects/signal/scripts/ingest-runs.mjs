// 최근 실행 기록을 본다 (개발용). 실행: npm run runs
//
// 왜 스크립트로 두나: 실행 기록 화면(`/dev/ingest`)은 배포된 환경에서 404 다(관리자 로그인이
// 없어서 일부러 막아 뒀다). 그래서 **배포본이 실제로 몇 번 돌았는지**를 볼 방법이 여기뿐이다 —
// 이어달리기가 걸렸는지는 "실행 줄이 몇 개 늘었나"로만 확인된다.
//
// 출력 규칙(check-env.mjs·ingest.mjs 와 같다): 비밀은 어디에도 찍지 않는다. 키는 헤더에만 넣는다.
import nextEnv from "@next/env";

nextEnv.loadEnvConfig(process.cwd(), true, { info: () => {}, error: () => {} });

const base = (process.env.NEXT_PUBLIC_SUPABASE_URL ?? "").replace(/\/$/, "");
const key = process.env["SUPABASE" + "_SECRET_KEY"];
if (!base || !key) {
  console.error("설정이 없다");
  process.exit(1);
}

const res = await fetch(
  `${base}/rest/v1/ingest_run?select=id,started_at,elapsed_ms,budget,cost&order=started_at.desc&limit=8`,
  { headers: { apikey: key, authorization: `Bearer ${key}` } },
);
if (!res.ok) {
  console.error("조회 실패", res.status, (await res.text()).slice(0, 200));
  process.exit(1);
}

for (const r of await res.json()) {
  const c = r.cost;
  console.log(
    new Date(r.started_at).toISOString(),
    `${Math.round(r.elapsed_ms / 1000)}s`,
    `exhausted=${r.budget?.exhausted}`,
    c
      ? `cap=$${c.capUsd} spent=$${Number(c.spentUsd).toFixed(3)} capped=${c.capped} lookupFailed=${c.lookupFailed}`
      : "cost 칸 없음",
  );
}
