import { describe, expect, it } from "vitest";
import { canonicalUuid, isUuid } from "./uuid";

const REAL = "3f2504e0-4f89-41d3-9a0c-0305e82c3301";

describe("isUuid: 정규 표기인가", () => {
  it("정규 표기는 통과한다", () => {
    // 반대 절반. 이게 없으면 "전부 거짓"으로 바꿔도 아래가 전부 통과한다.
    expect(isUuid(REAL)).toBe(true);
    expect(isUuid(REAL.toUpperCase())).toBe(true); // 대문자 표기
  });

  it("모양이 다른 값은 막는다", () => {
    const bad = [
      "",
      "3f2504e0-4f89-41d3-9a0c-0305e82c330", // 한 글자 짧다
      "3f2504e0-4f89-41d3-9a0c-0305e82c33011", // 한 글자 길다
      "3f2504e0-4f89-41d3-9a0c_0305e82c3301", // 구분자가 다르다
      "3g2504e0-4f89-41d3-9a0c-0305e82c3301", // 16진수가 아니다
      "------------------------------------", // 대시 36개 — 길이만 보는 검사를 통과한다
      "../../../etc/passwd",
      "posts",
    ];
    for (const v of bad) expect(isUuid(v), `통과시켰다: ${JSON.stringify(v)}`).toBe(false);
  });

  it("줄바꿈을 붙여 우회할 수 없다", () => {
    // 자바스크립트의 `$` 는 `m` 플래그가 없으면 입력 끝에서만 맞으므로 끝의 줄바꿈을
    // 허용하지 않는다(실측: `/^…$/.test(값 + "\n")` → false). **그래서 이 검사가
    // 붙드는 것은 `$` 의 기본 동작이 아니라 `m` 플래그가 붙는 날이다** — 그때
    // `값\n/etc/passwd` 가 통과하고, 그 값이 경로에 이어 붙는다.
    expect(isUuid(REAL + "\n")).toBe(false);
    expect(isUuid(REAL + "\n/etc/passwd")).toBe(false);
    expect(isUuid("\n" + REAL)).toBe(false);
  });

  it("문자열이 아닌 값은 막는다", () => {
    for (const v of [null, undefined, 42, {}, []]) expect(isUuid(v)).toBe(false);
  });
});

describe("canonicalUuid: 데이터베이스와 같은 규칙으로 읽고 정규 표기로 돌려준다", () => {
  // 아래 네 줄은 실측이다 — `select $1::uuid` 가 전부 같은 값을 돌려준다(uuid.ts 의 표).
  // 여기가 데이터베이스보다 좁으면 **쓰기는 되고 캐시 무효화만 조용히 안 되는** 상태가 된다.
  it("데이터베이스가 받는 표기를 전부 받고, 같은 값으로 맞춘다", () => {
    for (const [what, v] of [
      ["정규 표기", REAL],
      ["대문자", REAL.toUpperCase()],
      ["하이픈 없음", REAL.replace(/-/g, "")],
      ["중괄호", `{${REAL}}`],
      ["하이픈 위치가 다름", "3f2504e0-4f8941d3-9a0c0305e82c3301"],
    ] as const) {
      expect(canonicalUuid(v), `${what} 를 못 읽었다`).toBe(REAL);
    }
  });

  it("데이터베이스가 거절하는 것은 여기서도 null 이다", () => {
    // 넓은 쪽으로 틀리면 캐시 경로에 uuid 가 아닌 것이 들어간다. 앞뒤 공백과 길이는
    // 데이터베이스도 22P02 로 거절한다(실측).
    const bad = [
      "",
      ` ${REAL} `,
      REAL.slice(0, -1),
      REAL + "1",
      REAL.replace("3f", "3g"),
      "------------------------------------",
      `{${REAL}`,
      "../../../etc/passwd",
      REAL + "\n",
      null,
      undefined,
      42,
      {},
    ];
    for (const v of bad) expect(canonicalUuid(v), `통과시켰다: ${JSON.stringify(v)}`).toBeNull();
  });

  it("돌려준 값은 언제나 정규 표기다 — 경로가 두 벌이 되지 않는다", () => {
    // 이것이 없으면 「받은 표기를 그대로 돌려준다」로 바꿔도 위가 전부 통과하고,
    // 그러면 같은 것을 가리키는 캐시 경로가 둘이 되어 어느 쪽도 안 지워진다.
    for (const v of [REAL.toUpperCase(), REAL.replace(/-/g, ""), `{${REAL}}`]) {
      expect(isUuid(canonicalUuid(v)!), `정규 표기가 아닌 것을 돌려줬다: ${v}`).toBe(true);
      expect(canonicalUuid(v)).toBe(canonicalUuid(v)!.toLowerCase());
    }
  });
});
