import { describe, expect, it } from "vitest";
import {
  ENRICH_BATCH,
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
  PER_SOURCE_ENRICH_LIMIT,
  TOPIC_CONCURRENCY,
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
  it("요약 배치와 후보 풀 — 풀이 배치보다 충분히 넓어야 '점수로 고른다'가 의미를 갖는다", () => {
    expect(ENRICH_BATCH).toBe(10);
    expect(ENRICH_POOL).toBe(500);
    // 풀이 배치와 같아지면 받은 게 곧 답이 되어 pickEnrichTargets 가 항등 함수가 된다.
    // 그 상태는 이번에 고친 버그(한 매체가 10칸 독식) 그 자체다.
    expect(ENRICH_POOL).toBeGreaterThanOrEqual(ENRICH_BATCH * 20);
  });

  it("키워드 배치 — 하루 신규(약 68건)를 한 주기에 소화해야 뱃지 줄이 안 빈다", () => {
    expect(KEYWORD_BATCH).toBe(80);
    expect(KEYWORD_CONCURRENCY).toBe(8);
    // 요약 배치와 같아지면 하루 신규의 8분의 1만 처리된다 — 키워드 없는 글은 어느 뱃지에도
    // 안 들어가므로, 밀리는 순간 화면에서 사라진 것처럼 보인다.
    expect(KEYWORD_BATCH).toBeGreaterThan(ENRICH_BATCH * 5);
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

  it("소스당 상한 — 1 이상이고 배치보다 작아야 상한이 상한 노릇을 한다", () => {
    expect(PER_SOURCE_ENRICH_LIMIT).toBe(3);
    expect(PER_SOURCE_ENRICH_LIMIT).toBeGreaterThanOrEqual(1);
    // 배치와 같거나 크면 한 소스가 다시 전부 가져갈 수 있다 = 상한이 없는 것과 같다.
    expect(PER_SOURCE_ENRICH_LIMIT).toBeLessThan(ENRICH_BATCH);
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
});
