import { describe, expect, it } from "vitest";
import { hasBidiFormatting, hasControlChars, hasVisibleContent } from "./text";

/**
 * **코드 포인트로 적는다.** 보이지 않는 글자를 소스에 직접 박으면 파일을 옮기거나 붙여
 * 넣는 과정에 조용히 사라지고, 사라져도 검사는 초록불이 된다(2026-09-06 실측).
 */
const 글자 = (cp: number) => String.fromCodePoint(cp);

describe("hasControlChars — 데이터베이스의 [[:cntrl:]] 와 같은 범위", () => {
  it("INV-T2: U+0000–1F · U+007F · U+0080–9F 를 전부 본다", () => {
    for (const cp of [0x00, 0x07, 0x09, 0x0a, 0x1f, 0x7f, 0x80, 0x85, 0x9f]) {
      expect(hasControlChars(`가${글자(cp)}나`), `U+${cp.toString(16)}`).toBe(true);
    }
  });

  it("INV-T2: C1 구역(U+0080–9F)을 빠뜨리면 고칠 수 없는 오류가 반복된다", () => {
    // **이 한 줄이 이 파일의 이유다.** 이름 쪽 판정은 2026-09-11 까지 `code < 0x20 || 0x7f`
    // 만 봐서 U+0085 를 통과시켰고, 데이터베이스의 `[[:cntrl:]]` 는 그것을 거부했다.
    // 그 사이로 들어온 값은 화면에 영어 원문 대신 「잠시 뒤 다시 시도해 주세요」를 띄우는데,
    // 다시 시도해도 절대 성공하지 않는다.
    expect(hasControlChars(`이름${글자(0x85)}`)).toBe(true);
  });

  it("제어문자가 아닌 것은 여기서 안 걸린다", () => {
    // 공백류·폭 없는 글자·서식 문자는 **다른 판정**이 맡는다. 여기서 같이 걸면
    // 어느 규칙이 막았는지 사용자에게 다른 문구를 줄 수 없다.
    for (const cp of [0x3000, 0x00a0, 0x200b, 0xfeff, 0x202e, 0x0300]) {
      expect(hasControlChars(`가${글자(cp)}나`), `U+${cp.toString(16)}`).toBe(false);
    }
    expect(hasControlChars("김하늘")).toBe(false);
  });
});

describe("hasBidiFormatting — 주변 글자의 순서를 바꾸는 서식 문자", () => {
  it("INV-T2: 열 자를 전부 본다", () => {
    // 한글 제목에서 화면을 실제로 깨는 것은 U+202E 하나뿐이다(2026-09-11 실측).
    // 나머지 아홉을 같이 보는 근거는 스펙의 ③ — 히브리어 제목이면 U+202B·2067·2068 도 깬다.
    for (const cp of [0x200e, 0x200f, 0x202a, 0x202b, 0x202c, 0x202d, 0x202e, 0x2066, 0x2067, 0x2068, 0x2069]) {
      expect(hasBidiFormatting(`토익${글자(cp)}900`), `U+${cp.toString(16)}`).toBe(true);
    }
  });

  it("INV-T2: 오른쪽-왼쪽 글자 자체는 안 막는다", () => {
    // **이 검사가 없으면 「오른쪽-왼쪽 글자를 다 막는다」는 구현이 위 검사를 통과한다.**
    for (const 값 of ["دراسة", "לימוד", "دراسة 900"]) {
      expect(hasBidiFormatting(값), 값).toBe(false);
    }
  });

  it("INV-T2: ZWJ 와 ZWNJ 는 여기 없다 — 가족 이모지가 그것으로 이어진다", () => {
    const ZWJ = 글자(0x200d);
    expect(hasBidiFormatting(`${글자(0x1f468)}${ZWJ}${글자(0x1f469)}`)).toBe(false);
    expect(hasBidiFormatting(`가${글자(0x200c)}나`)).toBe(false);
  });
});

describe("hasVisibleContent — 지우고 나면 남는 것이 있나", () => {
  it("INV-T1: 보이지 않는 글자만으로 된 값은 내용이 없다", () => {
    for (const cp of [0x20, 0x3000, 0x00a0, 0x1680, 0x2000, 0x2028, 0x2029, 0x202f, 0x205f, 0x180e, 0x200b, 0x200c, 0x200d, 0x2060, 0xfeff]) {
      expect(hasVisibleContent(글자(cp).repeat(3)), `U+${cp.toString(16)}`).toBe(false);
    }
    expect(hasVisibleContent("")).toBe(false);
    expect(hasVisibleContent(글자(0x3000) + 글자(0x200b) + 글자(0xfeff))).toBe(false);
  });

  it("INV-T1: 보이는 글자가 하나라도 있으면 내용이 있다", () => {
    // **반대 절반이 없으면 「항상 false」로 바꿔도 위 검사가 전부 통과한다.**
    for (const 값 of ["김하늘", "a", `${글자(0x3000)}가${글자(0x3000)}`, "دراسة"]) {
      expect(hasVisibleContent(값), 값).toBe(true);
    }
  });

  it("INV-T1: 이모지는 내용이다 — ZWJ 로 이어 붙인 것도", () => {
    const ZWJ = 글자(0x200d);
    expect(hasVisibleContent(글자(0x1f389))).toBe(true);
    expect(hasVisibleContent(`${글자(0x1f468)}${ZWJ}${글자(0x1f469)}${ZWJ}${글자(0x1f467)}`)).toBe(true);
  });

  it("INV-T1: 결합 부호는 여기서 안 지운다 — 이 스펙의 비범위다", () => {
    // `cafe` + U+0301 은 정상 입력이다(macOS 의 NFD). 지우는 집합에 넣으면
    // 결합 부호만으로 된 값이 걸리는 대신 **부류 전체가 「내용 없음」 쪽으로 기운다**.
    expect(hasVisibleContent(`cafe${글자(0x301)}`)).toBe(true);
  });
});
