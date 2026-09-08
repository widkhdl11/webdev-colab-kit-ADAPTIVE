/**
 * 알림 패널. 근거 스펙: docs/specs/notifications.md (INV-N7 · INV-N8)
 *
 * **이 파일이 아니면 아무도 못 붙드는 것이 둘이다.**
 * ① 종 옆 숫자가 패널이 그리는 안 읽음 줄과 같다는 것(INV-N8) — 판독기 검사는 목록만
 *    보고, 액션 검사는 「헤더를 다시 그리게 한다」까지만 본다. 숫자와 줄이 같은 값에서
 *    나오는지는 이 컴포넌트 안에서만 확인된다.
 * ② 링크 없는 줄이 실제로 `<a href>` 가 아니라는 것(INV-N7) — 판독기는 `href: null` 을
 *    돌려줄 뿐이고, 그 값을 받아 링크를 안 그리는 것은 여기다.
 *
 * **모킹하는 것은 이웃(서버 액션)이지 검증 대상(패널)이 아니다.** 액션 파일은
 * `"use server"` 라 `next/headers` 를 끌고 오므로 이 환경에서 못 부른다.
 */
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { MyNotification } from "@/entities/notification/model/notification";

const 살아있는스터디 = "22222222-2222-4222-8222-222222222222";

const 목록: MyNotification[] = [
  {
    id: "n1",
    type: "participation_requested",
    title: "토익 900 뿌시기",
    createdAt: new Date().toISOString(),
    readAt: null,
    href: `/studies/${살아있는스터디}`,
    gone: false,
  },
  {
    id: "n2",
    type: "participation_accepted",
    title: "알고리즘 스터디",
    createdAt: new Date().toISOString(),
    readAt: null,
    // 가리키는 스터디가 지워진 것을 판독기가 확인한 줄이다
    href: null,
    gone: true,
  },
  {
    id: "n3",
    type: "participation_rejected",
    title: "독서모임",
    createdAt: new Date().toISOString(),
    readAt: new Date().toISOString(),
    href: `/studies/${살아있는스터디}`,
    gone: false,
  },
];

type 결과<T> = { ok: true; value: T } | { ok: false; message: string };

const 액션 = {
  load: vi.fn(async (): Promise<결과<readonly MyNotification[]>> => ({ ok: true, value: 목록 })),
  // **폼을 그대로 받는다.** 인자를 버리면 「무엇을 보냈나」가 검사 밖으로 나가고, 패널과
  // 액션이 서로 다른 칸 이름을 써도 양쪽 검사가 각자 초록불이 된다 (2026-09-08 test-auditor)
  markRead: vi.fn(async (_f: FormData): Promise<결과<{ id: string }>> => ({
    ok: true,
    value: { id: "n1" },
  })),
  markAll: vi.fn(async (): Promise<결과<null>> => ({ ok: true, value: null })),
  remove: vi.fn(async (_f: FormData): Promise<결과<{ id: string }>> => ({
    ok: true,
    value: { id: "n1" },
  })),
};

vi.mock("@/features/manage-notifications", async () => {
  // 칸 이름 상수는 진짜를 쓴다 — 모킹하면 이 검사가 붙들려던 드리프트를 스스로 감춘다
  const { NOTIFICATION_ID_FIELD } = await import("@/features/manage-notifications/model/fields");
  return {
    NOTIFICATION_ID_FIELD,
    loadNotificationsAction: () => 액션.load(),
    markNotificationReadAction: (f: FormData) => 액션.markRead(f),
    markAllNotificationsReadAction: () => 액션.markAll(),
    deleteNotificationAction: (f: FormData) => 액션.remove(f),
  };
});

const { NotificationBell } = await import("./NotificationBell");

let container: HTMLDivElement;
let root: Root;

async function 그리기(unreadCount = 2) {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  await act(async () => {
    root.render(<NotificationBell unreadCount={unreadCount} />);
  });
}

const 종 = () => container.querySelector("button[aria-expanded]") as HTMLButtonElement;
const 배지 = () => 종().querySelector("span[aria-hidden]");
const 줄 = () => [...container.querySelectorAll("li")];
const 버튼 = (label: string) =>
  [...container.querySelectorAll("button")].find((b) => b.textContent?.includes(label));

/** 패널을 연다. 여는 순간 목록을 가져오므로 그 약속이 끝날 때까지 기다린다. */
async function 열기() {
  await act(async () => {
    종().click();
  });
}

