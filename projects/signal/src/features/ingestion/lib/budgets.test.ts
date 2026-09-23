import { describe, expect, it } from "vitest";
import { BADGE_WINDOW_DAYS } from "@/entities/article";
import * as budgets from "./budgets";
import {
  CANDIDATE_WINDOW_DAYS,
  ENRICH_POOL,
  INGEST_BUDGET_MS,
  KEYWORD_BATCH,
  KEYWORD_CONCURRENCY,
  KEYWORD_MAX_TOKENS,
  KEYWORD_TIMEOUT_MS,
  MAX_FAILURE_REASON_LENGTH,
  MAX_FAILURE_REASONS,
  MAX_FETCH_BYTES,
  MAX_TITLE_LENGTH,
  TOPIC_CONCURRENCY,
  TOPIC_MAX_TOKENS,
  TOPIC_TIMEOUT_MS,
  DAILY_COST_CAP_USD,
  ENRICH_TIMEOUT_MS,
  EXTRACTION_TIMEOUT_MS,
  HOT_ISSUE_TIMEOUT_MS,
  MAX_CHAIN_LENGTH,
  WORST_CASE_MS,
} from "./budgets";

/**
 * 값 자체를 못 박는 테스트 (2026-08-13 리뷰).
 *
 * 왜 이런 테스트가 필요한가: 이 값들은 "동작"이 아니라 "얼마나 하는지"를 정한다.
 * 동작 테스트는 값이 무엇이든 통과하므로, 값이 조용히 바뀌면 아무도 모른다.
 * 7세션에 `MAX_RATIO` 를 10 → 100 으로 바꿔도 전부 green 이었던 것과 같은 자리다.
 *
 * 관계 단언(`ENRICH_POOL > ENRICH_BATCH` 등)을 같이 두는 이유: 값을 바꿀 때 **왜 그 값이어야
 * 하는지**가 테스트에 남는다. 값만 못 박으면 다음 사람이 숫자만 고치고 지나간다.
 */
