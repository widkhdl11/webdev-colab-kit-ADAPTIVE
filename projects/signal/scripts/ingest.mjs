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
    method: "POST",
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
const { topicFilter, extraction, summaries, titles, usage } = report;

console.log(`수집 완료 (${seconds}초)`);
for (const r of report.sources) {
  console.log(
    `  ${r.sourceId.padEnd(16)} 가져옴 ${r.fetched} · 적재 ${r.stored} · 버림 ${r.dropped}` +
      (r.error ? ` · 실패: ${plain(r.error)}` : ""),
  );
}
console.log(
  `  주제 판정   ${topicFilter.attempted}건 중 ${topicFilter.filtered}건 걸러냄 · 판정 실패 ${topicFilter.failedOpen}` +
    ` · 이미 아는 항목 ${topicFilter.alreadyKnown}건은 건너뜀`,
);
for (const title of topicFilter.filteredTitles) console.log(`      걸러냄: ${plain(title)}`);
console.log(
  `  본문 추출   시도 ${extraction.attempted} · 성공 ${extraction.succeeded} · 실패 ${extraction.failed}` +
    (extraction.error ? ` · ${plain(extraction.error)}` : ""),
);
// 실패한 항목을 지목한다 — 건수만 보면 같은 항목이 매 주기 조용히 실패해도 알 수 없다.
for (const url of extraction.failedUrls) console.log(`      실패: ${plain(url)}`);
console.log(
  `  요약        시도 ${summaries.attempted} · 성공 ${summaries.succeeded} · 실패 ${summaries.failed} · 근거없음 ${summaries.skippedNoEvidence}` +
    (summaries.error ? ` · ${plain(summaries.error)}` : ""),
);
for (const title of summaries.failedTitles) console.log(`      실패: ${plain(title)}`);
console.log(
  `  제목 번역   시도 ${titles.attempted} · 성공 ${titles.succeeded} · 실패 ${titles.failed}` +
    (titles.error ? ` · ${plain(titles.error)}` : ""),
);
for (const title of titles.failedTitles) console.log(`      실패: ${plain(title)}`);
console.log(
  `  토큰(후처리) 호출 ${usage.calls} · 입력 ${usage.inputTokens} · 출력 ${usage.outputTokens} · 한 건 최대 입력 ${usage.maxInputTokens}`,
);
// 판정과 후처리를 합치지 않는다 — 판정은 건당 작고 건수가 많고, 후처리는 반대다.
console.log(
  `  토큰(판정)   호출 ${usage.topicCalls} · 입력 ${usage.topicInputTokens} · 출력 ${usage.topicOutputTokens}`,
);
if (report.failedSources.length > 0) {
  console.log(`  실패한 소스: ${report.failedSources.map(plain).join(", ")}`);
}
