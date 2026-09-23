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

/**
 * 그 바퀴에 **안 끝난 일**을 한 줄로 (INV-CB12).
 *
 * `exhausted` 만 찍으면 참/거짓뿐이라 "조금 남았다"와 "273건 남았다"가 같은 모양이 된다.
 * 건수는 이미 `budget` 칸에 통째로 저장돼 있다 — 그 칸이 자유 형식이라 리포트에 칸이
 * 늘면 저장도 같이 늘었다. 여기서는 읽어서 찍기만 한다.
 *
 * 옛 행에는 이 칸들이 없다. 그때는 `?` 로 남긴다 — 0 으로 찍으면 「다 했다」로 보인다.
 */
function leftOver(b) {
  if (!b) return "남은 일 모름";
  const n = (v) => (typeof v === "number" ? v : null);
  const parts = [];
  if (b.skippedSources?.length > 0) parts.push(`소스 ${b.skippedSources.length}`);
  if (n(b.skippedTopicChecks) > 0) parts.push(`판정 ${b.skippedTopicChecks}`);
  if (b.skippedHotIssue === true) parts.push("핫이슈 통째로");
  else if (n(b.skippedHotIssueItems) > 0) parts.push(`핫이슈 ${b.skippedHotIssueItems}`);
  if (n(b.skippedExtractions) > 0) parts.push(`본문 ${b.skippedExtractions}`);
  if (n(b.skippedEnrichments) > 0) parts.push(`요약 ${b.skippedEnrichments}`);
  if (b.skippedKeywords === true) parts.push("키워드 통째로");
  else if (n(b.skippedKeywordItems) > 0) parts.push(`키워드 ${b.skippedKeywordItems}`);
  if (b.poolTruncated === true) parts.push("후보 잘림");
  if (parts.length > 0) return `남은 일 ${parts.join(" · ")}`;
  // 여기서 갈린다: 「다 했다」와 「옛 기록이라 셀 칸이 없다」는 다르다.
  return b.exhausted === true ? "남은 일 ? (건수 칸이 없던 시절)" : "남은 일 없음";
}

const rows = await res.json();
for (const [i, r] of rows.entries()) {
  const c = r.cost;
  // 앞 줄(더 최근)과 몇 분 떨어져 있나. 한 바퀴가 4분쯤이므로 그만큼이면 **이어달린 것**이다 —
  // 이어달리기 여부는 따로 저장할 필요가 없다. 시각이 이미 말해 준다.
  const prev = rows[i - 1];
  const gapMin = prev
    ? (Date.parse(prev.started_at) - Date.parse(r.started_at)) / 60000
    : null;
  const chained = gapMin !== null && gapMin > 0 && gapMin < 8 ? " ↘ 이어달림" : "";
  console.log(
    new Date(r.started_at).toISOString(),
    `${Math.round(r.elapsed_ms / 1000)}s`,
    c
      ? `$${Number(c.spentUsd).toFixed(3)}/$${c.capUsd}${c.capped ? " ⛔상한" : ""}${c.lookupFailed ? " ⚠합계못읽음" : ""}`
      : "cost 칸 없음",
    `· ${leftOver(r.budget)}${chained}`,
  );
}