describe("수집 예산 상수", () => {
  it("후보 창 — 뱃지 줄의 창과 같아야 «뱃지엔 있는데 키워드는 없는 글»이 안 생긴다", () => {
    expect(CANDIDATE_WINDOW_DAYS).toBe(3);
    // 두 창이 갈리면 그 차이는 화면에 조용히 나타난다: 좁으면 뱃지에만 있는 글이 생기고,
    // 넓으면 화면에 안 쓰일 글에 요금을 쓴다. 같이 움직여야 하므로 관계를 못 박는다.
    expect(CANDIDATE_WINDOW_DAYS).toBe(BADGE_WINDOW_DAYS);
  });

  it("주제 판정 응답 상한 — 모델이 생각을 마칠 만큼은 줘야 필터가 조용히 안 열린다", () => {
    expect(TOPIC_MAX_TOKENS).toBe(400);
    expect(TOPIC_TIMEOUT_MS).toBe(15_000);
    // 2026-09-22 실측: 200 일 때 218건 중 49건이 `stop=max_tokens` 로 죽었고,
    // 판정 실패는 INV-F3 에 따라 **통과**로 처리된다 — 필터가 5분의 1쯤 안 돈 것이다.
    // 정상 응답이 32토큰이었던 2026-08-12 기준으로도 한참 위여야 한다.
    expect(TOPIC_MAX_TOKENS).toBeGreaterThan(200);
  });

  it("후보 풀 — 하루 신규(약 68건)를 한 바퀴에 다 담고도 남아야 한다 (INV-CB11)", () => {
    expect(ENRICH_POOL).toBe(500);
    // 건수 상한이 없어졌으므로 이 값이 한 바퀴가 볼 수 있는 전부다. 여기서 잘리면
    // 그 사실이 리포트의 `poolTruncated` 로 나가고 다음 바퀴가 이어받는다.
    // 하루 신규의 몇 배는 돼야 평소에 잘리지 않는다.
    expect(ENRICH_POOL).toBeGreaterThan(68 * 5);
  });

  it("키워드 배치 — 하루 신규(약 68건)를 한 주기에 소화해야 뱃지 줄이 안 빈다", () => {
    expect(KEYWORD_BATCH).toBe(80);
    expect(KEYWORD_CONCURRENCY).toBe(8);
    // 요약 배치와 같아지면 하루 신규의 8분의 1만 처리된다 — 키워드 없는 글은 어느 뱃지에도
    // 안 들어가므로, 밀리는 순간 화면에서 사라진 것처럼 보인다.
    // 동시 수가 배치와 같아지면 청크가 하나뿐이라 **앵커가 한 번도 안 자란다**(INV-B3).
    // 그러면 이번 주기에 새로 나온 표기가 같은 주기 안에서 안 합쳐진다.
    expect(KEYWORD_CONCURRENCY).toBeLessThan(KEYWORD_BATCH);
  });

  it("키워드 한 건의 시간·토큰 상한 (2026-08-31 에 server-only 밖으로 내려왔다)", () => {
    expect(KEYWORD_TIMEOUT_MS).toBe(15_000);
    expect(KEYWORD_MAX_TOKENS).toBe(300);
    // **최악치가 전체 예산 안에 들어와야 한다.** 청크 수 × 타임아웃이 예산을 넘으면
    // 함수가 Vercel 300초에서 죽고 응답 본문이 없어 그날 리포트가 통째로 사라진다.
    // (이 관계가 깨지면 `runKeywords` 의 청크별 예산 가드가 유일한 방벽이 된다.)
    const chunks = Math.ceil(KEYWORD_BATCH / KEYWORD_CONCURRENCY);
    expect(chunks * KEYWORD_TIMEOUT_MS).toBeLessThan(INGEST_BUDGET_MS);
    // 40토큰이면 되는 형식에 300을 주는 이유는 thinking 블록이다 — 2026-08-12 에
    // 주제 판정이 `max_tokens: 5` 로 텍스트를 0글자로 돌려주며 조용히 죽었다.
    expect(KEYWORD_MAX_TOKENS).toBeGreaterThan(40);
  });

  it("소스당 상한과 한 바퀴 건수 상한은 **없다** (INV-CB11)", () => {
    // 이 검사는 값을 못 박는 것이 아니라 **값이 돌아오는 것**을 막는다. 상한을 다시
    // 넣으면 2026-09-22 의 사고(하루 열 건)가 그대로 돌아오고, 증상은 「요약이 좀 적네」
    // 하나뿐이라 며칠이 지나야 눈치챈다.
    const names = Object.keys(budgets);
    expect(names).not.toContain("ENRICH_BATCH");
    expect(names).not.toContain("PER_SOURCE_ENRICH_LIMIT");
  });

  it("리포트에 싣는 제목 길이 — 남의 서버가 준 문자열이 로그로 그대로 흘러가지 않게", () => {
    // 개수는 못 막는다: INV-F2 가 걸러진 것 **전부**의 제목을 요구한다. 그래서 한 줄 길이만
    // 막고, 정상값(한국어 제목 40자 안팎)은 안 건드리게 넉넉히 둔다.
    expect(MAX_TITLE_LENGTH).toBe(120);
    // 실패 이유보다 **좁다**: 제목은 크기를 아는 값이고(한국어 40자 안팎), 실패 이유는
    // 남의 서버 메시지라 무엇이 올지 모르니 더 넉넉해야 한다.
    expect(MAX_TITLE_LENGTH).toBeLessThan(MAX_FAILURE_REASON_LENGTH);
  });

  it("주제 판정 동시 건수 — 무제한이 아니다 (429 를 맞으면 INV-F3 이 필터를 조용히 연다)", () => {
    expect(TOPIC_CONCURRENCY).toBe(8);
    expect(TOPIC_CONCURRENCY).toBeGreaterThanOrEqual(1);
    // 소스당 최대 50건이라, 이보다 크면 상한이 실질적으로 사라진다.
    expect(TOPIC_CONCURRENCY).toBeLessThan(50);
  });

  it("시간 예산 — Vercel 함수 상한(300초)보다 작아야 리포트를 돌려줄 시간이 남는다", () => {
    expect(INGEST_BUDGET_MS).toBe(240_000);
    // 상한과 같거나 크면 예산 가드가 켜지기 전에 함수가 먼저 죽는다 = 가드가 없는 것과 같다.
    expect(INGEST_BUDGET_MS).toBeLessThan(300_000);
  });

  it("외부 응답 바이트 상한", () => {
    expect(MAX_FETCH_BYTES).toBe(2_000_000);
    expect(MAX_FETCH_BYTES).toBeGreaterThan(0);
  });

  it("실패 이유 — 개수와 한 줄 길이 둘 다 막는다", () => {
    expect(MAX_FAILURE_REASONS).toBe(5);
    expect(MAX_FAILURE_REASON_LENGTH).toBe(200);
  });

  it("INV-CB5: 이어달리기 길이 상한 — 안 멈추는 버그를 끊는 자리다", () => {
    expect(MAX_CHAIN_LENGTH).toBe(20);
    // 1 이면 이어달리기가 아예 없는 것과 같고(첫 호출이 곧 마지막이다), 그러면
    // 한 바퀴가 300초 안에 안 끝나는 지금 상태가 그대로 남는다.
    expect(MAX_CHAIN_LENGTH).toBeGreaterThan(1);
    // 한 호출이 한 바퀴 예산만큼 일하므로, 이 곱이 곧 최대 연쇄 시간이다.
    // 두 시간을 넘기면 다음 예약 실행과 겹칠 수 있다(예약은 한 시간 간격이 기준).
    expect(MAX_CHAIN_LENGTH * INGEST_BUDGET_MS).toBeLessThanOrEqual(2 * 60 * 60 * 1000);
  });

  it("INV-CB6~CB8: 하루 요금 상한 — 평소의 대여섯 배여야 몰린 날에 안 걸린다", () => {
    expect(DAILY_COST_CAP_USD).toBe(10);
    // 2026-09-22 실측: 평범한 날 약 $1.71, 두 배로 몰린 날 약 $2.19.
    // 몰린 날의 곱절 아래로 내려가면 상한이 "비정상을 끊는 장치"가 아니라
    // 할당량이 되고, 걸리는 날 화면이 조용히 얇아진다.
    expect(DAILY_COST_CAP_USD).toBeGreaterThan(2.19 * 2);
    // 위로도 막는다 — 나쁜 하루의 청구서가 이 값이다.
    expect(DAILY_COST_CAP_USD).toBeLessThanOrEqual(20);
  });

  it("INV-CB9: 단계별 최악 소요 시간 — 그 단계의 타임아웃과 같은 값이어야 한다", () => {
    expect(EXTRACTION_TIMEOUT_MS).toBe(15_000);
    expect(ENRICH_TIMEOUT_MS).toBe(30_000);
    // 타임아웃보다 오래 걸리는 길이 없으므로 최악치가 곧 타임아웃이다.
    // 둘이 갈리면 "시작해도 못 끝낼 건"을 틀린 수로 판단하게 된다.
    expect(WORST_CASE_MS.topic).toBe(TOPIC_TIMEOUT_MS);
    expect(WORST_CASE_MS.hotIssue).toBe(HOT_ISSUE_TIMEOUT_MS);
    expect(WORST_CASE_MS.extraction).toBe(EXTRACTION_TIMEOUT_MS);
    expect(WORST_CASE_MS.enrich).toBe(ENRICH_TIMEOUT_MS);
    expect(WORST_CASE_MS.keywords).toBe(KEYWORD_TIMEOUT_MS);
    // 최악치 하나가 한 바퀴 예산을 넘으면 그 단계는 **영영 시작되지 않는다**.
    for (const ms of Object.values(WORST_CASE_MS)) {
      expect(ms).toBeGreaterThan(0);
      expect(ms).toBeLessThan(INGEST_BUDGET_MS);
    }
  });
});
