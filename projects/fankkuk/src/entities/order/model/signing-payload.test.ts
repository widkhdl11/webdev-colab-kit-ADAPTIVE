import { describe, expect, it } from "vitest";
import { buildSigningPayload, parseSigningPayload } from "./signing-payload";

const fields = {
  requestId: "apr_01J9ZK3M9QX7",
  orderNo: "FC-7K3M9",
  requestedAt: "2026-10-01T09:30:00.000Z",
  fanNicknameHash: "a".repeat(64),
};

describe("서명 원문 (INV-S1)", () => {
  it("INV-S1 (S1): 원문은 요청 ID·주문번호·요청 시각·팬 닉네임 해시 네 값으로만 이루어진다", () => {
    const payload = buildSigningPayload(fields);
    expect(payload).toBe(
      "fankkuk-approval:v1|req=apr_01J9ZK3M9QX7|order=FC-7K3M9|at=2026-10-01T09:30:00.000Z|fan=" + "a".repeat(64),
    );
    expect(parseSigningPayload(payload)).toEqual(fields);
  });

  it("INV-S1 (S1b, 실패경로): 주소 같은 다른 값이 섞여 들어오면 원문 생성이 실패한다", () => {
    expect(() => buildSigningPayload({ ...fields, address: "서울시 강남구" } as never)).toThrow();
    expect(() => buildSigningPayload({ ...fields, fanRealName: "홍길동" } as never)).toThrow();
  });

  it("INV-S1 (실패경로): 각 칸은 정해진 형식만 받는다 — 칸 안에 다른 정보를 숨겨 넣을 수 없다", () => {
    expect(() => buildSigningPayload({ ...fields, orderNo: "FC-7K3M9|addr=서울" })).toThrow();
    expect(() => buildSigningPayload({ ...fields, fanNicknameHash: "닉네임그대로" })).toThrow();
    expect(() => buildSigningPayload({ ...fields, requestedAt: "어제" })).toThrow();
    expect(() => buildSigningPayload({ ...fields, requestId: "apr 1|x" })).toThrow();
    expect(() => buildSigningPayload({ ...fields, requestId: "apr_1|addr=서울" })).toThrow();
  });

  it("parseSigningPayload 는 형식이 다른 원문을 거부한다", () => {
    expect(parseSigningPayload("fankkuk-approval:v2|req=a|order=FC-1|at=x|fan=y")).toBeNull();
    expect(parseSigningPayload(buildSigningPayload(fields) + "|addr=서울")).toBeNull();
  });
});
