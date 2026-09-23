// 수집을 한 번 돌린다 (개발용). `/api/ingest` 는 Cron 이 부르는 자리라 인가가 걸려 있고,
// 손으로 부르려면 같은 헤더를 붙여야 한다.
//
// 출력 규칙(check-env.mjs·count-prompt-tokens.ts 와 같다): **비밀은 어디에도 찍지 않는다.**
// 여기서는 CRON_SECRET 을 헤더에 넣기만 하고 로그·에러 메시지에 담지 않는다.
//
// 실행: npm run ingest            (기본 http://localhost:3210)
//       npm run ingest -- --url http://localhost:3000
//
// 개발 서버가 먼저 떠 있어야 한다. 요약·번역 호출에 요금이 붙는다.

// 기본 가져오기로 받는다 — @next/env 는 CJS 라 .mjs 에서 이름 가져오기가 안 된다.
// (count-prompt-tokens.ts 는 tsx 가 CJS 로 옮겨 주므로 이름 가져오기가 되는데, 여기는 순수 ESM 이다.)
import nextEnv from "@next/env";

const { loadEnvConfig } = nextEnv;

loadEnvConfig(process.cwd(), true, { info: () => {}, error: () => {} });

const argv = process.argv.slice(2);
const at = argv.indexOf("--url");
const base = (at >= 0 ? argv[at + 1] : "http://localhost:3210").replace(/\/$/, "");

// 이 명령은 CRON_SECRET 을 Bearer 헤더로 보낸다. 주소를 검사하지 않으면 오타나
// 복사해 온 명령 한 줄로 **실제 비밀이 남의 호스트에** 나간다. 기본은 내 컴퓨터만 허용한다.
let target;
try {
  target = new URL(`${base}/api/ingest`);
} catch {
  console.error(`--url 이 주소가 아닙니다: ${base}`);
  process.exit(1);
}
if (target.protocol !== "http:" && target.protocol !== "https:") {
  console.error(`http/https 만 됩니다: ${target.protocol}`);
  process.exit(1);
}
const isLocal = ["localhost", "127.0.0.1", "[::1]", "::1"].includes(target.hostname);
if (!isLocal && !argv.includes("--allow-remote")) {
  console.error(
    `${target.hostname} 은 내 컴퓨터가 아닙니다. 비밀을 밖으로 보내려면 --allow-remote 를 명시하세요.`,
  );
  process.exit(1);
}
if (!isLocal && target.protocol !== "https:") {
  console.error("남의 호스트로는 https 로만 보냅니다 — http 면 비밀이 평문으로 나갑니다.");
  process.exit(1);
}

/**
 * 외부에서 온 문자열(제목·주소)을 터미널에 찍기 전에 제어문자를 지운다.
 *
 * 제목은 남의 피드에서 온 값이다. ANSI 이스케이프가 들어 있으면 **이미 찍은 줄을 덮어쓸 수**
 * 있어서, 수집 리포트가 사실과 다른 화면을 만든다. 이 리포트는 오판을 알아채는 통로다(INV-F2).
 */
const CONTROL_CHARS = new RegExp("[\\u0000-\\u001f\\u007f]", "g");
const plain = (s) => String(s).replace(CONTROL_CHARS, " ");

const secret = process.env.CRON_SECRET;
if (!secret) {
  console.error("CRON_SECRET 이 없습니다. 라우트가 503 으로 막습니다(설정 누락이 공개가 되면 안 되므로).");
  process.exit(1);
}

const started = Date.now();
let res;
try {
  res = await fetch(target, {
    // Vercel Cron 이 부르는 메서드와 같아야 한다 — 여기서 성공한 것이 배포에서도 성공한다는
    // 뜻이 되려면 같은 길을 타야 한다. 라우트도 GET 하나만 내보낸다.
    method: "GET",
    headers: { authorization: `Bearer ${secret}` },
    // 소스가 늘면 오래 걸린다. 라우트의 maxDuration(300초)보다 넉넉히 잡는다.
    signal: AbortSignal.timeout(600_000),
  });
} catch (e) {
  console.error(`요청 실패: ${e instanceof Error ? e.message : String(e)}`);
  console.error(`개발 서버가 ${base} 에 떠 있는지 확인하세요 (npm run dev).`);
  process.exit(1);
}

