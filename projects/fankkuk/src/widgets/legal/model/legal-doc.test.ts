import { describe, expect, it } from "vitest";
import { openItems, TO_DECIDE, TO_FILL, type LegalDoc } from "./legal-doc";
import { privacyDoc } from "./privacy-doc";
import { termsDoc } from "./terms-doc";
import { ARCHIVE } from "./legal-versions";
import { refundDoc } from "./refund-doc";
import { mustDeliverLabels } from "@/entities/notification/model/delivery-policy";

const prices = {
  small: { priceKrw: 6900, revgiftPriceKrw: 5400, returnShippingKrw: 4000 },
  medium: { priceKrw: 8900, revgiftPriceKrw: 6900, returnShippingKrw: 5000 },
  large: { priceKrw: 12345, revgiftPriceKrw: 9876, returnShippingKrw: 6500 },
} as const;

const docs: readonly LegalDoc[] = [termsDoc(prices), privacyDoc()];

describe("약관·개인정보처리방침 글", () => {
  it("목차 앵커가 문서마다 겹치지 않고 주소에 그대로 쓸 수 있는 꼴이다", () => {
    for (const doc of docs) {
      const ids = doc.sections.map((s) => s.id);
      expect(new Set(ids).size).toBe(ids.length);
      for (const id of ids) expect(id).toMatch(/^[a-z][a-z0-9-]*$/);
    }
  });

  it("약관의 요금은 넘겨받은 요금표 값으로 적힌다(코드에 숫자를 박지 않는다)", () => {
    const fee = termsDoc(prices).sections.find((s) => s.id === "fee");
    const table = fee?.blocks.find((b) => b.kind === "prices");
    expect(table && table.kind === "prices" ? table.columns : []).toEqual(["선물", "역조공"]);
    expect(table && table.kind === "prices" ? table.rows.map((r) => [r.rule, ...r.amounts]) : []).toEqual([
      [expect.stringContaining("5kg"), "6,900원", "5,400원"],
      [expect.stringContaining("10kg"), "8,900원", "6,900원"],
      [expect.stringContaining("20kg"), "12,345원", "9,876원"],
    ]);
  });

  it("목차 묶음이 있는 글은 모든 조를 한 번씩, 본문 차례대로 담는다(지난 버전 글 포함)", () => {
    const withGroups = [termsDoc(prices), ...Object.values(ARCHIVE).flatMap((list) => list.map((a) => a.doc))].filter((d) => d.tocGroups);
    expect(withGroups.length).toBeGreaterThan(0);
    for (const doc of withGroups) expect(doc.tocGroups?.flatMap((g) => g.ids), doc.title).toEqual(doc.sections.map((s) => s.id));
  });

  it("notifications INV-N6: 꺼도 가는 알림의 예시는 설정 화면의 이름 그대로이고, 이유는 「조치가 필요하거나 돈·상자가 걸려 있기 때문」", () => {
    const names = new Set([...mustDeliverLabels("fan"), ...mustDeliverLabels("creator")]);
    for (const doc of docs) {
      const line = JSON.stringify(doc).match(/다만 ([^"]+?) 같은 알림은 조치가 필요하거나 돈·상자가 걸려 있기 때문에 꺼도 갑니다/);
      expect(line, doc.title).not.toBeNull();
      const examples = line![1]!.split("·");
      expect(examples).toContain("추가 결제 취소");
      for (const name of examples) expect([doc.title, name, names.has(name)]).toEqual([doc.title, name, true]);
    }
  });

  it("환불 금액 꼬리표는 한 규칙 — 전액이면 초록, 없음이면 빨강, 일부만 돌려받는 줄은 칠하지 않는다(약관·환불 규정 모두)", () => {
    const fields = [termsDoc(prices), refundDoc(prices)].flatMap((doc) =>
      doc.sections.flatMap((sec) => sec.blocks.flatMap((b) => (b.kind === "rows" ? b.rows.flatMap((r) => r.fields.map((f) => [doc.title, r.title, ...f] as const)) : []))),
    );
    const expected = (v: string) => (v.includes("전액") ? "full" : /^없음$|환불 금액 없음|환불 금액이 없습니다/.test(v) ? "none" : undefined);
    expect(fields.filter(([, , , , tone]) => tone === "full").length).toBeGreaterThan(0);
    expect(fields.filter(([, , , , tone]) => tone === "none").length).toBeGreaterThan(0);
    for (const [doc, row, k, v, tone] of fields) expect([doc, row, k, tone], v).toEqual([doc, row, k, expected(v)]);
  });

  it("약관 4조 단계 칩은 화면의 단계 이름 여섯 개이고, 이름표와 본문의 「6단계」와 수가 맞는다", () => {
    const service = termsDoc(prices).sections.find((s) => s.id === "service");
    const stages = service?.blocks.find((b) => b.kind === "stages");
    expect(stages && stages.kind === "stages" ? stages.items : []).toEqual(["등록", "입고", "검수", "출고", "배송중", "수령"]);
    expect(stages && stages.kind === "stages" ? stages.title : "").toBe(`진행 상황 ${stages && stages.kind === "stages" ? stages.items.length : 0}단계`);
    expect(JSON.stringify(service)).toContain("등록 → 입고 → 검수 → 출고 → 배송중 → 수령의 6단계");
  });

  it("빈칸 표시가 있는 문장만 모은다", () => {
    const doc: LegalDoc = {
      title: "t",
      lead: "l",
      summary: ["요약 하나", "요약 둘", "요약 셋"],
      facts: [["시행일", TO_FILL]],
      sections: [{ id: "a", title: "A", blocks: [{ kind: "text", text: "정해진 문장" }, { kind: "list", items: [`관할: ${TO_DECIDE}`] }] }],
    };
    expect(openItems(doc)).toEqual([`시행일: ${TO_FILL}`, `관할: ${TO_DECIDE}`]);
  });

  it("정의·요금표 안의 빈칸도 모은다(빈칸 없는 줄은 뺀다)", () => {
    const doc: LegalDoc = {
      title: "t",
      lead: "l",
      summary: ["요약 하나", "요약 둘", "요약 셋"],
      facts: [],
      sections: [
        {
          id: "a",
          title: "A",
          blocks: [
            { kind: "defs", items: [["회원", "가입한 사람을 말합니다."], ["사무실", `주소는 ${TO_FILL}`]] },
            { kind: "prices", columns: ["선물"], rows: [{ name: "소형", rule: "5kg 이하", amounts: ["6,900원"] }, { name: "대형", rule: "20kg 이하", amounts: [TO_DECIDE] }] },
          ],
        },
      ],
    };
    expect(openItems(doc)).toEqual([`사무실: 주소는 ${TO_FILL}`, `대형 — 20kg 이하: ${TO_DECIDE}`]);
  });
});
