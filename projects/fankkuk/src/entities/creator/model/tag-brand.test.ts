import { describe, expect, it } from "vitest";
import { tagBrandOf } from "./tag-brand";

// 대응표 (design-rules 5절, 시안 tags-b). 글자색은 옅은 면 위 4.5:1 이상이어야 한다.

function luminance(hex: string): number {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

const NAMES = ["SOOP", "치지직", "유튜브", "알플레이", "인스타그램", "X", "스레드", "틱톡", "버추얼"];

describe("tagBrandOf", () => {
  it("기본 선택지 아홉 개는 모두 아이콘·색이 있다", () => {
    for (const n of NAMES) expect(tagBrandOf(n), n).not.toBeNull();
  });

  it("이름은 앞뒤 공백·영문 대소문자를 무시하고 찾는다", () => {
    expect(tagBrandOf(" soop ")).toEqual(tagBrandOf("SOOP"));
    expect(tagBrandOf("x")).toEqual(tagBrandOf("X"));
  });

  it("표에 없는 이름(운영자가 새로 넣은 선택지)은 null — 아이콘 없는 기본 칩", () => {
    expect(tagBrandOf("팝콘TV")).toBeNull();
    expect(tagBrandOf("")).toBeNull();
  });

  it("시안 값 그대로 — 치지직은 글자에 원색(#00FFA3)을 쓰지 않는다", () => {
    expect(tagBrandOf("치지직")).toMatchObject({ ring: "#00FFA3", fill: "#E6FFF5", ink: "#006B47", icon: { kind: "app", src: "/brand/chzzk.png" } });
    expect(tagBrandOf("버추얼")?.icon).toEqual({ kind: "virtual" });
  });

  it("옅은 면 위 글자 대비가 모두 4.5 이상", () => {
    for (const n of NAMES) {
      const b = tagBrandOf(n);
      expect(b && contrast(b.ink, b.fill), n).toBeGreaterThanOrEqual(4.5);
    }
  });
});