const seconds = ((Date.now() - started) / 1000).toFixed(1);
const text = await res.text();
if (!res.ok) {
  // 본문에 비밀이 들어갈 일은 없다 — 라우트는 사유만 돌려준다.
  console.error(`HTTP ${res.status} (${seconds}초): ${plain(text.slice(0, 500))}`);
  process.exit(1);
}

const report = JSON.parse(text);
const { topicFilter, extraction, summaries, titles, keywords, hotIssue, usage } = report;

console.log(`수집 완료 (${seconds}초)`);
for (const r of report.sources) {
  console.log(
    `  ${r.sourceId.padEnd(16)} 가져옴 ${r.fetched} · 적재 ${r.stored} · 버림 ${r.dropped}` +
      (r.error ? ` · 실패: ${plain(r.error)}` : ""),
  );
}
console.log(
  `  주제 판정   ${topicFilter.attempted}건 중 ${topicFilter.filtered}건 걸러냄 · 판정 실패 ${topicFilter.failedOpen}` +
    ` · 이미 아는 항목 ${topicFilter.alreadyKnown}건은 건너뜀` +
    // INV-F4: 안 찍으면 "0건 걸러냄"이 새 글이 없는 것인지 판정 없이 다 통과시킨 것인지 모른다.
    ` · 판정 안 거는 소스 ${topicFilter.notChecked}건`,
);
for (const title of topicFilter.filteredTitles) console.log(`      걸러냄: ${plain(title)}`);
// 실패 이유를 안 찍으면 "판정 실패 11" 이 크레딧 소진인지 타임아웃인지 알 수 없다.
for (const why of topicFilter.failureReasons ?? []) console.log(`      실패 이유: ${plain(why)}`);
// 핫이슈 판정은 적재 바로 다음 단계다(2026-09-20). **잘린 건수를 반드시 찍는다** —
// 매일 상한에 부딪혀 잘려 나가는데 화면에는 정상으로 보이면, 기준이 느슨한지 상한이
// 있으나 마나인지를 구별할 방법이 없다(hot-issue.md INV-N4).
// 단계가 통째로 안 돈 경우(`hotIssue === null`)도 반드시 남긴다 — 안 찍으면 "0건 뽑힘"과 같아진다.
if (hotIssue === null || hotIssue === undefined) {
  console.log("  핫이슈 판정  단계를 건너뜀 (시간 예산 소진)");
} else {
  console.log(
    `  핫이슈 판정  물어봄 ${hotIssue.attempted} · 저장 ${hotIssue.succeeded} · 실패 ${hotIssue.failed}` +
      ` · 뽑힘 ${hotIssue.gated}` +
      (hotIssue.duplicates > 0 ? ` · 같은 사건이라 뺌 ${hotIssue.duplicates}` : "") +
      (hotIssue.skipped > 0 ? ` · 예산에 밀림 ${hotIssue.skipped}` : "") +
      (hotIssue.error ? ` · ${plain(hotIssue.error)}` : ""),
  );
  for (const why of hotIssue.failureReasons ?? []) console.log(`      실패 이유: ${plain(why)}`);
  console.log(
    `  토큰(핫이슈) 호출 ${hotIssue.usage.calls} · 입력 ${hotIssue.usage.inputTokens}` +
      ` · 출력 ${hotIssue.usage.outputTokens}`,
  );
}
console.log(
  `  본문 추출   시도 ${extraction.attempted} · 성공 ${extraction.succeeded} · 실패 ${extraction.failed}` +
    (extraction.error ? ` · ${plain(extraction.error)}` : ""),
);
// 실패한 항목을 지목한다 — 건수만 보면 같은 항목이 매 주기 조용히 실패해도 알 수 없다.
for (const url of extraction.failedUrls) console.log(`      실패: ${plain(url)}`);
for (const why of extraction.failureReasons ?? []) console.log(`      실패 이유: ${plain(why)}`);
console.log(
  `  요약        시도 ${summaries.attempted} · 성공 ${summaries.succeeded} · 실패 ${summaries.failed} · 근거없음 ${summaries.skippedNoEvidence}` +
    (summaries.error ? ` · ${plain(summaries.error)}` : ""),
);
for (const title of summaries.failedTitles) console.log(`      실패: ${plain(title)}`);
for (const why of summaries.failureReasons ?? []) console.log(`      실패 이유: ${plain(why)}`);
console.log(
  `  제목 번역   시도 ${titles.attempted} · 성공 ${titles.succeeded} · 실패 ${titles.failed}` +
    (titles.error ? ` · ${plain(titles.error)}` : ""),
);
for (const title of titles.failedTitles) console.log(`      실패: ${plain(title)}`);
for (const why of titles.failureReasons ?? []) console.log(`      실패 이유: ${plain(why)}`);
// 뱃지 키워드는 맨 뒤 단계다. **"짚이는 것 없음"을 실패와 갈라 찍는다** — 뭉개면 파싱이 통째로
// 깨진 주기가 "이 글들엔 키워드가 없었다"로 읽히고 뱃지 줄만 조용히 비어 간다(run-keywords.ts:29).
// 단계가 통째로 죽거나(`error`) 예산에 밀려 안 돈 경우(`keywords === null`)도 반드시 남긴다 —
// 안 찍으면 둘 다 "키워드 0건"으로 보인다.
if (keywords === null || keywords === undefined) {
  console.log("  뱃지 키워드  단계를 건너뜀 (시간 예산 소진)");
} else {
  console.log(
    `  뱃지 키워드  물어봄 ${keywords.attempted} · 저장 ${keywords.succeeded} · 실패 ${keywords.failed}` +
      ` · 짚이는 것 없음 ${keywords.noKeywords}` +
      // **예산에 밀려 안 물어본 건수를 실패와 갈라 찍는다.** 뭉개면 "모델이 이상한 날"과
      // "시간이 빠듯한 날"이 리포트에서 같은 모양이 된다.
      (keywords.skipped > 0 ? ` · 예산에 밀림 ${keywords.skipped}` : "") +
      (keywords.error ? ` · ${plain(keywords.error)}` : ""),
  );
  for (const why of keywords.failureReasons ?? []) console.log(`      실패 이유: ${plain(why)}`);
  console.log(
    `  토큰(키워드) 호출 ${keywords.usage.calls} · 입력 ${keywords.usage.inputTokens}` +
      ` · 출력 ${keywords.usage.outputTokens}` +
      ` · 캐시읽기 ${keywords.usage.cacheReadTokens} · 캐시쓰기 ${keywords.usage.cacheWriteTokens}`,
  );
}
console.log(
  `  토큰(후처리) 호출 ${usage.calls} · 입력 ${usage.inputTokens} · 출력 ${usage.outputTokens} · 한 건 최대 입력 ${usage.maxInputTokens}`,
);
// 판정과 후처리를 합치지 않는다 — 판정은 건당 작고 건수가 많고, 후처리는 반대다.
console.log(
  `  토큰(판정)   호출 ${usage.topicCalls} · 입력 ${usage.topicInputTokens} · 출력 ${usage.topicOutputTokens}`,
);
// 단계마다 걸린 시간 (2026-09-22). 총 소요시간 하나만 찍으면 244초가 나와도 그중
// 주제 판정이 얼마인지 요약이 얼마인지 알 수 없고, 한 바퀴를 어떻게 나눌지를 추정으로
// 정하게 된다. 옛 실행 기록에는 이 칸이 없으므로 없으면 조용히 건너뛴다.
if (usage.stageMs) {
  const m = usage.stageMs;
  const sec = (ms) => `${(ms / 1000).toFixed(1)}초`;
  console.log(
    `  단계별 시간  피드 ${sec(m.feedMs)} · 판정 ${sec(m.topicMs)} · 적재 ${sec(m.storeMs)}` +
      ` · 핫이슈 ${sec(m.hotIssueMs)} · 본문 ${sec(m.extractionMs)}` +
      ` · 요약 ${sec(m.enrichmentMs)} · 키워드 ${sec(m.keywordsMs)}`,
  );
}

