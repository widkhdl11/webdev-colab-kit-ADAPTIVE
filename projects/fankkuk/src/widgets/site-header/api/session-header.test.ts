import { describe, expect, it, vi } from "vitest";
import type { Viewer } from "@/entities/session/model/viewer";
vi.mock("@/shared/api/supabase/server", () => ({ createRequestSupabase: vi.fn() }));
import { readSiteHeader } from "./session-header";

const FAN = { userId: "fan-1", role: "fan", nickname: "별빛" } as Viewer;

// 부른 읽기 함수 이름을 모은다 — 무엇을 부르든 빈 목록을 돌려준다
function recordingClient() {
  const called: string[] = [];
  const rpc = (name: string) => {
    called.push(name);
    return Promise.resolve({ data: [], error: null });
  };
  return { client: { rpc } as never, called };
}

describe("readSiteHeader — 팬 사이드바", () => {
  it("선물 목록은 읽지 않고 처리할 일 수만 넘긴다(주문번호·크리에이터 이름이 브라우저로 가지 않는다)", async () => {
    const { client, called } = recordingClient();
    const props = await readSiteHeader(client, FAN, "/home");
    expect(called).toEqual(["my_action_items"]);
    // viewerId: 상단 바가 다른 계정의 폼 임시 저장을 지우는 데만 쓴다(session-login INV-L20) — 본인 ID 뿐이다
    expect(props).toEqual({ role: "fan", current: "/home", nickname: "별빛", actionCount: 0, viewerId: FAN.userId });
  });

  it("화면이 처리할 일을 이미 읽었으면 다시 읽지 않고 그 줄 수를 쓴다", async () => {
    const { client, called } = recordingClient();
    const props = await readSiteHeader(client, FAN, "/home", [{}, {}]);
    expect(called).toEqual([]);
    expect(props).toMatchObject({ actionCount: 2 });
  });
});

describe("readSiteHeader — 크리에이터 이름 자리 (signup INV-U21)", () => {
  it("INV-U21: 채널을 만들기 전(닉네임 없음) 크리에이터는 이름 자리에 본인 로그인 아이디", async () => {
    const { client } = recordingClient();
    const viewer: Viewer = { userId: "cr-1", role: "creator", loginId: "honeypot" };
    expect(await readSiteHeader(client, viewer, "/creator", [])).toMatchObject({ role: "creator", nickname: "honeypot" });
  });

  it("INV-U21: 닉네임이 있으면 닉네임 — 아이디는 쓰지 않는다", async () => {
    const { client } = recordingClient();
    const viewer: Viewer = { userId: "cr-1", role: "creator", nickname: "꿀단지", loginId: "honeypot" };
    expect(await readSiteHeader(client, viewer, "/creator", [])).toMatchObject({ nickname: "꿀단지" });
  });

  it("INV-U21 (실패경로): 팬에게는 아이디를 이름 자리에 쓰지 않는다(팬은 닉네임이 언제나 있다)", async () => {
    const { client } = recordingClient();
    const viewer: Viewer = { userId: "fan-2", role: "fan", loginId: "fan_login" };
    expect(await readSiteHeader(client, viewer, "/home", [])).toMatchObject({ nickname: "" });
  });
});