beforeEach(() => {
  for (const fn of Object.values(액션)) fn.mockClear();
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

describe("종 옆 숫자 (INV-N8)", () => {
  it("INV-N8: 열기 전에는 서버가 세어 준 값을 그대로 쓴다", async () => {
    await 그리기(7);

    expect(배지()?.textContent).toBe("7");
    expect(액션.load).not.toHaveBeenCalled(); // 화면마다 미리 읽지 않는다
  });

  it("INV-N8: 열면 숫자가 패널이 그리는 안 읽음 줄 수와 같아진다", async () => {
    // 서버가 5 를 줬어도, 목록을 받은 뒤에는 목록이 근거다
    await 그리기(5);
    await 열기();

    expect(줄()).toHaveLength(3);
    expect(배지()?.textContent).toBe("2");
  });

  it("INV-N8: 한 줄을 읽음 처리하면 새로 고치지 않아도 숫자가 줄어든다", async () => {
    await 그리기(2);
    await 열기();

    await act(async () => {
      (줄()[0].querySelector("a") as HTMLAnchorElement).click();
    });

    expect(액션.markRead).toHaveBeenCalledTimes(1);
    // **액션이 실제로 읽는 칸 이름으로 보내는지까지 본다.** 이 단언이 없으면 패널이
    // 다른 이름으로 보내도 초록불이고, 제품에서는 읽음 처리가 언제나 실패한다
    expect(액션.markRead.mock.calls[0][0].get("notificationId")).toBe("n1");
    expect(배지()?.textContent).toBe("1");
  });

  it("INV-N8: 안 읽은 알림을 지우면 숫자가 같이 줄어든다", async () => {
    await 그리기(2);
    await 열기();

    await act(async () => {
      (줄()[0].querySelector("button") as HTMLButtonElement).click();
    });

    expect(줄()).toHaveLength(2);
    expect(액션.remove.mock.calls[0][0].get("notificationId")).toBe("n1");
    expect(배지()?.textContent).toBe("1");
  });

  it("INV-N8: 액션이 실패하면 목록도 숫자도 안 고친다 — 화면에서만 성공한 것처럼 보이면 안 된다", async () => {
    액션.markRead.mockImplementationOnce(async () => ({
      ok: false,
      message: "알림을 읽음으로 바꾸지 못했습니다",
    }));
    await 그리기(2);
    await 열기();

    await act(async () => {
      (줄()[0].querySelector("a") as HTMLAnchorElement).click();
    });

    expect(배지()?.textContent).toBe("2");
    expect(container.querySelector('[role="alert"]')?.textContent).toContain("못했습니다");
  });

  it("INV-N8: 전체 읽음을 누르면 숫자가 사라진다", async () => {
    await 그리기(2);
    await 열기();

    await act(async () => {
      버튼("전체 읽음")?.click();
    });

    expect(배지()).toBeNull();
    expect(버튼("전체 읽음")?.disabled).toBe(true);
  });

  it("안 읽은 것이 없으면 「전체 읽음」이 비활성이다", async () => {
    액션.load.mockImplementationOnce(async () => ({
      ok: true,
      value: 목록.map((n) => ({ ...n, readAt: new Date().toISOString() })),
    }));
    await 그리기(0);
    await 열기();

    expect(버튼("전체 읽음")?.disabled).toBe(true);
    expect(배지()).toBeNull();
  });
});

describe("패널과 액션 사이의 약속", () => {
  it("INV-N4: 액션이 실제로 읽는 칸 이름으로 보낸다 — 이름이 갈리면 읽음 처리가 언제나 실패한다", async () => {
    await 그리기(2);
    await 열기();

    await act(async () => {
      (줄()[0].querySelector("a") as HTMLAnchorElement).click();
    });
    await act(async () => {
      (줄()[0].querySelector("button") as HTMLButtonElement).click();
    });

    // 양쪽이 각자 문자열을 적으면 한쪽만 고쳐지는 날 「어느 알림인지 알 수 없습니다」만 뜬다
    expect(액션.markRead.mock.calls[0][0].get("notificationId")).toBe("n1");
    expect(액션.remove.mock.calls[0][0].get("notificationId")).toBe("n1");
  });
});

describe("링크 없는 줄 (INV-N7)", () => {
  it("INV-N7: 주소가 없는 줄은 링크가 아니다 — 미리 가져오기가 404 를 만들 자리가 없다", async () => {
    await 그리기();
    await 열기();

    const 죽은줄 = 줄()[1];
    expect(죽은줄.querySelector("a")).toBeNull();
    expect(죽은줄.textContent).toContain("열 수 없습니다");
    // 삭제 단추 이름에 그 줄의 문장이 들어간다 — 전부 같은 이름이면 낭독기가 못 가른다
    expect(
      죽은줄.querySelector("button")?.getAttribute("aria-label"),
    ).toContain("알고리즘 스터디");
    // 문장 자체는 그대로 남는다(INV-N6) — 사라지지도, 빈칸이 되지도 않는다
    expect(죽은줄.textContent).toContain("알고리즘 스터디");
  });

  it("INV-N7 (반대 절반): 살아 있는 스터디를 가리키는 줄은 그 스터디로 가는 링크다", async () => {
    await 그리기();
    await 열기();

    expect(줄()[0].querySelector("a")?.getAttribute("href")).toBe(`/studies/${살아있는스터디}`);
  });
});

describe("여닫기", () => {
  it("패널은 처음에 닫혀 있고 종을 눌러야 열린다", async () => {
    await 그리기();

    expect(container.querySelector('[role="dialog"]')).toBeNull();
    expect(종().getAttribute("aria-expanded")).toBe("false");

    await 열기();

    expect(container.querySelector('[role="dialog"]')).not.toBeNull();
    expect(종().getAttribute("aria-expanded")).toBe("true");
  });

  it("ESC 로 닫히고 초점이 종으로 돌아온다", async () => {
    await 그리기();
    await 열기();

    await act(async () => {
      document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    });

    expect(container.querySelector('[role="dialog"]')).toBeNull();
    expect(document.activeElement).toBe(종());
  });

  it("바깥을 누르면 닫힌다", async () => {
    await 그리기();
    await 열기();

    await act(async () => {
      document.body.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
    });

    expect(container.querySelector('[role="dialog"]')).toBeNull();
  });

  it("닫았다 열면 목록을 다시 가져온다 — 옛 목록을 그리면 숫자와 어긋난다", async () => {
    await 그리기();
    await 열기();
    await act(async () => {
      종().click();
    });
    await 열기();

    expect(액션.load).toHaveBeenCalledTimes(2);
  });

  it("목록을 못 불러오면 그 사실을 화면이 말한다", async () => {
    액션.load.mockImplementationOnce(async () => ({
      ok: false,
      message: "알림을 불러오지 못했습니다",
    }));
    await 그리기();
    await 열기();

    expect(container.querySelector('[role="alert"]')?.textContent).toContain(
      "불러오지 못했습니다",
    );
  });
});
