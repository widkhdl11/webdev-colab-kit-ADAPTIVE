import { describe, expect, it, vi } from "vitest";
import type { createServerSupabase } from "@/shared/api/supabase/server-client";
import type { revalidateEntityPath } from "@/shared/lib/revalidate-entity";
import { NO_SESSION_MESSAGE } from "@/entities/session";
import { insertMessage, makeSendMessage } from "./send-message";

const 사용자 = { id: "11111111-1111-4111-8111-111111111111" };
const 방 = "22222222-2222-4222-8222-222222222222";

function 폼(values: Record<string, string> = {}): FormData {
  const form = new FormData();
  for (const [k, v] of Object.entries({ chatId: 방, content: "안녕하세요", ...values }))
    form.append(k, v);
  return form;
}

function 가짜DB(error: { code?: string; message?: string } | null = null) {
  const 보낸것: Record<string, unknown>[] = [];
  const 테이블: string[] = [];
  const factory = vi.fn(async () => ({
    from(table: string) {
      테이블.push(table);
      return {
        insert(payload: Record<string, unknown>) {
          보낸것.push(payload);
          return Promise.resolve({ error });
        },
      };
    },
  }));
  return {
    createSupabase: factory as unknown as typeof createServerSupabase,
    보낸것,
    테이블,
    호출: factory,
  };
}

function 준비(옵션: { 세션?: typeof 사용자 | null; db?: ReturnType<typeof 가짜DB> } = {}) {
  const db = 옵션.db ?? 가짜DB();
  const revalidate = vi.fn(() => true) as unknown as typeof revalidateEntityPath;
  const 세션 = 옵션.세션 === undefined ? 사용자 : 옵션.세션;
  return {
    db,
    revalidate,
    액션: makeSendMessage(async () => 세션, { createSupabase: db.createSupabase, revalidate }),
  };
}