// 시간 예산에 걸려 건너뛴 것. 안 찍으면 뒤쪽 소스가 매일 0건인 것이
// "그 소스에 새 글이 없다"로 보인다 — notChecked 를 따로 찍는 이유와 같다.
const budget = report.budget;
if (budget?.exhausted) {
  console.log(
    `  ⏱ 시간 예산 소진 — 건너뜀: 소스 ${budget.skippedSources.length} · 선별판정 ${budget.skippedTopicChecks ?? 0} · 본문추출 ${budget.skippedExtractions} · 후처리 ${budget.skippedEnrichments}`,
  );
  if (budget.skippedSources.length > 0) {
    console.log(`      건너뛴 소스: ${budget.skippedSources.map(plain).join(", ")}`);
  }
}
if (report.failedSources.length > 0) {
  console.log(`  실패한 소스: ${report.failedSources.map(plain).join(", ")}`);
}

// 하루 요금 상한 (ingest-chaining-budget INV-CB8). 안 찍으면 상한에 걸린 날이
// "요약 0건·키워드 0건"으로만 보여서 글이 없던 날과 구별되지 않는다.
const cost = report.cost;
if (cost) {
  console.log(
    `  요금        오늘 $${Number(cost.spentUsd).toFixed(3)} / 상한 $${cost.capUsd}` +
      (cost.capped ? " · ⛔ 상한에 닿아 본문·요약·번역·키워드를 멈췄다" : "") +
      // 둘을 한 칸에 섞으면 조회가 깨진 날이 돈을 다 쓴 날처럼 보인다.
      (cost.lookupFailed ? " · ⚠ 오늘 합계를 못 읽어 상한에 닿은 것으로 봤다" : ""),
  );
} else {
  console.log("  요금        칸 없음 — 상한이 없던 시절의 배포이거나 마이그레이션 0010 이 안 갔다");
}

