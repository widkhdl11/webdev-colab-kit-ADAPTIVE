import { describe, expect, it } from "vitest";
import { ADDRESS_CODE_ALPHABET, addressCodeCheckChar, parseAddressCode } from "./address-code";

function withCheck(body: string): string {
  return body + addressCodeCheckChar(body);
}

/** 무작위 앞 5자리 n 개 — 시험이 특정 값에 기대지 않게 */
function randomBodies(n: number): string[] {
  return Array.from({ length: n }, () =>
    Array.from(crypto.getRandomValues(new Uint8Array(5)), (b) => ADDRESS_CODE_ALPHABET[b % ADDRESS_CODE_ALPHABET.length]).join(""),
  );
}

describe("INV-C1 받는 주소 6자리 — 글자와 확인 문자", () => {
  it("INV-C1: 글자는 20자이고 헷갈리는 글자(0·O·1·I·L·5·S·8·B·2·Z·U·V·G·6·Q)는 없다", () => {
    expect(ADDRESS_CODE_ALPHABET).toHaveLength(20);
    expect(new Set(ADDRESS_CODE_ALPHABET).size).toBe(20);
    for (const ch of "0O1IL5S8B2ZUVG6Q") expect(ADDRESS_CODE_ALPHABET).not.toContain(ch);
  });

  it("INV-C1 (S1b): 확인 문자를 붙인 값은 통과한다", () => {
    for (const body of randomBodies(200)) expect(parseAddressCode(withCheck(body))).toEqual({ ok: true, value: withCheck(body) });
  });

  it("INV-C1 (S1b): 어느 자리든 한 글자를 바꾸면 확인 문자가 맞지 않는다 — 모든 자리·모든 글자", () => {
    for (const body of randomBodies(50)) {
      const code = withCheck(body);
      for (let i = 0; i < 6; i++) {
        for (const ch of ADDRESS_CODE_ALPHABET) {
          if (ch === code[i]) continue;
          const typo = code.slice(0, i) + ch + code.slice(i + 1);
          expect(parseAddressCode(typo)).toEqual({ ok: false, reason: "check" });
        }
      }
    }
  });

  it("INV-C1 (S1b): 이웃 두 글자를 바꾸면 확인 문자가 맞지 않는다 — 예외 없이", () => {
    let checked = 0;
    for (const body of randomBodies(300)) {
      const code = withCheck(body);
      for (let i = 0; i < 5; i++) {
        const a = code[i];
        const b = code[i + 1];
        if (a === b) continue;
        const swapped = code.slice(0, i) + b + a + code.slice(i + 2);
        expect(parseAddressCode(swapped)).toEqual({ ok: false, reason: "check" });
        checked++;
      }
    }
    expect(checked).toBeGreaterThan(1000);
  });

  it("INV-C1 (S1b): 모든 글자 쌍을 모든 이웃 자리에 놓고 바꿔도 잡는다 — 3·Y(첫 글자·끝 글자) 포함", () => {
    let checked = 0;
    for (let i = 0; i < 4; i++) {
      for (const a of ADDRESS_CODE_ALPHABET) {
        for (const b of ADDRESS_CODE_ALPHABET) {
          if (a === b) continue;
          const body = "K7M3R".slice(0, i) + a + b + "K7M3R".slice(i + 2);
          const code = withCheck(body);
          const swapped = code.slice(0, i) + b + a + code.slice(i + 2);
          expect(parseAddressCode(swapped)).toEqual({ ok: false, reason: "check" });
          checked++;
        }
      }
    }
    // 끝 자리(5번째 글자 ↔ 확인 문자)
    for (const a of ADDRESS_CODE_ALPHABET) {
      for (const head of ["K7M3", "3333", "YYYY", "ACDE"]) {
        const code = withCheck(head + a);
        if (code[4] === code[5]) continue;
        const swapped = code.slice(0, 4) + code[5] + code[4];
        expect(parseAddressCode(swapped)).toEqual({ ok: false, reason: "check" });
        checked++;
      }
    }
    expect(checked).toBeGreaterThan(1500);
  });

  it("INV-C1 (S1b): 20자 밖 글자(G·6·Q·0 등)가 있으면 확인 문자를 보기 전에 꼴 오류", () => {
    for (const bad of ["K7M3QA", "G7M3QA", "67M3QA", "K7M30A", "K7M3O", "K7M3QAA", "K7 M3Q"]) {
      expect(parseAddressCode(bad)).toEqual({ ok: false, reason: "format" });
    }
    expect(parseAddressCode("   ")).toEqual({ ok: false, reason: "empty" });
  });

  it("INV-C1 (S1b): 소문자로 넣어도 대문자로 받아 통과한다, 앞뒤 공백은 지운다", () => {
    const code = withCheck("K7M3R");
    expect(parseAddressCode(` ${code.toLowerCase()} `)).toEqual({ ok: true, value: code });
  });

  it("확인 문자 계산은 20자 안의 앞 5자리만 받는다", () => {
    expect(() => addressCodeCheckChar("K7M3")).toThrow();
    expect(() => addressCodeCheckChar("K7M3Q")).toThrow();
  });
});
