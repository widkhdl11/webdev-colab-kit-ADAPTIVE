import { describe, expect, it } from "vitest";
import { COVER_PASTELS, coverPastel } from "./cover-pastel";

const seedId = (n: number) => `00000000-0000-4000-b000-${String(n).padStart(12, "0")}`;

describe("사진 없는 배너의 파스텔 색 (DECISIONS d101)", () => {
  it("8색이 모두 나오고, 8색 밖의 값은 나오지 않는다", () => {
    const seen = new Set<string>();
    for (let n = 1; n <= 200; n += 1) seen.add(coverPastel(seedId(n)));
    expect([...seen].sort()).toEqual([...COVER_PASTELS].sort());
  });

  it("시안 v24 의 시드 크리에이터 배정과 같다", () => {
    expect(coverPastel(seedId(2))).toBe("#DCEBFF");
    expect(coverPastel(seedId(3))).toBe("#FFF1B8");
    expect(coverPastel(seedId(5))).toBe("#FDE2E4");
    expect(coverPastel(seedId(9))).toBe("#D3F0EC");
    expect(coverPastel(seedId(12))).toBe("#FDE2E4");
  });

  it("8색은 서로 다르고 모두 #RRGGBB 대문자", () => {
    expect(new Set(COVER_PASTELS).size).toBe(8);
    for (const c of COVER_PASTELS) expect(c).toMatch(/^#[0-9A-F]{6}$/);
  });
});
