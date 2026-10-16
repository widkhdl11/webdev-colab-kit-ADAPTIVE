import { describe, expect, it } from "vitest";
import { SITE_INFO } from "@/shared/config/site-info";
import { disputeDoc } from "./dispute-doc";
import { faqDoc } from "./faq-doc";
import { guideCreatorDoc } from "./guide-creator-doc";
import { guideFanDoc } from "./guide-fan-doc";
import { INSPECTION_DOC } from "./inspection-doc";
import { openItems, type LegalDoc } from "./legal-doc";
import { privacyDoc } from "./privacy-doc";
import { refundDoc } from "./refund-doc";
import { SECURITY_DOC, SECURITY_FLOW } from "./security-doc";
import { termsDoc } from "./terms-doc";

// 안내·법정 페이지 공통 — 세 줄 요약, 목차 앵커, 요금·설정값을 넘겨받은 값으로 적는지.
const prices = {
  small: { priceKrw: 6111, revgiftPriceKrw: 5111 },
  medium: { priceKrw: 8222, revgiftPriceKrw: 7222 },
  large: { priceKrw: 12333, revgiftPriceKrw: 9333 },
} as const;

const docs: Readonly<Record<string, LegalDoc>> = {
  terms: termsDoc(prices),
  privacy: privacyDoc(),
  refund: refundDoc(prices),
  dispute: disputeDoc(),
  inspection: INSPECTION_DOC,
  security: SECURITY_DOC,
  guideFan: guideFanDoc(prices),
  guideCreator: guideCreatorDoc(prices),
};

const text = (doc: LegalDoc) => JSON.stringify(doc);

describe("안내·법정 페이지 공통", () => {
  it("페이지마다 맨 위 요약이 세 줄이고, 줄마다 완결 문장이다", () => {
    for (const [name, doc] of Object.entries(docs)) {
      expect([name, doc.summary.length]).toEqual([name, 3]);
      for (const line of doc.summary) expect([name, line]).toEqual([name, expect.stringMatching(/[.요다]$/)]);
    }
    expect(faqDoc(prices).summary).toHaveLength(3);
  });

  it("목차 앵커가 페이지 안에서 겹치지 않고 주소에 그대로 쓸 수 있는 꼴이다", () => {
    for (const [name, doc] of Object.entries(docs)) {
      const ids = doc.sections.map((s) => s.id);
      expect([name, new Set(ids).size]).toEqual([name, ids.length]);
      for (const id of ids) expect([name, id]).toEqual([name, expect.stringMatching(/^[a-z][a-z0-9-]*$/)]);
    }
  });

  it("요금은 넘겨받은 요금표 값으로 적힌다 — 요금표가 바뀌면 글이 바뀐다", () => {
    expect(text(docs.refund!)).toContain("6,111원");
    expect(text(docs.guideFan!)).toContain("12,333원");
    expect(text(docs.guideCreator!)).toContain("9,333원");
    expect(JSON.stringify(faqDoc(prices))).toContain("8,222원");
  });

  it("배상 한도는 설정값에서 읽는다", () => {
    expect(text(termsDoc(prices, 123_000))).toContain("123,000원");
    expect(text(disputeDoc({ ...SITE_INFO, compensationCapKrw: 77_000 }))).toContain("77,000원");
  });

  it("처리를 맡기는 곳·보호책임자·문의 이메일은 설정값에서 읽고, 비면 자리표시가 남는다", () => {
    const filled = privacyDoc({ ...SITE_INFO, supportEmail: "help@example.com", privacyOfficer: { name: "김보호", contact: "02-1" }, vendors: { ...SITE_INFO.vendors, carrier: "예시택배" } });
    expect(text(filled)).toContain("help@example.com");
    expect(text(filled)).toContain("김보호");
    expect(text(filled)).toContain("택배사 — 예시택배");
    expect(openItems(privacyDoc()).some((t) => t.includes("택배사 (출시 전 기재)"))).toBe(true);
  });

  it("출시 기념 요금·할인 줄이 없다(2026-10-14 적용하지 않기로 함)", () => {
    for (const doc of Object.values(docs)) expect(text(doc)).not.toMatch(/출시 기념|할인/);
  });

  it("보안 안내 그림은 팬 → 사무실 → 송장 출력 때만 주소 열람 → 크리에이터 네 칸이다", () => {
    expect(SECURITY_FLOW.map((s) => s.title)).toEqual(["팬", "팬꾹 사무실", "송장을 출력할 때만 주소 열람", "크리에이터"]);
  });
});
