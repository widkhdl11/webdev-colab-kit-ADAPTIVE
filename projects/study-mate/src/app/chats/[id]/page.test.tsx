/**
 * 채팅방 화면.
 *
 * 목록 쪽 검사(`../page.test.tsx`)와 같은 것을 붙든다 — **페이지가 이름 칸을 컴포넌트에
 * 맡기는가.** 모양은 `../study-name-slot.test.tsx` 가 본다.
 *
 * 이 화면에는 이름 칸이 셋이다(빵부스러기 · 제목 · 탭 제목). 제목은 컴포넌트가 갖고,
 * 탭 제목은 못 갈랐다(시각 기준 「안 풀린 자리」).
 *
 * **빵부스러기에서 규칙이 정한 판정 기준은 잉크색인데 이 파일은 그것을 못 본다** — 색은
 * CSS 라 vitest 가 안 읽는다. 여기서 보는 것은 「404 로 가는 링크를 안 준다」쪽이고,
 * 색은 브라우저에서 재서 결정 로그에 남겼다 (2026-09-09 test-auditor).
 */
import Link from "next/link";
import type { ReactElement, ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ChatRoomPage, ChatStudy } from "@/entities/chat";

let 방: ChatRoomPage | null = null;

vi.mock("@/entities/chat", () => ({ readChatRoom: async () => 방 }));
vi.mock("@/entities/notification", () => ({ readUnreadNotificationCount: async () => 0 }));
vi.mock("@/entities/session", () => ({
  currentUser: async () => ({ id: "11111111-1111-4111-8111-111111111111" }),
}));
vi.mock("@/features/chat", () => ({ ChatRoomView: () => null, markChatRead: async () => undefined }));
vi.mock("@/widgets/site-header", () => ({ SiteHeader: () => null }));
vi.mock("@/widgets/site-footer", () => ({ SiteFooter: () => null }));
vi.mock("next/navigation", () => ({
  notFound: () => {
    throw new Error("notFound");
  },
}));

const { default: ChatRoomPageView, generateMetadata } = await import("./page");
const { StudyHeading } = await import("../StudyHeading");
const { DELETED_STUDY } = await import("../copy");

const 살아있음: ChatStudy = {
  available: true,
  id: "55555555-5555-4555-8555-555555555555",
  title: "토익 새벽반",
  categoryId: "language",
  memberCount: 4,
};
const 안보임: ChatStudy = { available: false, id: "55555555-5555-4555-8555-555555555555" };

function 모두(node: ReactNode, 담기: (el: ReactElement) => void): void {
  if (Array.isArray(node)) {
    for (const n of node) 모두(n, 담기);
    return;
  }
  if (!node || typeof node !== "object" || !("type" in node)) return;
  const el = node as ReactElement<{ children?: ReactNode }>;
  담기(el);
  모두(el.props?.children, 담기);
}

function 글자(node: ReactNode): string {
  if (typeof node === "string") return node;
  if (Array.isArray(node)) return node.map(글자).join("");
  if (!node || typeof node !== "object" || !("type" in node)) return "";
  const el = node as ReactElement<{ children?: ReactNode }>;
  return 글자(el.props?.children);
}

function 찾기(node: ReactNode, 맞나: (el: ReactElement) => boolean): ReactElement | null {
  let 찾은: ReactElement | null = null;
  모두(node, (el) => {
    if (찾은 === null && 맞나(el)) 찾은 = el;
  });
  return 찾은;
}

async function 그리기(study: ChatStudy) {
  방 = { id: "c1", study, messages: [] };
  return await ChatRoomPageView({ params: Promise.resolve({ id: "c1" }) });
}

beforeEach(() => {
  방 = null;
});

describe("채팅방 화면 — 이름 칸", () => {
  it("제목은 StudyHeading 이 그린다", async () => {
    const 화면 = await 그리기(살아있음);

    const 제목 = 찾기(화면, (el) => el.type === StudyHeading);
    expect((제목?.props as { study: ChatStudy }).study).toEqual(살아있음);
  });

  it("안 보이는 스터디도 같은 컴포넌트를 지난다 — 페이지가 h1 을 직접 그리지 않는다", async () => {
    const 화면 = await 그리기(안보임);

    expect((찾기(화면, (el) => el.type === StudyHeading)?.props as { study: ChatStudy }).study).toEqual(
      안보임,
    );
    expect(찾기(화면, (el) => el.type === "h1")).toBeNull();
  });

  it("빵부스러기: 이름은 링크, 제품이 쓴 말은 링크가 아니다", async () => {
    // 종류(`Link`)와 소재(`a`)를 둘 다 보고, 글자는 한 겹 감싸도 잡히게 훑는다.
    const 링크인가 = (el: ReactElement) => el.type === Link || el.type === "a";

    const 산것 = await 그리기(살아있음);
    expect(찾기(산것, (el) => 링크인가(el) && 글자(el) === "토익 새벽반")).not.toBeNull();

    const 지운것 = await 그리기(안보임);
    // 열리지 않는 곳으로 가는 링크를 주지 않는다 — 누르면 404 다.
    expect(찾기(지운것, (el) => 링크인가(el) && 글자(el) === DELETED_STUDY)).toBeNull();
    // 훑기가 그 자리까지 실제로 닿았다는 증거 — 없으면 위 단언이 공짜로 통과한다.
    expect(글자(지운것)).toContain(DELETED_STUDY);
  });

  it("탭 제목은 두 경우가 같다 — 못 갈랐다는 사실을 검사로 고정한다", async () => {
    // 시각 기준 「안 풀린 자리 — 브라우저 탭 제목」. 이 단언이 깨지는 날은 누군가
    // 그 자리를 고친 날이므로, 그때 문서의 「안 풀린 자리」도 같이 고쳐야 한다.
    // 먼저 탭 제목이 **살아 있는 이름을 실제로 싣는다**는 것을 본다. 이게 없으면
    // 「둘 다 상수로 바꾼다」는 변이도 「같다」를 만족시킨다.
    방 = { id: "c1", study: 살아있음, messages: [] };
    expect((await generateMetadata({ params: Promise.resolve({ id: "c1" }) })).title).toBe(
      "토익 새벽반 채팅 — Study Mate",
    );

    방 = { id: "c1", study: { ...살아있음, title: DELETED_STUDY }, messages: [] };
    const 흉내 = await generateMetadata({ params: Promise.resolve({ id: "c1" }) });
    방 = { id: "c1", study: 안보임, messages: [] };
    const 진짜 = await generateMetadata({ params: Promise.resolve({ id: "c1" }) });

    expect(흉내.title).toBe(진짜.title);
  });
});
