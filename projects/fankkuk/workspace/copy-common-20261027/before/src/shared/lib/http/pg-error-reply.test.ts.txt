import { describe, expect, it } from "vitest";
import { pgErrorReply } from "./pg-error-reply";

const M = { limit: "글자 수를 확인해 주세요.", conflict: "이미 처리됐어요.", failed: "저장하지 못했어요." };

describe("DB 오류 코드 → 응답", () => {
  it("42501 은 403, 22023 은 400(한도 문구), P0002 는 404, 55000 은 409(겹침 문구)", () => {
    expect(pgErrorReply("42501", M)).toEqual({ status: 403, body: { message: "권한이 없어요." } });
    expect(pgErrorReply("22023", M)).toEqual({ status: 400, body: { message: M.limit } });
    expect(pgErrorReply("P0002", M)).toEqual({ status: 404, body: { message: "찾을 수 없어요." } });
    expect(pgErrorReply("55000", M)).toEqual({ status: 409, body: { message: M.conflict } });
  });

  it("55000 인데 겹침 문구가 없는 쓰기면 409 + 일반 실패 문구", () => {
    expect(pgErrorReply("55000", { limit: M.limit, failed: M.failed })).toEqual({ status: 409, body: { message: M.failed } });
  });

  it("실패경로: 모르는 코드·코드 없음은 500 — DB 문구를 그대로 내보내지 않는다", () => {
    expect(pgErrorReply("P0001", M)).toEqual({ status: 500, body: { message: M.failed } });
    expect(pgErrorReply(undefined, M).status).toBe(500);
  });
});
