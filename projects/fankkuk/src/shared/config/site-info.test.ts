import { describe, expect, it } from "vitest";
import { bizInfoRows, SITE_INFO, SITE_INFO_BLANK, type SiteInfo } from "./site-info";

const filled: SiteInfo = {
  ...SITE_INFO,
  companyName: "주식회사 예시",
  ceoName: "홍길동",
  bizRegNo: "123-45-67890",
  mailOrderNo: "제2026-서울강남-0001호",
  bizAddress: "서울특별시 예시구 예시로 1",
  supportEmail: "help@example.com",
  supportPhone: "02-000-0000",
};

describe("사이트 하단 사업자 정보", () => {
  it("설정값을 바꾸면 하단 글자가 그 값으로 바뀐다", () => {
    const rows = Object.fromEntries(bizInfoRows(filled));
    expect(rows["상호"]).toBe("주식회사 예시");
    expect(rows["대표자"]).toBe("홍길동");
    expect(rows["통신판매업 신고번호"]).toBe("제2026-서울강남-0001호");
    expect(rows["고객센터"]).toBe("help@example.com · 02-000-0000");
    expect(rows["호스팅 제공자"]).toBe("Vercel Inc.");
  });

  it("비어 있는 값은 자리표시로, 통신판매업 신고번호만 「신고 진행 중」으로 보인다", () => {
    const rows = Object.fromEntries(bizInfoRows({ ...filled, ceoName: " ", mailOrderNo: "" }));
    expect(rows["대표자"]).toBe(SITE_INFO_BLANK);
    expect(rows["통신판매업 신고번호"]).toBe("신고 진행 중");
  });

  it("전자상거래법 표시 항목 일곱 개가 모두 있다", () => {
    expect(bizInfoRows(SITE_INFO).map(([k]) => k)).toEqual([
      "상호",
      "대표자",
      "사업자등록번호",
      "통신판매업 신고번호",
      "사업장 주소",
      "고객센터",
      "호스팅 제공자",
    ]);
  });
});
