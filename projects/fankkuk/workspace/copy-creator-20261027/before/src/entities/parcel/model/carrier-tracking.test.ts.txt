import { describe, expect, it } from "vitest";
import { CARRIERS } from "./carrier";
import { TRACKABLE_CARRIERS, trackingUrlOf } from "./carrier-tracking";

// 배송 조회 링크 (action-center INV-J10 — 카드 d93 ⑦). 크리에이터가 넣은 택배사·송장번호로 택배사 조회 페이지 주소만 만든다 — 저장하지 않는다.

describe("INV-J10: 배송 조회는 택배사 조회 페이지 링크만", () => {
  it("INV-J10: 링크를 만들 수 있는 택배사는 전부 https 택배사 주소이고 송장번호가 들어간다", () => {
    for (const c of TRACKABLE_CARRIERS) {
      const url = trackingUrlOf(c, "568912340017");
      expect(url).not.toBeNull();
      expect(new URL(url!).protocol).toBe("https:");
      expect(url).toContain("568912340017");
    }
    expect(trackingUrlOf("cj", "568912340017")).toBe("https://trace.cjlogistics.com/next/tracking.html?wblNo=568912340017");
    expect(trackingUrlOf("post", "568912340017")).toBe("https://service.epost.go.kr/trace.RetrieveDomRigiTraceList.comm?sid1=568912340017");
  });

  it("INV-J10 (실패경로): 송장번호 꼴이 아니거나(숫자 10~14자리) 조회 주소가 없는 택배사면 링크가 없다", () => {
    expect(trackingUrlOf("cj", "12345")).toBeNull();
    // 숫자 자리 수는 맞아도 다른 글자가 섞이면 — 조회 주소에 매개변수가 끼어들지 않는다
    expect(trackingUrlOf("cj", "568912340017&x=1")).toBeNull();
    expect(trackingUrlOf("etc", "568912340017")).toBeNull();
    expect(TRACKABLE_CARRIERS).not.toContain("etc");
    expect(CARRIERS.filter((c) => c !== "etc").every((c) => TRACKABLE_CARRIERS.includes(c))).toBe(true);
  });

  it("INV-J10: 띄어 쓰거나 하이픈을 넣어도 숫자만 넣는다", () => {
    expect(trackingUrlOf("cj", "5689-1234 0017")).toBe(trackingUrlOf("cj", "568912340017"));
  });
});
