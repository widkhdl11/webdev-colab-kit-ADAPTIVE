import { describe, expect, it } from "vitest";
import {
  MESSAGE_KAKAO_SIGNATURE,
  MESSAGE_LOGIN_ID,
  MESSAGE_NOT_MEMBER,
  MESSAGE_OPEN_WORK,
  MESSAGE_PHOTOS_LEFT,
  MESSAGE_WITHDRAW_OWNER_ONLY,
  withdrawAccount,
  type RemovePhotos,
} from "./withdraw-account";

// 회원 탈퇴 처리 (my-account INV-A15). 대표 판정·진행 중인 일·가명 처리는 DB 함수가 최종으로 한다 — 여기서는 입력 모양, 거절 문장, 사진 지우기.

type Who = { operator: boolean; owner: boolean };
const RESULT = { pseudonym: "p", fan_photo_paths: ["u/1.webp"], creator_photo_paths: ["c/1.webp", "c/bg-1.webp"] };

function fakeClient(reply: { data?: unknown; error?: { code: string } | null }, who: Who = { operator: true, owner: true }) {
  const calls: { fn: string; args: unknown }[] = [];
  const client = {
    rpc: async (fn: string, args: unknown) => {
      if (fn === "is_operator") return { data: who.operator, error: null };
      if (fn === "is_owner") return { data: who.owner, error: null };
      calls.push({ fn, args });
      return { data: reply.data ?? null, error: reply.error ?? null };
    },
  } as never;
  return { calls, client };
}

function photos(ok = true) {
  const removed: Parameters<RemovePhotos>[0][] = [];
  const remove: RemovePhotos = async (p) => {
    removed.push(p);
    return ok;
  };
  return { removed, remove };
}

describe("INV-A15: 회원 탈퇴 처리", () => {
  it("INV-A15 (S15): 대표가 아이디로 탈퇴 처리 — 앞뒤 공백·대문자를 정리해 DB 함수를 부르고, 돌려받은 사진을 저장소별로 지운 뒤 200", async () => {
    const { calls, client } = fakeClient({ data: RESULT });
    const p = photos();
    expect(await withdrawAccount(client, p.remove, { loginId: "  Byeol_Bit " })).toEqual({ status: 200, body: { ok: true } });
    expect(calls).toEqual([{ fn: "withdraw_account", args: { p_login_id: "byeol_bit" } }]);
    expect(p.removed).toEqual([{ fan: ["u/1.webp"], creator: ["c/1.webp", "c/bg-1.webp"] }]);
  });

  it("INV-A15 (S15): 지울 사진이 없으면 저장소를 부르지 않는다 · 사진 지우기가 실패하면 탈퇴는 됐다고 하되 알려야 할 문장을 같이 준다", async () => {
    const none = fakeClient({ data: { pseudonym: "p", fan_photo_paths: [], creator_photo_paths: [] } });
    const p = photos();
    expect(await withdrawAccount(none.client, p.remove, { loginId: "byeolbit" })).toEqual({ status: 200, body: { ok: true } });
    expect(p.removed).toEqual([]);
    const fail = fakeClient({ data: RESULT });
    expect(await withdrawAccount(fail.client, photos(false).remove, { loginId: "byeolbit" })).toEqual({ status: 200, body: { ok: true, message: MESSAGE_PHOTOS_LEFT } });
    // DB 가 사진 목록을 돌려주지 않으면(모양이 다름) 지웠는지 알 수 없으니 알려야 할 문장을 준다 — 저장소는 부르지 않는다
    const odd = fakeClient({ data: { pseudonym: "p" } });
    const q = photos();
    expect(await withdrawAccount(odd.client, q.remove, { loginId: "byeolbit" })).toEqual({ status: 200, body: { ok: true, message: MESSAGE_PHOTOS_LEFT } });
    expect(q.removed).toEqual([]);
  });

  it("INV-A15 (S15b, 실패경로): 운영자가 아니면 404, 직원은 403 — 둘 다 DB 함수를 부르지 않는다", async () => {
    const guest = fakeClient({}, { operator: false, owner: false });
    expect((await withdrawAccount(guest.client, photos().remove, { loginId: "byeolbit" })).status).toBe(404);
    expect(guest.calls).toEqual([]);
    const staff = fakeClient({}, { operator: true, owner: false });
    expect(await withdrawAccount(staff.client, photos().remove, { loginId: "byeolbit" })).toEqual({ status: 403, body: { message: MESSAGE_WITHDRAW_OWNER_ONLY } });
    expect(staff.calls).toEqual([]);
  });

  it("INV-A15 (S15b, 실패경로): 아이디 꼴이 틀리거나 모르는 칸이 있으면 DB 를 부르지 않고 400", async () => {
    for (const body of [null, {}, { loginId: "" }, { loginId: "ab" }, { loginId: "별빛이" }, { loginId: "a".repeat(31) }, { loginId: "byeolbit", reason: "x" }]) {
      const { calls, client } = fakeClient({});
      expect(await withdrawAccount(client, photos().remove, body)).toEqual({ status: 400, body: { message: MESSAGE_LOGIN_ID } });
      expect(calls).toEqual([]);
    }
  });

  it("INV-A15 (S15b, 실패경로): DB 거절을 문장으로 — 대표 아님 403 · 없는 회원 404 · 진행 중인 일 409 · 카카오 서명 409 · 그 밖 500, 사진은 지우지 않는다", async () => {
    const cases: [string, number, string | null][] = [
      ["42501", 403, MESSAGE_WITHDRAW_OWNER_ONLY],
      ["P0002", 404, MESSAGE_NOT_MEMBER],
      ["55000", 409, MESSAGE_OPEN_WORK],
      ["0A000", 409, MESSAGE_KAKAO_SIGNATURE],
      ["XX000", 500, null],
    ];
    for (const [code, status, message] of cases) {
      const p = photos();
      const reply = await withdrawAccount(fakeClient({ error: { code } }).client, p.remove, { loginId: "byeolbit" });
      expect(reply.status).toBe(status);
      if (message) expect(reply.body).toEqual({ message });
      expect(p.removed).toEqual([]);
    }
  });
});
