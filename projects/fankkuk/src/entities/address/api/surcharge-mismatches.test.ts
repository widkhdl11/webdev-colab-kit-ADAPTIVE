import { describe, expect, it } from "vitest";
import { parseSurchargeMismatchRows, readSurchargeMismatches } from "./surcharge-mismatches";

// 할증 지역 불일치 (address-protection INV-P20 ③) — 송장 출력 때 연 주소의 구분이 저장된 구분과 다른 상자. 운영자만 읽는다.
// 주소·우편번호 칸은 없다 — 상자와 두 구분 값만.

const row = { at: "2026-11-08T03:00:00+00:00", order_no: "FC-4T7NX", box_seq: 2, box_count: 2, stored_region: "none", opened_region: "jeju" };

describe("INV-P20 ③: 할증 지역 불일치 응답", () => {
  it("INV-P20 S20c: 상자(주문번호-순번)·저장 구분·출력 때 구분·시각만 화면 모양으로", () => {
    expect(parseSurchargeMismatchRows([row, { ...row, box_seq: 1, box_count: 1, order_no: "FC-9QW2E", stored_region: "island", opened_region: "none" }])).toEqual([
      { at: "2026-11-08T03:00:00.000Z", box: "FC-4T7NX-2", stored: "none", opened: "jeju" },
      { at: "2026-11-08T03:00:00.000Z", box: "FC-9QW2E", stored: "island", opened: "none" },
    ]);
  });

  it("INV-P20 (실패경로): 구분이 목록 밖이거나 두 값이 같으면 받지 않는다", () => {
    expect(() => parseSurchargeMismatchRows([{ ...row, opened_region: "63309" }])).toThrow();
    expect(() => parseSurchargeMismatchRows([{ ...row, opened_region: "none" }])).toThrow();
  });

  it("INV-P20: 운영자 세션으로 admin_surcharge_mismatches 를 부른다 — 오류면 던진다", async () => {
    const calls: string[] = [];
    const ok = { rpc: async (fn: string) => (calls.push(fn), { data: [row], error: null }) };
    expect(await readSurchargeMismatches(ok as never)).toHaveLength(1);
    expect(calls).toEqual(["admin_surcharge_mismatches"]);
    const bad = { rpc: async () => ({ data: null, error: { code: "42501", message: "x" } }) };
    await expect(readSurchargeMismatches(bad as never)).rejects.toThrow();
  });
});
