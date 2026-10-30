import { describe, expect, it } from "vitest";
import { readMyCreatorSettings } from "./my-creator-settings";

// 크리에이터 설정 읽기 — 알림 칸 셋(카카오·이메일은 my_account, 「바로 받기」는 my_notification_instant — notification-batching INV-NB5).

const SETTINGS = { name: "하루", intro: "", searchable: true, tag_ids: [], custom_tag: null, fan_name: null, personal_color: null };
const ACCOUNT = { notify_kakao: true, notify_email: false, phone_masked: null };

type Reply = { data: unknown; error: { code: string } | null };

function fake(instant: Reply) {
  const calls: { fn: string; args: unknown }[] = [];
  const replies: Record<string, Reply> = {
    my_creator_settings: { data: [SETTINGS], error: null },
    my_account: { data: [ACCOUNT], error: null },
    my_notification_instant: instant,
  };
  const client = {
    rpc: async (fn: string, args?: unknown) => {
      calls.push({ fn, args });
      return replies[fn] ?? { data: null, error: { code: "XXXXX" } };
    },
  } as never;
  return { calls, client };
}

describe("크리에이터 설정 읽기 — 알림 (my-account INV-A11)", () => {
  it("INV-NB5: 「바로 받기」를 인자 없이 읽어 notify.instant 로 싣는다", async () => {
    const f = fake({ data: true, error: null });
    expect((await readMyCreatorSettings(f.client))?.notify).toEqual({ kakao: true, email: false, instant: true });
    expect(f.calls.find((c) => c.fn === "my_notification_instant")?.args).toBeUndefined();
  });

  it("INV-NB5: 행이 없으면 DB 가 false — 꺼짐", async () => {
    const f = fake({ data: false, error: null });
    expect((await readMyCreatorSettings(f.client))?.notify.instant).toBe(false);
  });

  it("(실패경로) 「바로 받기」를 못 읽거나 꼴이 틀리면 던진다 — 다른 알림 칸과 같다", async () => {
    await expect(readMyCreatorSettings(fake({ data: null, error: { code: "42883" } }).client)).rejects.toThrow(/42883/);
    await expect(readMyCreatorSettings(fake({ data: "yes", error: null }).client)).rejects.toThrow();
  });
});