describe("메시지 보내기 액션", () => {
  it("INV-A4: 세션이 없으면 데이터베이스에 손도 대지 않고 정해진 문구로 실패한다", async () => {
    const { db, revalidate, 액션 } = 준비({ 세션: null });

    await expect(액션(폼())).resolves.toEqual({ ok: false, message: NO_SESSION_MESSAGE });
    expect(db.호출).not.toHaveBeenCalled();
    expect(revalidate).not.toHaveBeenCalled();
  });

  it("INV-A4(반대 절반): chat_messages 에 보내는 것은 정확히 세 칸이다", async () => {
    const { db, 액션 } = 준비();

    await expect(액션(폼())).resolves.toEqual({ ok: true, value: null });
    expect(db.테이블).toEqual(["chat_messages"]);
    expect(db.보낸것).toEqual([{ chat_id: 방, sender_id: 사용자.id, content: "안녕하세요" }]);
  });

  it("INV-Z4: 보낸 사람은 폼이 아니라 세션에서 온다 — 폼에 남의 id 를 넣어도 무시된다", async () => {
    const 남 = "99999999-9999-4999-8999-999999999999";
    const { db, 액션 } = 준비();

    await 액션(폼({ sender_id: 남, senderId: 남 }));

    expect(db.보낸것[0]?.sender_id).toBe(사용자.id);
    expect(JSON.stringify(db.보낸것[0])).not.toContain(남);
  });

  it("길이 상한 2000 자가 실제로 걸린다 — 스키마(0021)와 같은 숫자여야 한다", async () => {
    // **숫자를 박는다.** 상수를 import 해서 상대적으로만 보면 MESSAGE_MAX 를 20000 으로
    // 옮겨도 양쪽이 같이 움직여 전부 초록불이다 (2026-09-06 test-auditor).
    //
    // 2026-09-10: 강제 위치가 하나 더 생겼다(0021 의 `chat_messages_content_length`).
    // 여기가 여전히 필요한 이유는 문구다 — 제약이 거부하면 나오는 것이 영어 원문이라
    // 화면에 그대로 못 내보낸다.
    const { db, 액션 } = 준비();

    await expect(액션(폼({ content: "가".repeat(2001) }))).resolves.toEqual({
      ok: false,
      message: "메시지는 2000자까지 보낼 수 있습니다",
    });
    expect(db.호출).not.toHaveBeenCalled();

    // 경계 안쪽 짝. 이게 없으면 상한을 0 으로 바꾼 변이도 초록불이다.
    await expect(액션(폼({ content: "가".repeat(2000) }))).resolves.toEqual({
      ok: true,
      value: null,
    });
  });

  it("INV-M3(앱 쪽 절반): 길이를 코드 포인트로 센다 — 스키마의 char_length 와 같은 단위다", async () => {
    // `content.length` 는 UTF-16 코드 단위라 이모지 하나가 2로 세진다. 스키마의
    // `char_length` 는 코드 포인트다. 앱이 코드 단위로 세면 이모지 1001개짜리 메시지를
    // **앱만** 막고, 「두 자리가 같은 숫자다」가 경계에서 참이 아니게 된다
    // (2026-09-10 code-reviewer).
    const { db, 액션 } = 준비();

    // 코드 포인트로는 1500자, UTF-16 코드 단위로는 3000자다.
    await expect(액션(폼({ content: "🙂".repeat(1500) }))).resolves.toEqual({ ok: true, value: null });
    expect(db.호출).toHaveBeenCalled();
  });

  it("INV-M4(앱 쪽 절반): 제어문자가 든 본문은 데이터베이스에 안 보내고 읽을 수 있는 문구로 거부한다", async () => {
    // **없으면 고칠 수 없는 오류가 반복된다.** `trim()` 은 양끝만 깎으므로 본문 가운데의
    // 제어문자는 그대로 데이터베이스로 가고, 제약이 23514 로 거부하면 `dbErrorMessage` 가
    // 영어 원문을 덮어 「잠시 뒤 다시 시도해 주세요」를 돌려준다 — 다시 시도해도 절대
    // 성공하지 않는데 문구는 기다리라고 한다 (2026-09-10 code-reviewer).
    const { db, 액션 } = 준비();

    // 탭(U+0009). 스프레드시트 셀을 복사해 붙여 넣으면 그대로 남는 글자다.
    await expect(액션(폼({ content: "앞\u0009뒤" }))).resolves.toEqual({
      ok: false,
      message: "메시지에 넣을 수 없는 글자가 있습니다",
    });
    expect(db.호출, "제어문자가 든 본문이 데이터베이스까지 갔다").not.toHaveBeenCalled();
  });

  it("INV-M4(반대 절반): 제어문자가 아닌 특수문자는 그대로 보낸다", async () => {
    // 이 짝이 없으면 판정을 「전부 거부」로 바꾼 변이도 초록불이다.
    const { db, 액션 } = 준비();

    await expect(액션(폼({ content: "3 < 5 & 「낫표」 🙂" }))).resolves.toEqual({ ok: true, value: null });
    expect(db.보낸것[0]?.content).toBe("3 < 5 & 「낫표」 🙂");
  });

  it("공백만 보내면 거부하고, 보내는 값은 앞뒤 공백이 잘린 것이다", async () => {
    const { db, 액션 } = 준비();

    await expect(액션(폼({ content: "     " }))).resolves.toEqual({
      ok: false,
      message: "보낼 내용을 적어 주세요",
    });
    expect(db.호출).not.toHaveBeenCalled();

    await 액션(폼({ content: "  안녕  " }));
    expect(db.보낸것[0]?.content).toBe("안녕");
  });

  it("방을 모르면 데이터베이스를 부르지 않는다", async () => {
    const { db, 액션 } = 준비();

    await expect(액션(폼({ chatId: "" }))).resolves.toEqual({
      ok: false,
      message: "어느 방인지 알 수 없습니다",
    });
    expect(db.호출).not.toHaveBeenCalled();
  });

  it("INV-P8(앱 쪽 절반): 멤버가 아니라 정책이 거부하면 그 이유를 사람의 말로 알린다", async () => {
    const { revalidate, 액션 } = 준비({ db: 가짜DB({ code: "42501" }) });

    await expect(액션(폼())).resolves.toEqual({
      ok: false,
      message: "이 방의 멤버가 아니라 메시지를 보낼 수 없습니다",
    });
    expect(revalidate).not.toHaveBeenCalled();
  });

  it("그 밖의 거부도 삼키지 않는다 — 삼키면 화면은 「보냈습니다」를 말하고 메시지는 사라진다", async () => {
    const 로그 = vi.spyOn(console, "error").mockImplementation(() => {});
    const { revalidate, 액션 } = 준비({
      db: 가짜DB({ code: "08006", message: "connection failure" }),
    });

    await expect(액션(폼())).resolves.toEqual({
      ok: false,
      message: "보내기하지 못했습니다. 잠시 뒤 다시 시도해 주세요",
    });
    expect(revalidate).not.toHaveBeenCalled();
    expect(로그).toHaveBeenCalled();
    로그.mockRestore();
  });

  it("우리가 지은 문장(P0001)은 그대로 보여 준다", async () => {
    const { 액션 } = 준비({
      db: 가짜DB({ code: "P0001", message: "이 방은 더 이상 쓸 수 없습니다" }),
    });

    await expect(액션(폼())).resolves.toEqual({
      ok: false,
      message: "이 방은 더 이상 쓸 수 없습니다",
    });
  });

  it("성공하면 그 방 화면의 캐시를 지운다", async () => {
    const { revalidate, 액션 } = 준비();

    await 액션(폼());

    expect(revalidate).toHaveBeenCalledWith("/chats", 방);
  });

  it("본체를 직접 불러도 같은 것을 보낸다", async () => {
    const db = 가짜DB();

    await expect(
      insertMessage(사용자, { chatId: 방, content: " 잘 부탁드립니다 " }, db.createSupabase),
    ).resolves.toEqual({ ok: true, value: null });
    expect(db.보낸것[0]).toEqual({ chat_id: 방, sender_id: 사용자.id, content: "잘 부탁드립니다" });
  });
});
