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

describe("지운 뒤 초점 (design-rules.md 2026-09-08 (2))", () => {
  /**
   * **이 검사를 지우면 초점이 문서 맨 앞으로 떨어지는 것을 아무도 못 잡는다.** 패널이
   * `aria-modal` 로 Tab 을 가두고 있어서, 그 상태의 다음 Tab 은 방금 지운 자리가 아니라
   * 목록 맨 위로 되돌아온다 — 화면을 보면서 키보드만 쓰는 사용자에게는 여럿을 연달아
   * 지우는 일이 매번 목록을 처음부터 훑는 일이 된다.
   */
  it("지우면 초점이 다음 줄의 삭제 단추로 간다", async () => {
    await 그리기();
    await 열기();

    await act(async () => {
      const b = 줄()[0].querySelector("button") as HTMLButtonElement;
      b.focus(); // jsdom 의 click() 은 초점을 안 옮긴다 — 안 주면 패널이 쥔 채라 검사가 헛돈다
      b.click();
    });

    // n1 이 빠지고 n2 가 첫 줄이 된다. 초점은 그 줄의 삭제 단추다
    expect(줄()).toHaveLength(2);
    expect(document.activeElement).toBe(줄()[0].querySelector("button"));
    expect(document.activeElement?.getAttribute("aria-label")).toContain("알고리즘 스터디");
  });

  it("맨 아랫줄을 지우면 다음 줄이 없으므로 이전 줄로 간다", async () => {
    await 그리기();
    await 열기();

    await act(async () => {
      const b = 줄()[2].querySelector("button") as HTMLButtonElement;
      b.focus();
      b.click();
    });

    expect(줄()).toHaveLength(2);
    expect(document.activeElement).toBe(줄()[1].querySelector("button"));
    expect(document.activeElement?.getAttribute("aria-label")).toContain("알고리즘 스터디");
  });

  it("마지막 하나를 지우면 갈 줄이 없으므로 패널이 초점을 받는다", async () => {
    액션.load.mockImplementationOnce(async () => ({ ok: true, value: [목록[0]] }));
    await 그리기(1);
    await 열기();

    await act(async () => {
      const b = 줄()[0].querySelector("button") as HTMLButtonElement;
      b.focus(); // 안 주면 패널이 초점을 쥔 채라 「패널로 옮겼다」가 저절로 참이 된다
      b.click();
    });

    expect(줄()).toHaveLength(0);
    expect(document.activeElement).toBe(container.querySelector('[role="dialog"]'));
  });

  /**
   * **브라우저는 `disabled` 가 된 요소의 초점을 뺏는다.** 액션이 도는 동안 `busy` 로 이
   * 단추가 꺼지므로, 실패해서 다시 켜져도 초점은 이미 문서 맨 앞에 있다. 그 상태에서
   * Tab 을 누르면 가둠이 「처음도 마지막도 패널도 아니다」로 판단해 통과시켜서 초점이
   * 패널 밖으로 샌다 — `aria-modal` 로 「이 안이 전부」라고 말해 둔 채로.
   *
   * **jsdom 은 이 blur 를 구현하지 않는다.** 그래서 손으로 흉내 내지 않으면 이 검사는
   * 고친 것을 빼도 통과한다 (2026-09-09 code-reviewer 가 잡았다).
   */
  it("삭제가 실패하면 줄이 남고, 뺏긴 초점이 누른 단추로 돌아온다", async () => {
    let 실패시키기: () => void = () => {};
    액션.remove.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          실패시키기 = () =>
            resolve({ ok: false, message: "알림을 지우지 못했습니다" });
        }),
    );
    await 그리기();
    await 열기();

    const 누른단추 = 줄()[0].querySelector("button") as HTMLButtonElement;
    await act(async () => {
      누른단추.focus();
      누른단추.click();
    });

    // 액션이 도는 동안이다. 브라우저가 여기서 초점을 뺏는 것을 손으로 흉내 낸다 —
    // `blur()` 는 이미 비활성인 요소에 jsdom 에서 안 먹으므로 초점을 다른 데로 옮긴다
    expect(누른단추.disabled).toBe(true);
    (container.querySelector('[role="dialog"]') as HTMLElement).focus();
    expect(document.activeElement).not.toBe(누른단추);

    await act(async () => {
      실패시키기();
    });

    expect(줄()).toHaveLength(3);
    expect(document.activeElement).toBe(줄()[0].querySelector("button"));
    expect(container.querySelector('[role="alert"]')?.textContent).toContain("못했습니다");
  });

  it("「전체 읽음」을 누르면 그 단추가 꺼지므로 초점이 패널로 온다", async () => {
    await 그리기(2);
    await 열기();

    const 전체 = 버튼("전체 읽음") as HTMLButtonElement;
    await act(async () => {
      전체.focus();
      전체.click();
    });

    // 안 읽은 것이 0이 되어 이 단추는 영구 비활성이다 — 초점을 안 옮기면 문서 맨 앞에 남는다
    expect(버튼("전체 읽음")?.disabled).toBe(true);
    expect(document.activeElement).toBe(container.querySelector('[role="dialog"]'));
  });

  it("액션이 결과 없이 깨져도 단추가 다시 켜지고 화면이 그 사실을 말한다", async () => {
    액션.remove.mockImplementationOnce(async () => {
      throw new Error("network");
    });
    await 그리기();
    await 열기();

    await act(async () => {
      (줄()[0].querySelector("button") as HTMLButtonElement).click();
    });

    // 안 풀면 패널의 단추가 전부 영구 비활성이 되고 오류도 안 뜬다 — 죽은 화면이다
    expect(줄()).toHaveLength(3);
    expect((줄()[0].querySelector("button") as HTMLButtonElement).disabled).toBe(false);
    expect(container.querySelector('[role="alert"]')?.textContent).toContain("연결에 문제");
  });

  it("목록 불러오기가 결과 없이 깨져도 「불러오는 중」에서 안 멈춘다", async () => {
    액션.load.mockImplementationOnce(async () => {
      throw new Error("network");
    });
    await 그리기();
    await 열기();

    expect(container.textContent).not.toContain("불러오는 중");
    expect(container.querySelector('[role="alert"]')?.textContent).toContain("연결에 문제");
  });

  it("지운 사실이 낭독기로 간다 — 줄이 사라지는 것은 눈에만 보인다", async () => {
    await 그리기();
    await 열기();

    const 알림자리 = () => container.querySelector('[role="status"]');
    // 패널이 열리는 순간부터 자리가 있어야 한다. 지운 뒤에 만들어 넣으면 안 읽힌다
    expect(알림자리()).not.toBeNull();
    expect(알림자리()?.textContent).toBe("");

    await act(async () => {
      (줄()[0].querySelector("button") as HTMLButtonElement).click();
    });
    expect(알림자리()?.textContent).toContain("남은 알림 2개");

    // **문구가 매번 바뀌어야 둘째 삭제부터도 읽힌다** — 같은 문자열이면 라이브 영역의
    // 내용이 안 바뀌어서 낭독기가 아무 말도 안 한다
    await act(async () => {
      (줄()[0].querySelector("button") as HTMLButtonElement).click();
    });
    expect(알림자리()?.textContent).toContain("남은 알림 1개");
  });

  it("닫았다 열면 지난번에 지운 말이 남아 있지 않다", async () => {
    await 그리기();
    await 열기();

    await act(async () => {
      (줄()[0].querySelector("button") as HTMLButtonElement).click();
    });
    expect(container.querySelector('[role="status"]')?.textContent).toContain("남은 알림");

    await act(async () => {
      종().click(); // 닫는다
    });
    await 열기();

    // 안 비우면 지금 목록과 아무 상관 없는 옛 수가 라이브 영역에 담긴 채로 뜬다
    expect(container.querySelector('[role="status"]')?.textContent).toBe("");
  });
});

