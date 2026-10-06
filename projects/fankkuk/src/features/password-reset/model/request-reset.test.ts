import { describe, expect, it, vi } from "vitest";
import type { OutgoingMail } from "@/shared/api/mail/smtp";
import { requestPasswordReset, RESET_REQUESTED_MESSAGE } from "./request-reset";

// session-login INV-L10 의 앱 서버 쪽 — 응답이 언제나 하나인지, 메일 본문이 링크와 닉네임뿐인지.
// 계정·이메일 대조와 한도는 DB 함수(manual 0013)가 한다 — 실제 DB 로 도는 시험은 tests/integration/password-reset.integration.test.ts.

const TOKEN = "b".repeat(64);
const ROW = { token: TOKEN, email: "owner@example.com", nickname: "주인" };

function fakes(rows: unknown[], opts: { sendFails?: boolean; sendHangs?: boolean } = {}) {
  const sent: OutgoingMail[] = [];
  const rpcCalls: Record<string, unknown>[] = [];
  const deferred: (() => Promise<void>)[] = [];
  const deps = {
    admin: {
      async rpc(_fn: string, args: Record<string, unknown>) {
        rpcCalls.push(args);
        return { data: rows, error: null };
      },
    },
    getMailer: () => ({
      appOrigin: "http://127.0.0.1:3311",
      send: async (m: OutgoingMail) => {
        if (opts.sendHangs) await new Promise<never>(() => {});
        if (opts.sendFails) throw new Error("smtp down");
        sent.push(m);
      },
    }),
    defer: (task: () => Promise<void>) => {
      deferred.push(task);
    },
  };
  /** 응답 뒤로 미룬 일을 지금 한다(라우트에서는 Next 의 after 가 응답을 보낸 뒤 한다). */
  const flush = async () => {
    for (const task of deferred.splice(0)) await task();
  };
  return { deps, sent, rpcCalls, flush, deferred };
}

describe("INV-L10: 재설정 요청의 응답은 언제나 하나", () => {
  it("INV-L10 S8 (실패경로): DB 가 빈 결과(계정 없음·이메일 다름·확인 안 됨·한도)든 한 줄이든 같은 상태 코드·같은 문구", async () => {
    const none = fakes([]);
    const one = fakes([ROW]);
    const a = await requestPasswordReset(none.deps, { loginId: "it_x", email: "x@example.com" });
    const b = await requestPasswordReset(one.deps, { loginId: "it_x", email: "owner@example.com" });
    expect(a).toEqual({ status: 200, message: RESET_REQUESTED_MESSAGE });
    expect(b).toEqual(a);
    await none.flush();
    await one.flush();
    expect(none.sent).toHaveLength(0);
    expect(one.sent).toHaveLength(1);
  });

  it("INV-L10 (실패경로): 메일 보내기에 실패해도 같은 응답 — 실패를 알리면 「그 아이디와 이메일이 맞다」가 새어 나간다", async () => {
    const errors = vi.spyOn(console, "error").mockImplementation(() => {});
    const { deps, flush } = fakes([ROW], { sendFails: true });
    expect(await requestPasswordReset(deps, { loginId: "it_x", email: "owner@example.com" })).toEqual({ status: 200, message: RESET_REQUESTED_MESSAGE });
    await expect(flush()).resolves.toBeUndefined(); // 미룬 메일 보내기의 실패도 밖으로 새지 않는다
    expect(errors).toHaveBeenCalledTimes(1);
    errors.mockRestore();
  });

  it("INV-L10 (실패경로): 메일은 응답을 보낸 뒤에 보낸다 — 메일 서버가 멈춰 있어도 응답은 바로 나가고, 응답 전에는 한 통도 보내지 않는다", async () => {
    const hanging = fakes([ROW], { sendHangs: true });
    const answered = await Promise.race([
      requestPasswordReset(hanging.deps, { loginId: "it_x", email: "owner@example.com" }),
      new Promise<"timeout">((r) => setTimeout(() => r("timeout"), 200)),
    ]);
    expect(answered).toEqual({ status: 200, message: RESET_REQUESTED_MESSAGE });
    expect(hanging.deferred).toHaveLength(1);

    const later = fakes([ROW]);
    await requestPasswordReset(later.deps, { loginId: "it_x", email: "owner@example.com" });
    expect(later.sent).toHaveLength(0);
    await later.flush();
    expect(later.sent).toHaveLength(1);
  });

  it("INV-L10: 메일은 DB 가 돌려준 확인된 이메일로, 본문은 우리 사이트 재설정 링크와 닉네임뿐", async () => {
    const { deps, sent, flush } = fakes([ROW]);
    await requestPasswordReset(deps, { loginId: "it_x", email: " OWNER@example.com " });
    await flush();
    expect(sent[0]!.to).toBe("owner@example.com");
    expect(sent[0]!.text).toContain("주인님");
    expect(sent[0]!.text).toContain(`http://127.0.0.1:3311/password/reset?token=${TOKEN}`);
    expect(sent[0]!.text).not.toMatch(/01[016789]\d{7,8}|login\.fankkuk/);
  });

  it("INV-L10: 아이디·이메일 둘 다 DB 에 넘긴다(앞뒤 공백은 뗀다)", async () => {
    const { deps, rpcCalls } = fakes([]);
    await requestPasswordReset(deps, { loginId: "  it_x ", email: " a@b.co " });
    expect(rpcCalls).toEqual([{ p_login_id: "it_x", p_email: "a@b.co" }]);
  });

  it("INV-L10: 빈 칸이면 DB 에 묻지 않고 입력 안내", async () => {
    for (const body of [{ loginId: "", email: "a@b.co" }, { loginId: "it_x", email: "  " }, null]) {
      const { deps, rpcCalls } = fakes([ROW]);
      expect((await requestPasswordReset(deps, body)).status).toBe(400);
      expect(rpcCalls).toEqual([]);
    }
  });
});
