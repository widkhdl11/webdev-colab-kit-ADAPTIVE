import { describe, expect, it } from "vitest";
import { openItems, TO_DECIDE, TO_FILL, type LegalDoc } from "./legal-doc";
import { PRIVACY_DOC } from "./privacy-doc";
import { termsDoc } from "./terms-doc";
import { mustDeliverLabels } from "@/entities/notification/model/delivery-policy";

const prices = {
  small: { priceKrw: 6900, revgiftPriceKrw: 5400 },
  medium: { priceKrw: 8900, revgiftPriceKrw: 6900 },
  large: { priceKrw: 12345, revgiftPriceKrw: 9876 },
} as const;

const docs: readonly LegalDoc[] = [termsDoc(prices), PRIVACY_DOC];

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
    const rows = fee?.blocks.find((b) => b.kind === "rows");
    expect(rows && rows.kind === "rows" ? rows.rows.map((r) => r.fields.map(([, v]) => v)) : []).toEqual([
      [expect.stringContaining("5kg"), "6,900원", "5,400원"],
      [expect.stringContaining("10kg"), "8,900원", "6,900원"],
      [expect.stringContaining("20kg"), "12,345원", "9,876원"],
    ]);
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

  it("빈칸 표시가 있는 문장만 모은다", () => {
    const doc: LegalDoc = {
      title: "t",
      lead: "l",
      facts: [["시행일", TO_FILL]],
      sections: [{ id: "a", title: "A", blocks: [{ kind: "text", text: "정해진 문장" }, { kind: "list", items: [`관할: ${TO_DECIDE}`] }] }],
    };
    expect(openItems(doc)).toEqual([`시행일: ${TO_FILL}`, `관할: ${TO_DECIDE}`]);
  });
});
