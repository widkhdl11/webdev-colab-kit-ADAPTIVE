import { describe, expect, it } from "vitest";
import { TO_FILL, type LegalDoc } from "./legal-doc";
import { CURRENT, resolveLegal, type ArchivedDoc } from "./legal-versions";

const doc = (title: string): LegalDoc => ({
  title,
  lead: "l",
  summary: ["하나", "둘", "셋"],
  facts: [["운영", "팬꾹"]],
  sections: [],
});

const archive: readonly ArchivedDoc[] = [{ version: "2026-01-01", effectiveDate: "2026-01-08", doc: doc("옛 약관") }];
const current = { version: "2026-10-17", effectiveDate: "2026-11-01" };

describe("약관 버전과 시행일", () => {
  it("지금 버전의 글에는 맨 위에 버전과 시행일이 붙는다", () => {
    const r = resolveLegal("terms", "/terms", doc("새 약관"), undefined, current, archive);
    expect(r?.doc.facts.slice(0, 2)).toEqual([
      ["버전", "2026-10-17"],
      ["시행일", "2026-11-01"],
    ]);
    expect(r?.current).toBe(true);
  });

  it("시행일이 비어 있으면 자리표시가 보인다", () => {
    const r = resolveLegal("terms", "/terms", doc("새 약관"), undefined, { version: "x", effectiveDate: "" }, []);
    expect(r?.doc.facts).toContainEqual(["시행일", TO_FILL]);
  });

  it("?v= 로 지난 버전을 고르면 그때의 글과 시행일이 보이고, 버전 기록에 링크가 있다", () => {
    const r = resolveLegal("terms", "/terms", doc("새 약관"), "2026-01-01", current, archive);
    expect(r?.doc.title).toBe("옛 약관");
    expect(r?.doc.facts).toContainEqual(["시행일", "2026-01-08"]);
    expect(r?.current).toBe(false);
    expect(r?.history.map((h) => h.href)).toEqual(["/terms", "/terms?v=2026-01-01"]);
  });

  it("모르는 버전은 null(404)이고, 지금 버전 이름을 주면 지금 글이다", () => {
    expect(resolveLegal("terms", "/terms", doc("새 약관"), "1999-01-01", current, archive)).toBeNull();
    expect(resolveLegal("terms", "/terms", doc("새 약관"), "2026-10-17", current, archive)?.doc.title).toBe("새 약관");
  });

  it("약관·처리방침·환불 규정 셋 모두 버전이 있다", () => {
    for (const k of ["terms", "privacy", "refund"] as const) expect(CURRENT[k].version).toMatch(/\S/);
  });
});
