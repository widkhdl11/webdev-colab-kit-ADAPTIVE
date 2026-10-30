import { describe, expect, it } from "vitest";
import { readMyAccount } from "./read-my-account";

// 내 정보 읽기 — my_account 한 줄과 「바로 받기」(my_notification_instant, notification-batching INV-NB5)를 같이 읽는다.

const ROW = {
  login_id: "byeolbit_fan",
  nickname: "별빛",
  email: null,
  pending_email: null,
  phone_masked: null,
  notify_kakao: true,
  notify_email: true,
};

type Reply = { data: unknown; error: { code: string } | null };

function fake(replies: Record<string, Reply>) {
  const calls: { fn: string; args: unknown }[] = [];
  const client = {
    rpc: async (fn: string, args?: unknown) => {
      calls.push({ fn, args });
      return replies[fn] ?? { data: null, error: { code: "XXXXX" } };
    },
  } as never;
  return { calls, client };
}

describe("내 정보 읽기", () => {
  it("INV-NB5: 「바로 받기」를 인자 없이 읽어 notifyInstant 로 싣는다", async () => {
    const f = fake({ my_account: { data: [ROW], error: null }, my_notification_instant: { data: true, error: null } });
    expect(await readMyAccount(f.client)).toMatchObject({ nickname: "별빛", notifyInstant: true });
    expect(f.calls.find((c) => c.fn === "my_notification_instant")?.args).toBeUndefined();
  });

  it("INV-NB5: 행이 없으면 DB 가 false 를 준다 — 그대로 꺼짐", async () => {
    const f = fake({ my_account: { data: [ROW], error: null }, my_notification_instant: { data: false, error: null } });
    expect(await readMyAccount(f.client)).toMatchObject({ notifyInstant: false });
  });

  it("(실패경로) 「바로 받기」를 못 읽으면 null — 틀린 값을 화면에 보여 저장하지 않게", async () => {
    const f = fake({ my_account: { data: [ROW], error: null }, my_notification_instant: { data: null, error: { code: "42883" } } });
    expect(await readMyAccount(f.client)).toBeNull();
  });
});
