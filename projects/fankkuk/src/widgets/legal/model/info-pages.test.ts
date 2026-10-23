import { describe, expect, it } from "vitest";
import { SITE_INFO } from "@/shared/config/site-info";
import { disputeDoc } from "./dispute-doc";
import { faqDoc } from "./faq-doc";
import { guideCreatorDoc } from "./guide-creator-doc";
import { guideFanDoc } from "./guide-fan-doc";
import { INSPECTION_DOC } from "./inspection-doc";
import { openItems, type LegalDoc } from "./legal-doc";
import { pricingDoc } from "./pricing-doc";
import { privacyDoc } from "./privacy-doc";
import { refundDoc } from "./refund-doc";
import { SECURITY_DOC, SECURITY_FLOW } from "./security-doc";
import { termsDoc } from "./terms-doc";

// 안내·법정 페이지 공통 — 세 줄 요약, 목차 앵커, 요금·설정값을 넘겨받은 값으로 적는지.
const prices = {
  small: { priceKrw: 6111, revgiftPriceKrw: 5111, returnShippingKrw: 4111 },
  medium: { priceKrw: 8222, revgiftPriceKrw: 7222, returnShippingKrw: 5222 },
  large: { priceKrw: 12333, revgiftPriceKrw: 9333, returnShippingKrw: 6333 },
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
  pricing: pricingDoc(prices),
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

  it("요금 안내 표는 구간마다 선물·역조공 요금을 넘겨받은 요금표에서 그린다", () => {
    const table = docs.pricing!.sections.flatMap((s) => s.blocks).find((b) => b.kind === "prices");
    expect(table && table.kind === "prices" ? table.rows.map((r) => [r.name, ...r.amounts]) : null).toEqual([
      [expect.any(String), "6,111원", "5,111원"],
      [expect.any(String), "8,222원", "7,222원"],
      [expect.any(String), "12,333원", "9,333원"],
    ]);
  });

  it("이용약관 분류·주요·요약 링크는 확정한 표대로다(2026-10-23) — 요약 줄은 있는 조를 가리킨다", () => {
    const t = docs.terms!;
    const ids = t.sections.map((s) => s.id);
    expect(t.summaryLinks).toEqual(["service", "refund", "prohibited"]);
    for (const id of t.summaryLinks ?? []) expect(ids).toContain(id);
    const allowed = ["선물·배송", "계정·개인정보", "크리에이터", "환불·취소", "금지 물품"];
    for (const s of t.sections) for (const tag of s.tags ?? []) expect([s.id, allowed.includes(tag)]).toEqual([s.id, true]);
    expect(t.sections.filter((s) => s.frequent).map((s) => s.id)).toEqual(["service", "fee", "refund", "inspection", "prohibited"]);
    expect(t.sections.filter((s) => s.tags?.includes("크리에이터")).map((s) => s.id)).toEqual(["creator", "block", "revgift", "address"]);
  });

  it("취소·환불 규정 시점 칩·주요·요약 링크는 확정한 표대로다(2026-10-23) — 2절 상자는 시점 차례로 나뉜다", () => {
    const r = docs.refund!;
    expect(r.summaryLinks).toEqual(["table", "return", "show"]);
    expect(r.tagOrder).toEqual(["입고 전", "입고 후", "출고 후"]);
    expect(r.sections.filter((s) => s.frequent).map((s) => s.id)).toEqual(["table", "return", "show"]);
    expect(r.sections.find((s) => s.id === "fee")!.tags).toBeUndefined();
    const boxes = r.sections.find((s) => s.id === "table")!.blocks.flatMap((b) => (b.kind === "rows" ? [b.rows] : []));
    // 줄 제목 앞부분 → 꼬리표. 상자 차례가 입고 전 → 입고 후(3줄 · 2줄) → 출고 후
    expect(boxes.map((rows) => rows.map((row) => [row.title.split(/[ ·(]/)[0], row.tags]))).toEqual([
      [
        ["입고", ["입고 전"]],
        ["입고", ["입고 전", "입고 후"]],
        ["승인", ["입고 전"]],
      ],
      [
        ["입고", ["입고 후"]],
        ["크리에이터", ["입고 전", "입고 후"]],
        ["팬의", ["입고 후"]],
      ],
      [
        ["검수", ["입고 후"]],
        ["차액", ["입고 후"]],
      ],
      [["출고", ["출고 후"]]],
    ]);
  });

  it("배상 한도는 설정값에서 읽는다", () => {
    expect(text(termsDoc(prices, 123_000))).toContain("123,000원");
    expect(text(disputeDoc({ ...SITE_INFO, compensationCapKrw: 77_000 }))).toContain("77,000원");
  });

  it("처리를 맡기는 곳·보호책임자·문의 이메일은 설정값에서 읽고, 비면 자리표시가 남는다", () => {
    const filled = privacyDoc({ ...SITE_INFO, supportEmail: "help@example.com", privacyOfficer: { name: "김보호", title: "대표", contact: "02-1" }, vendors: { ...SITE_INFO.vendors, carrier: "예시택배" } });
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

describe("환불 규정 — 상자 크기별 반송 택배비 (카드 d98 ①)", () => {
  const ret = refundDoc(prices).sections.find((s) => s.id === "return")!;

  it("반송 방법 절에 크기별 반송 택배비 표가 있고, 넘겨받은 공개 요금표 값을 그린다", () => {
    const tables = ret.blocks.filter((b) => b.kind === "rows");
    expect(tables).toHaveLength(1);
    const rows = tables[0]!.kind === "rows" ? tables[0]!.rows : [];
    expect(rows.map((r) => [r.title, r.fields])).toEqual([
      ["소형", [["반송 택배비", "4,111원"]]],
      ["중형", [["반송 택배비", "5,222원"]]],
      ["대형", [["반송 택배비", "6,333원"]]],
    ]);
  });

  it("표 바로 앞 문장이 「결제 당시의 금액으로 계산」을 말한다 — 표의 숫자가 지금 금액이라는 것을 함께 읽는다", () => {
    const at = ret.blocks.findIndex((b) => b.kind === "rows");
    const before = JSON.stringify(ret.blocks.slice(0, at));
    expect(before).toContain("결제 당시의 금액으로 계산합니다");
    expect(JSON.stringify(ret.blocks[at - 1])).toContain("현재");
  });

  it("검수비·서비스료는 숫자로 쓰지 않는다 — 받는 값 − 역조공 값(검수비)·나머지(서비스료) 금액이 글에 없다", () => {
    const all = text(docs.refund!);
    // 검수비 = 1,000 · 1,000 · 3,000 / 서비스료 = 1,000 · 2,000 · 3,000 (위 prices)
    for (const n of ["1,000원", "2,000원", "3,000원"]) expect(all).not.toContain(n);
  });
});
