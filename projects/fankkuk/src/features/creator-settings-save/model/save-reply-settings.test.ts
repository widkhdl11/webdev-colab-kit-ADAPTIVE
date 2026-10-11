import { describe, expect, it } from "vitest";
import { saveCreatorReplySettings } from "./save-creator-settings";

// 답장 모음 보이기 · X 계정 · 태그 허용 저장 (gift-reply INV-G8). 크리에이터 본인만 — DB 가 로그인 토큰으로 정한다.

const HARU = { userId: "creator-haru", role: "creator" } as const;

function fakeClient(error: { code: string } | null = null) {
  const calls: { fn: string; args: unknown }[] = [];
  return {
    calls,
    client: {
      rpc: async (fn: string, args: unknown) => {
        calls.push({ fn, args });
        return { data: null, error };
      },
    } as never,
  };
}

describe("답장 설정 저장 (INV-G8)", () => {
  it("INV-G8: 세 칸만 넘기고, X 계정은 앞의 @ 와 공백을 떼서 보낸다 — 비우면 null, 태그 허용도 끈다", async () => {
    const f = fakeClient();
    expect(await saveCreatorReplySettings({ client: f.client, viewer: HARU }, { wallVisible: true, xHandle: " @Haru_TV ", xTagAllowed: true, creatorId: "c2" })).toEqual({
      ok: true,
    });
    expect(f.calls).toEqual([{ fn: "update_my_reply_settings", args: { p_wall_visible: true, p_x_handle: "Haru_TV", p_x_tag_allowed: true } }]);
    const g = fakeClient();
    await saveCreatorReplySettings({ client: g.client, viewer: HARU }, { wallVisible: false, xHandle: "  ", xTagAllowed: true });
    expect(g.calls[0].args).toEqual({ p_wall_visible: false, p_x_handle: null, p_x_tag_allowed: false });
  });

  it("INV-G8 (실패경로): 팬은 403, 꼴이 아닌 X 계정은 DB 를 부르기 전에 400", async () => {
    const f = fakeClient();
    expect(await saveCreatorReplySettings({ client: f.client, viewer: { userId: "f", role: "fan" } }, { wallVisible: true, xHandle: "", xTagAllowed: false })).toMatchObject({
      ok: false,
      status: 403,
    });
    for (const bad of ["a".repeat(16), "하루", "ha-ru", "ha ru"]) {
      expect(await saveCreatorReplySettings({ client: f.client, viewer: HARU }, { wallVisible: true, xHandle: bad, xTagAllowed: true }), bad).toMatchObject({
        ok: false,
        status: 400,
      });
    }
    expect(f.calls).toEqual([]);
  });
});