// 남은 일 (INV-CB12). **처리한 건수만 찍으면 그게 그날 전부인지 알 수 없다** —
// 2026-09-22 에 「요약 10건」을 보고 다 했다고 읽었는데 실은 상한에 잘린 것이었다.
const left = report.budget;
if (left) {
  const parts = [];
  if (left.skippedSources?.length > 0) parts.push(`소스 ${left.skippedSources.length}곳`);
  if (left.skippedTopicChecks > 0) parts.push(`주제 판정 ${left.skippedTopicChecks}`);
  if (left.skippedHotIssue) parts.push("핫이슈 단계 통째로");
  else if (left.skippedHotIssueItems > 0) parts.push(`핫이슈 ${left.skippedHotIssueItems}`);
  if (left.skippedExtractions > 0) parts.push(`본문 ${left.skippedExtractions}`);
  if (left.skippedEnrichments > 0) parts.push(`요약·번역 ${left.skippedEnrichments}`);
  if (left.skippedKeywords) parts.push("키워드 단계 통째로");
  else if (left.skippedKeywordItems > 0) parts.push(`키워드 ${left.skippedKeywordItems}`);
  if (left.poolTruncated) parts.push("⚠ 후보 조회가 잘렸다 — 더 있다");
  console.log(`  남은 일      ${parts.length === 0 ? "없다 — 그날 것을 다 했다" : parts.join(" · ")}`);
} else {
  console.log("  남은 일      칸 없음 — 이 칸이 없던 시절의 배포다");
}

// 이어달리기 (INV-CB1~CB5). `needed` 가 참인데 `dispatched` 가 거짓이면 이유는 둘뿐이다 —
// 목적지 설정이 없거나, 길이 상한에 닿았거나. 안 찍으면 그 둘과 "보냈는데 안 닿았다"가
// 전부 "다음 바퀴가 안 돌았다"로 보인다.
const chain = report.chain;
if (chain) {
  const where = chain.needed
    ? chain.dispatched
      ? "다음 호출을 보냈다"
      : "⚠ 보낼 데가 없다 — 목적지 설정이 없거나 길이 상한(20)에 닿았다"
    : "남은 일이 없어 안 보냈다";
  // 목적지를 아는지는 **보낼 일이 없던 날에도** 찍는다. 안 찍으면 설정이 빠진 것을
  // 실제로 이어달려야 하는 날까지 모른다 — 그날은 이미 글이 밀린 날이다.
  const target =
    chain.hasTarget === undefined
      ? " · 목적지 칸 없음 — 이 칸이 없던 시절의 배포다"
      : chain.hasTarget
        ? " · 목적지를 안다"
        : " · ⚠ 목적지를 모른다 (INGEST_BASE_URL 이 없거나 주소로 안 읽힌다)";
  console.log(`  이어달리기  ${chain.index}번째 바퀴 · ${where}${target}`);
} else {
  console.log("  이어달리기  칸 없음 — 이어달리기가 없던 시절의 배포다");
}
