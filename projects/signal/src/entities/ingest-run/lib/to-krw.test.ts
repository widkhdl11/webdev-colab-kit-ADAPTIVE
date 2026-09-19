import { describe, expect, it } from "vitest";
import { USD_TO_KRW, toKrw } from "./to-krw";

describe("toKrw", () => {
  it("환율을 곱해 원 단위로 반올림한다", () => {
    // 리터럴로 적는다 — 상수에서 파생시키면(`1 * USD_TO_KRW`) 환율을 어떤 값으로 바꿔도
    // 통과해서 이 테스트가 아무것도 붙들지 못한다 (LESSONS: 상수 파생 입력 3회 재발).
    expect(toKrw(1)).toBe(1383);
    expect(toKrw(0.24)).toBe(332);
  });

  it("환율 상수 자체를 못 박는다", () => {
    // 값이 바뀌는 것 자체는 정상이다(환율은 움직인다). 다만 **모르는 사이에** 바뀌면 안 된다 —
    // 화면의 원화 표시가 근거 없이 달라지므로, 고칠 때 이 줄도 같이 고치게 만든다.
    expect(USD_TO_KRW).toBe(1383);
  });

  it("0 이면 0원이다", () => {
    expect(toKrw(0)).toBe(0);
  });

  it("1원 미만은 반올림으로 사라지거나 1원이 된다", () => {
    expect(toKrw(0.0003)).toBe(0);
    expect(toKrw(0.0004)).toBe(1);
  });

  it("음수를 0 으로 접지 않는다 — 상류 계산 오류를 화면에서 숨기지 않는다", () => {
    expect(toKrw(-1)).toBe(-1383);
  });
});
