import { describe, expect, it } from "vitest";
import { needsReload, OFFICE_REJECT_REASONS, officeErrorReply } from "./office-error";

const MESSAGES = { limit: "꼴이 맞지 않아요.", failed: "처리하지 못했어요." };

describe("사무실 작업 오류 코드 → 응답 (office-workflow INV-W1·W2·W3·W4)", () => {
  it("INV-W1·W2·W3·W4: DB 오류 코드를 상태와 화면 문구로 옮긴다", () => {
    const cases: [string, number, string][] = [
      ["42501", 403, "권한이 없어요."],
      ["22023", 400, "꼴이 맞지 않아요."],
      ["P0002", 404, "찾을 수 없어요."],
      ["55000", 409, "이미 처리됐거나 지금 단계가 아니에요."],
      ["P0041", 409, "출고 조건이 아직 안 됐어요."],
      ["P0042", 409, "앞 상자 라벨을 붙였는지 먼저 확인해 주세요."],
      ["P0043", 400, "이 상자의 라벨·송장이 아니에요."],
      ["P0044", 409, "검수 기록을 먼저 저장해 주세요."],
      ["P0053", 409, "실측 구간을 먼저 기록해 주세요."],
      ["XX000", 500, "처리하지 못했어요."],
    ];
    for (const [code, status, message] of cases) {
      const reply = officeErrorReply(code, MESSAGES);
      expect(reply.status).toBe(status);
      expect(reply.body.message).toBe(message);
    }
  });

  it("INV-W2: 앞 상자 라벨 대기·검수 기록 없음은 화면이 카드를 고를 수 있게 이유를 같이 준다", () => {
    expect(officeErrorReply("P0042", MESSAGES).body.reason).toBe("pending_label");
    expect(officeErrorReply("P0044", MESSAGES).body.reason).toBe("no_inspection");
    expect(officeErrorReply("P0053", MESSAGES).body.reason).toBe("no_measurement"); // INV-W4 S4d
    expect(officeErrorReply("55000", MESSAGES).body.reason).toBe("wrong_step");
    expect(officeErrorReply(undefined, MESSAGES).body.reason).toBeUndefined();
  });
});

describe("동시 처리 충돌·화면 다시 읽기 (office-workflow INV-W2)", () => {
  it("INV-W2: 23505(같은 줄을 두 번 넣음)는 500 이 아니라 409 — 「이미 처리됨」", () => {
    expect(officeErrorReply("23505", MESSAGES)).toEqual({ status: 409, body: { message: "이미 처리됐거나 지금 단계가 아니에요.", reason: "wrong_step" } });
  });

  it("INV-W2: 55000 문구는 쓰기마다 바꿀 수 있다(이유는 그대로)", () => {
    expect(officeErrorReply("55000", { ...MESSAGES, conflict: "이미 검수 기록이 있어요. 기록은 고칠 수 없어요." }).body).toEqual({
      message: "이미 검수 기록이 있어요. 기록은 고칠 수 없어요.",
      reason: "wrong_step",
    });
  });

  it("INV-W2: 409·404 거부를 받으면 상자를 다시 읽는다 — 검수 기록이 없다는 거부(P0044)만 예외", () => {
    expect(needsReload({ status: 409, reason: "wrong_step" })).toBe(true);
    expect(needsReload({ status: 404, reason: null })).toBe(true);
    expect(needsReload({ status: 409, reason: "not_shippable" })).toBe(true);
    expect(needsReload({ status: 409, reason: "no_inspection" })).toBe(false);
    expect(needsReload({ status: 409, reason: "no_measurement" })).toBe(false); // 실측 칸을 그대로 두고 기록하게
    expect(needsReload({ status: 400, reason: "wrong_code" })).toBe(false);
    expect(needsReload({ status: 500, reason: null })).toBe(false);
  });

  it("INV-W2·W4: 서버가 주는 거부 이유는 모두 화면이 읽는 목록에 있다 — 빠지면 화면이 이유를 모른 채 상자를 다시 읽는다", () => {
    for (const code of ["55000", "23505", "P0041", "P0042", "P0043", "P0044", "P0053"]) {
      const reason = officeErrorReply(code, MESSAGES).body.reason as string;
      expect(OFFICE_REJECT_REASONS).toContain(reason);
    }
  });
});
