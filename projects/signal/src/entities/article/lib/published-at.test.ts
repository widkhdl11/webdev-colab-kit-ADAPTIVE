import { describe, expect, it } from "vitest";
import { normalizePublishedAt } from "./published-at";

/**
 * INV-C5 (ingestion-ranking): 발행시각은 UTC 로 저장한다. 없거나 파싱 불가면 수집시각으로
 * 대체하되 **대체 여부를 구분해 남긴다.**
 *
 * 왜 대체 여부를 남기나: 대체값은 "이때 발행됐다"가 아니라 "이때 우리가 봤다"다.
 * 구분이 없으면 날짜 그룹이 거짓말을 하는데 아무도 그걸 알 수 없다.
 */
const FETCHED_AT = new Date("2026-08-09T05:00:00.000Z");

describe("normalizePublishedAt — INV-C5 발행시각 UTC 정규화", () => {
  it("INV-C5 (S5): KST 로 표기된 시각을 UTC 로 바꾼다", () => {
    const r = normalizePublishedAt("2026-08-09T09:00:00+09:00", FETCHED_AT);
    expect(r.publishedAt).toBe("2026-08-09T00:00:00.000Z");
    expect(r.isFallback).toBe(false);
  });

  it("INV-C5: RFC 822(RSS 기본 형식) 도 UTC 로 바꾼다", () => {
    const r = normalizePublishedAt("Sat, 09 Aug 2026 09:00:00 +0900", FETCHED_AT);
    expect(r.publishedAt).toBe("2026-08-09T00:00:00.000Z");
    expect(r.isFallback).toBe(false);
  });

  it("INV-C5: 이미 UTC 인 값은 그대로 UTC 다", () => {
    const r = normalizePublishedAt("2026-08-09T00:00:00Z", FETCHED_AT);
    expect(r.publishedAt).toBe("2026-08-09T00:00:00.000Z");
    expect(r.isFallback).toBe(false);
  });

  describe("타임존이 없는 값 — UTC 로 읽는다 (2026-08-09 사용자: 대략적인 날짜면 된다)", () => {
    it("INV-C5: 존 없는 날짜-시각을 UTC 로 읽는다", () => {
      const r = normalizePublishedAt("2026-08-09T09:00:00", FETCHED_AT);
      expect(r.publishedAt).toBe("2026-08-09T09:00:00.000Z");
      expect(r.isFallback).toBe(false);
    });

    it("INV-C5: 날짜만 있으면 그날 00:00 UTC", () => {
      const r = normalizePublishedAt("2026-08-09", FETCHED_AT);
      expect(r.publishedAt).toBe("2026-08-09T00:00:00.000Z");
      expect(r.isFallback).toBe(false);
    });

    it("INV-C5: 공백으로 갈린 꼴·초 없는 꼴도 같게 읽는다", () => {
      expect(normalizePublishedAt("2026-08-09 09:00:00", FETCHED_AT).publishedAt).toBe(
        "2026-08-09T09:00:00.000Z",
      );
      expect(normalizePublishedAt("2026-08-09T09:00", FETCHED_AT).publishedAt).toBe(
        "2026-08-09T09:00:00.000Z",
      );
    });

    it("INV-C5: 실행 환경의 시간대에 기대지 않는다", () => {
      // Date.parse 에 그냥 맡기면 존 없는 값을 로컬로 읽어, 서버와 브라우저가 갈린다.
      // UTC 로 못 박았으므로 로컬 오프셋과 무관하게 같은 값이어야 한다.
      const local = Date.parse("2026-08-09T09:00:00");
      const ours = Date.parse(normalizePublishedAt("2026-08-09T09:00:00", FETCHED_AT).publishedAt);
      expect(ours).toBe(Date.parse("2026-08-09T09:00:00Z"));
      if (new Date().getTimezoneOffset() !== 0) expect(ours).not.toBe(local);
    });

    it("INV-C5: 수집시각으로 대체하지 않는다 — 옛 글이 오늘로 오면 안 된다", () => {
      // 이 규칙을 대체로 되돌리면 일주일 전 글이 오늘 날짜 묶음에 들어간다.
      const r = normalizePublishedAt("2026-08-02T09:00:00", FETCHED_AT);
      expect(r.publishedAt.slice(0, 10)).toBe("2026-08-02");
      expect(r.publishedAt).not.toBe(FETCHED_AT.toISOString());
    });
  });

  it("INV-C5: 결과는 언제나 UTC ISO 표기다", () => {
    for (const raw of [
      "2026-08-09T09:00:00+09:00",
      "2026-08-08T20:00:00-05:00",
      "Sat, 09 Aug 2026 09:00:00 GMT",
    ]) {
      expect(normalizePublishedAt(raw, FETCHED_AT).publishedAt).toMatch(
        /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/,
      );
    }
  });

  describe("실패 경로 — 대체하고, 대체했다고 남긴다", () => {
    it("INV-C5 실패경로: 값이 없으면 수집시각으로 대체하고 isFallback 을 세운다", () => {
      for (const raw of [null, undefined, "", "   "]) {
        const r = normalizePublishedAt(raw, FETCHED_AT);
        expect(r.publishedAt).toBe(FETCHED_AT.toISOString());
        expect(r.isFallback).toBe(true);
      }
    });

    it("INV-C5 실패경로: 파싱 불가면 대체한다", () => {
      const r = normalizePublishedAt("어제쯤", FETCHED_AT);
      expect(r.publishedAt).toBe(FETCHED_AT.toISOString());
      expect(r.isFallback).toBe(true);
    });

    it("INV-C5 실패경로: 형식을 모르는 값은 대체한다", () => {
      const r = normalizePublishedAt("Sat, 09 Aug 2026 09:00:00", FETCHED_AT);
      expect(r.publishedAt).toBe(FETCHED_AT.toISOString());
      expect(r.isFallback).toBe(true);
    });

    it("INV-C5 실패경로: 대체값도 UTC ISO 표기다", () => {
      expect(normalizePublishedAt(null, FETCHED_AT).publishedAt).toMatch(/Z$/);
    });
  });
});
