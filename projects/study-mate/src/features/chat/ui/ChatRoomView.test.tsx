/**
 * 채팅방 화면.
 *
 * **이 파일이 아니면 아무도 못 붙드는 것이 하나다** — 보낸 사람 이름을 모를 때 화면이
 * 그 줄에 아무것도 안 쓴다는 것. 판독기 검사는 `senderName` 이 null 이라는 것까지만 보고,
 * 그 null 을 받아 줄을 통째로 빼는 것은 여기다. 조건을 빼면 빈 이름 줄이 남고, 제품이
 * 자리표시 글자를 다시 넣으면 자기 이름을 그 글자로 지은 사람과 화면에서 같아진다.
 * 근거: 시각 기준 「이름을 모르면 이름 줄을 안 그린다」(2026-09-09).
 *
 * **모킹하는 것은 이웃이지 검증 대상이 아니다.** 서버 액션은 `"use server"` 라 이
 * 환경에서 못 부르고, 실시간 클라이언트는 네트워크에 붙는다.
 */
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import type { ChatMessage } from "@/entities/chat";

vi.mock("../api/chat-actions", () => ({
  sendMessageAction: async () => ({ ok: true, value: null }),
}));

/** 방송 하나를 흘려보내는 손잡이. 구독이 붙을 때 여기 담긴다. */
let 방송: ((message: unknown) => void) | null = null;

vi.mock("@/shared/api/supabase/browser-client", () => ({
  browserSupabase: () => {
    const channel = {
      on(_type: string, _filter: unknown, handler: (m: unknown) => void) {
        방송 = handler;
        return channel;
      },
      subscribe(cb: (status: string) => void) {
        cb("SUBSCRIBED");
        return channel;
      },
    };
    return {
      auth: { getSession: async () => ({ data: { session: { access_token: "t" } } }) },
      realtime: { setAuth: async () => undefined },
      channel: () => channel,
      removeChannel: () => undefined,
    };
  },
}));

const { ChatRoomView } = await import("./ChatRoomView");

const 나 = "11111111-1111-4111-8111-111111111111";
const 남 = "22222222-2222-4222-8222-222222222222";

function 메시지(덮어쓸: Partial<ChatMessage> = {}): ChatMessage {
  return {
    id: "m1",
    senderId: 남,
    senderName: "홍길동",
    content: "안녕하세요",
    createdAt: "2026-09-09T01:00:00.000Z",
    ...덮어쓸,
  };
}

// jsdom 에는 `scrollIntoView` 가 없다. 화면이 붙자마자 부르므로 없으면 그리기가 터진다 —
// 동작을 바꾸는 것이 아니라 없는 것을 채우는 것이다.
beforeAll(() => {
  Element.prototype.scrollIntoView = () => undefined;
});

let container: HTMLDivElement;
let root: Root;

async function 그리기(messages: readonly ChatMessage[]) {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  await act(async () => {
    root.render(<ChatRoomView chatId="c1" myId={나} initialMessages={messages} />);
  });
}

/** 말풍선(`.bubble`) 안의 문단들 — 이름 줄과 본문. 날짜 구분 줄은 말풍선 밖이라 안 잡힌다. */
const 말풍선문단 = () => [...container.querySelectorAll("ol li div div p")];
/**
 * 말풍선이 실제로 내놓는 글자 전부.
 *
 * **문단만 보면 안 된다** — 자리표시를 `span` 으로 되살리는 변이가 문단 단언을 전부
 * 통과한다. 이 단언은 엘리먼트 종류와 무관하다 (2026-09-09 test-auditor).
 */
const 말풍선글자 = () =>
  [...container.querySelectorAll("ol li div div")].map((b) => b.textContent);
/** 낭독기에만 들리는 글자. */
const 소리표시 = () => [...container.querySelectorAll("ol li .sr-only")].map((e) => e.textContent);

afterEach(async () => {
  방송 = null;
  await act(async () => root.unmount());
  document.body.replaceChildren();
});

describe("채팅방 화면 — 보낸 사람 이름 줄", () => {
  it("남의 말풍선은 이름을 쓴다", async () => {
    await 그리기([메시지()]);

    expect(말풍선문단().map((p) => p.textContent)).toEqual(["홍길동", "안녕하세요"]);
  });

  it("이름을 모르면 줄이 아예 없다 — 빈 줄도 안 남는다", async () => {
    await 그리기([메시지({ senderName: null })]);

    expect(말풍선문단().map((p) => p.textContent)).toEqual(["안녕하세요"]);
    // 종류를 안 가리고 본다 — 자리표시를 다른 태그로 되살려도 여기서 잡힌다.
    expect(말풍선글자()).toEqual(["받은 메시지. 안녕하세요"]);
  });

  it("내 말풍선은 이름을 안 쓴다 — 자리로 이미 갈린다", async () => {
    await 그리기([메시지({ senderId: 나, senderName: "나" })]);

    expect(말풍선문단().map((p) => p.textContent)).toEqual(["안녕하세요"]);
  });

  it("실시간으로 온 메시지도 이름 줄이 없다 — 자리표시 글자를 넣지 않는다", async () => {
    await 그리기([]);
    expect(방송).not.toBeNull();

    await act(async () => {
      방송?.({
        payload: {
          record: {
            id: "m2",
            sender_id: 남,
            content: "방금 왔습니다",
            created_at: "2026-09-09T02:00:00.000Z",
          },
        },
      });
    });

    expect(말풍선글자()).toEqual(["받은 메시지. 방금 왔습니다"]);
  });
});

describe("채팅방 화면 — 내 것인지 남의 것인지를 소리로도 말한다", () => {
  it("이름 줄이 없어도 방향은 들린다 — 눈으로 말하는 자리(오른쪽·괘선)가 소리에는 없다", async () => {
    await 그리기([
      메시지({ id: "m1", senderId: 나, senderName: null }),
      메시지({ id: "m2", senderId: 남, senderName: null }),
    ]);

    // 이름을 둘 다 모르는데도 두 말풍선이 갈린다.
    expect(소리표시()).toEqual(["내가 보낸 메시지. ", "받은 메시지. "]);
  });

  it("그 표시는 사용자 글자보다 앞에 있다 — 뒤에 있으면 본문으로 흉내 낼 수 있다", async () => {
    await 그리기([메시지({ senderName: "홍길동" })]);

    const 말풍선 = container.querySelector("ol li div div") as HTMLElement;
    expect(말풍선.firstElementChild?.className).toBe("sr-only");
    expect(말풍선.textContent).toBe("받은 메시지. 홍길동안녕하세요");
  });
});