describe("남이 쓴 글자와 제품이 쓴 글자 (design-rules.md 2026-09-09)", () => {
  // 목록의 첫 줄은 `participation_requested` 라 꼬리말이 「에 새 참가 신청이 왔습니다」다.
  const 문장 = () => 줄()[0].querySelector("p") as HTMLParagraphElement;
  const 이름 = () => 줄()[0].querySelector("bdi") as HTMLElement;

  it("제목은 낫표 안에 있고, 낫표는 굵게 밖에 있다", async () => {
    await 그리기();
    await 열기();

    expect(이름().textContent).toBe("토익 900 뿌시기");
    expect(문장().textContent).toBe("「토익 900 뿌시기」에 새 참가 신청이 왔습니다");

    // **글자만 보면 안 된다.** 낫표를 이름과 같은 클래스로 감싸도 위 두 단언은 그대로
    // 통과하는데, 그러면 낫표가 이름과 같은 무게·색이 되고 「누를 수 없는 줄」의 취소선도
    // 낫표까지 번진다. 그래서 노드로 본다 (2026-09-09 test-auditor).
    expect(문장().firstChild?.nodeType).toBe(Node.TEXT_NODE);
    expect(문장().firstChild?.textContent).toBe("「");
    expect(이름().nextSibling?.textContent).toBe("」");
    // 이름 말고 다른 요소로 감싼 것이 없다
    expect(문장().querySelectorAll("*").length).toBe(1);
    // 이름이 `.name` 을 잃으면 취소선 규칙이 조용히 사라진다
    expect(이름().className).toBe(줄()[1].querySelector("bdi")?.className);
  });

  // INV-T3 (S7) — `docs/specs/text-display-integrity.md`
  it("INV-T3 (S7): 제목은 방향 격리 안에 있다 — 서식 문자가 낫표 경계를 못 넘는다", async () => {
    await 그리기();
    await 열기();

    // **`<bdi>` 는 기본이 `unicode-bidi: isolate` 라서, 제목 안의 서식 문자가 만든 방향
    // 계산이 그 요소에서 닫힌다.** 안 감싸면 U+202E 하나가 문단 끝까지 가서 시각 순서가
    // 「꼬리말」제목 으로 뒤집힌다 — 2026-09-11 에 Chromium 에서 재서 확인했다.
    //
    // **여기서 재는 것은 태그뿐이다.** jsdom 은 배치를 안 하므로 뒤집힘 자체를 못 본다.
    // 뒤집힘을 실제로 본 것은 브라우저 측정이고, 그 측정이 이 태그를 고른 근거다.
    // 그래서 이 검사는 「그 근거가 코드에서 안 사라졌나」를 붙든다.
    expect(이름().tagName).toBe("BDI");

    // **INV-T2 가 있는데도 이것이 따로 필요한 이유**: 알림의 제목은 사건 시점의 사본이라
    // (0002 의 트리거) 0022 의 제약이 생기기 전에 복사된 행은 원본을 고쳐도 안 바뀐다.
    const RLO = String.fromCodePoint(0x202e);
    액션.load.mockResolvedValueOnce({
      ok: true,
      value: [{ ...목록[0], title: `${RLO}토익 900` }],
    });
    await 그리기();
    await 열기();
    expect(이름().tagName).toBe("BDI");
    expect(이름().textContent).toBe(`${RLO}토익 900`);
  });

  // INV-T3 (S7, CSS 쪽 절반) — `docs/specs/text-display-integrity.md`
  it("INV-T3 (S7): 방향 격리가 CSS 한 줄로 꺼져 있지 않다", async () => {
    // **위 검사는 태그만 본다.** 태그가 `<bdi>` 그대로여도 저자 스타일이 `unicode-bidi` 를
    // 건드리면 격리가 꺼지고, 브라우저에서는 `<b>` 였을 때와 똑같이 낫표 경계가 뒤집힌다.
    // 그런데 **jsdom 은 배치를 안 하므로 그리는 검사로는 원리상 못 잡는다**
    // (2026-09-11 test-auditor). 그래서 규칙 본문을 읽는다.
    //
    // `<bdi>` 의 격리는 사용자 에이전트 스타일시트의 `unicode-bidi: isolate` 가 준다.
    // 저자 스타일이 그 속성을 건드리면 그것이 이긴다.
    //
    // **보는 범위가 세 번 넓어졌다**(같은 감사):
    //   `1` 파일 하나가 아니라 `src` 아래 CSS 전부 — 다른 파일에 `bdi { ... }` 를 적으면
    //       알림 줄의 그 요소도 맞는다
    //   `2` `.name` 이 든 고르개뿐 아니라 **`bdi` 요소를 맞히는 고르개**도
    //   `3` 금지 속성에 `all` 을 더한다 — `all: unset` 한 줄이 `unicode-bidi` 를
    //       `normal` 로 되돌리는데 속성 이름이 안 보인다
    //
    // **부모 쪽 `direction` 은 여기서 안 본다.** 격리 요소의 방향을 바깥이 정하는 것은
    // 정상 동작이고(`<bdi>` 는 자기 **안**의 계산을 닫는다), 금지하면 화면 전체를 RTL 로
    // 만드는 정상 기능이 막힌다. 여기서 막는 것은 **격리 자체를 끄는 선언**이다.
    const { readFileSync, readdirSync } = await import("node:fs");
    const { join } = await import("node:path");

    const CSS파일들: string[] = [];
    const 훑는다 = (디렉터리: string) => {
      for (const e of readdirSync(디렉터리, { withFileTypes: true })) {
        const 경로 = join(디렉터리, e.name);
        if (e.isDirectory()) 훑는다(경로);
        else if (e.name.endsWith(".css")) CSS파일들.push(경로);
      }
    };
    훑는다("src");

    // **파일이 0건이면 이 검사는 아무것도 안 보고 초록불이 된다.** 그 상태와
    // 「위반이 0건이다」는 겉이 같다.
    expect(CSS파일들.length, "CSS 파일을 하나도 못 찾았다 — 이 검사가 아무것도 안 보고 있다").toBeGreaterThan(3);

    const 걸린것: string[] = [];
    let 본규칙수 = 0;

    for (const 파일 of CSS파일들) {
      // 주석을 먼저 지운다 — 설명 문장에 든 속성 이름을 규칙으로 읽으면 안 된다.
      const 본문 = readFileSync(파일, "utf-8").replace(/\/\*[\s\S]*?\*\//g, "");

      for (const [, 고르개, 선언] of 본문.matchAll(/([^{}]*)\{([^{}]*)\}/g)) {
        // `.name` 을 담은 고르개(`.dead .name` 처럼 앞에 붙은 것도 같은 요소를 맞힌다)
        // 또는 `bdi` 요소를 맞히는 고르개.
        const 맞히나 =
          /(^|[\s,>+~])\.name(?![\w-])/.test(고르개) || /(^|[\s,>+~(])bdi(?![\w-])/.test(고르개);
        if (!맞히나) continue;

        본규칙수 += 1;
        const 나쁜속성 = 선언.match(/(^|[\s;])(unicode-bidi|all)\s*:/);
        if (나쁜속성) {
          걸린것.push(`${파일} — ${고르개.trim()} 에 ${나쁜속성[2]} 선언이 있다`);
        }
      }
    }

    expect(본규칙수, "`.name` 도 `bdi` 도 맞히는 규칙을 하나도 못 찾았다").toBeGreaterThan(0);
    expect(걸린것, "방향 격리를 끄는 선언이 있다").toEqual([]);
  });

  it("제목이 제품 안내문을 흉내 내도 어디까지가 남의 글자인지 보인다", async () => {
    액션.load.mockResolvedValueOnce({
      ok: true,
      value: [{ ...목록[0], title: "[안내] 계정 확인이 필요합니다" }],
    });
    await 그리기();
    await 열기();

    // 낫표가 없으면 「[안내] 계정 확인이 필요합니다에 새 참가 신청이 왔습니다」가 되어
    // 앞 문장이 제품이 보낸 안내처럼 읽힌다 (2026-09-08 security-reviewer).
    expect(문장().textContent).toBe("「[안내] 계정 확인이 필요합니다」에 새 참가 신청이 왔습니다");
  });

  // **제목 안에 낫표를 넣어 두름을 흉내 내는 경우.** 안 읽은 줄에서는 제품 낫표(600)와
  // 제목 안 낫표(700)가 눈으로 안 갈리므로, 화면이 안쪽 기호를 겹낫표로 바꿔야 한다
  // (2026-09-09 security-reviewer · ui-reviewer 가 같은 자리를 지적했다).
  it("제목 안의 낫표는 겹낫표로 바뀌어 제품이 그린 낫표와 안 겹친다", async () => {
    액션.load.mockResolvedValueOnce({
      ok: true,
      value: [{ ...목록[0], title: "모임」 참가가 수락되었습니다. 「스터디" }],
    });
    await 그리기();
    await 열기();

    expect(문장().textContent).toBe(
      "「모임』 참가가 수락되었습니다. 『스터디」에 새 참가 신청이 왔습니다",
    );
    // 제품이 그린 낫표는 문장 전체에 딱 두 개다
    expect((문장().textContent?.match(/[「」]/g) ?? []).length).toBe(2);
  });

  // **자르지 않는 것이 이 결정의 반대 절반이다.** 길이는 값이 들어오는 자리에서 막았고
  // (`studies_title_length`), 화면은 저장된 값을 그대로 그린다(INV-N6).
  it("상한만큼 긴 제목도 화면에서 안 잘린다", async () => {
    const 긴제목 = "가".repeat(60);
    액션.load.mockResolvedValueOnce({ ok: true, value: [{ ...목록[0], title: 긴제목 }] });
    await 그리기();
    await 열기();

    expect(이름().textContent).toBe(긴제목);
    expect(문장().textContent).toBe(`「${긴제목}」에 새 참가 신청이 왔습니다`);
  });

  it("삭제 단추의 이름도 같은 문장을 쓴다", async () => {
    await 그리기();
    await 열기();

    // 눈으로 보이는 문장과 낭독기가 읽는 이름이 갈리면, 지우기 전에 무엇을 지우는지
    // 확인하는 두 경로가 서로 다른 것을 말한다.
    const 삭제 = 줄()[0].querySelector("button") as HTMLButtonElement;
    expect(삭제.getAttribute("aria-label")).toBe(
      "알림 삭제: 「토익 900 뿌시기」에 새 참가 신청이 왔습니다",
    );

    // 누를 수 없는 줄도 같은 조립을 지난다 — 갈래를 따로 두면 한쪽만 고쳐진다
    const 죽은줄삭제 = 줄()[1].querySelector("button") as HTMLButtonElement;
    expect(죽은줄삭제.getAttribute("aria-label")).toBe(
      "알림 삭제: 「알고리즘 스터디」 참가가 수락되었습니다",
    );
  });
});
