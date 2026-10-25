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
    expect(props).toEqual({ role: "fan", current: "/home", nickname: "별빛", actionCount: 0 });
  });

  it("화면이 처리할 일을 이미 읽었으면 다시 읽지 않고 그 줄 수를 쓴다", async () => {
    const { client, called } = recordingClient();
    const props = await readSiteHeader(client, FAN, "/home", [{}, {}]);
    expect(called).toEqual([]);
    expect(props).toMatchObject({ actionCount: 2 });
  });
});
