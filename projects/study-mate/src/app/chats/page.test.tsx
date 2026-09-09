/**
 * 채팅방 목록 화면.
 *
 * **이 검사가 붙드는 것은 모양이 아니라 위임이다.** 모양은
 * `study-name-slot.test.tsx` 가 컴포넌트를 직접 불러서 본다. 그런데 페이지가
 * `<StudyChip>` 을 지우고 `<Tag>{DELETED_STUDY}</Tag>` 로 되돌리면 그 검사는 전부
 * 초록불이다 — 붙드는 것이 없는 자리가 정확히 여기였다(2026-09-09 code-reviewer).
 *
 * **서버 컴포넌트는 그냥 async 함수라서 렌더 없이 부를 수 있다.** 자식은 호출되지 않으므로
 * `SiteHeader`·`Container` 를 모킹할 필요가 없고, 페이지가 직접 부르는 셋만 가로챈다.
 */
import type { ReactElement, ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";
import type { ChatRoom, ChatStudy } from "@/entities/chat";
import { CardBody } from "@/shared/ui/card/Card";
import { Tag } from "@/shared/ui/tag/Tag";

const 방들: ChatRoom[] = [];

vi.mock("@/entities/chat", async () => {
  const 실제 = await import("@/entities/chat/api/read-chats");
  return { ...실제, readMyChats: async () => 방들 };
});
vi.mock("@/entities/notification", () => ({ readUnreadNotificationCount: async () => 0 }));
// 헤더·푸터는 서버 액션(`"use server"`)을 끌고 와서 이 환경에서 못 불린다. 이 검사가 보는
// 것은 카드 안이므로 자리만 채운다 — 검증 대상이 아니라 이웃이다.
vi.mock("@/widgets/site-header", () => ({ SiteHeader: () => null }));
vi.mock("@/widgets/site-footer", () => ({ SiteFooter: () => null }));
vi.mock("@/entities/session", () => ({
  currentUser: async () => ({ id: "11111111-1111-4111-8111-111111111111" }),
}));

const { default: ChatsPage } = await import("./page");
const { StudyChip } = await import("./StudyChip");
const { DELETED_STUDY } = await import("./copy");
const styles = (await import("./page.module.css")).default;

const 살아있음: ChatStudy = {
  available: true,
  id: "55555555-5555-4555-8555-555555555555",
  title: "토익 새벽반",
  categoryId: "language",
  memberCount: 4,
};

function 방(study: ChatStudy, 덮어쓸: Partial<ChatRoom> = {}): ChatRoom {
  return {
    id: "c1",
    study,
    lastMessage: null,
    lastMessageAt: null,
    unread: 0,
    ...덮어쓸,
  };
}

/** 엘리먼트 트리를 재귀로 훑는다. 서버 컴포넌트는 안 불렸으므로 트리가 곧 소스다. */
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

function 찾기(node: ReactNode, 맞나: (el: ReactElement) => boolean): ReactElement | null {
  let 찾은: ReactElement | null = null;
  모두(node, (el) => {
    if (찾은 === null && 맞나(el)) 찾은 = el;
  });
  return 찾은;
}

function 글자(node: ReactNode): string {
  if (typeof node === "string") return node;
  if (Array.isArray(node)) return node.map(글자).join("");
  if (!node || typeof node !== "object" || !("type" in node)) return "";
  const el = node as ReactElement<{ children?: ReactNode }>;
  return 글자(el.props?.children);
}

/** 트리 안의 숫자 노드들. `글자()` 가 버리는 값이라 따로 모은다. */
function 숫자(node: ReactNode): number[] {
  if (typeof node === "number") return [node];
  if (Array.isArray(node)) return node.flatMap(숫자);
  if (!node || typeof node !== "object" || !("type" in node)) return [];
  const el = node as ReactElement<{ children?: ReactNode }>;
  return 숫자(el.props?.children);
}

async function 그리기(rooms: ChatRoom[]) {
  방들.splice(0, 방들.length, ...rooms);
  return await ChatsPage();
}

describe("채팅방 목록 화면 — 이름표를 컴포넌트에 맡긴다", () => {
  it("스터디 이름표는 StudyChip 이 그린다", async () => {
    const 화면 = await 그리기([방(살아있음)]);

    const 칩 = 찾기(화면, (el) => el.type === StudyChip);
    expect(칩).not.toBeNull();
    expect((칩?.props as { study: ChatStudy }).study).toEqual(살아있음);
  });

  it("안 보이는 스터디도 같은 컴포넌트를 지난다 — 페이지가 Tag 를 직접 쓰지 않는다", async () => {
    const 안보임: ChatStudy = { available: false, id: "s1" };
    const 화면 = await 그리기([방(안보임)]);

    expect((찾기(화면, (el) => el.type === StudyChip)?.props as { study: ChatStudy }).study).toEqual(
      안보임,
    );
    // 페이지가 형광펜 칩을 직접 그리면 이 단언이 깨진다.
    expect(찾기(화면, (el) => el.type === Tag)).toBeNull();
    // 그 글자가 컴포넌트 밖에 있으면 페이지가 문자열을 다시 박은 것이다.
    expect(글자(화면)).not.toContain(DELETED_STUDY);
    // 훑기가 카드 안까지 실제로 들어갔다는 증거 — 없으면 위 「없다」 둘이 공짜로 통과한다.
    expect(찾기(화면, (el) => el.type === CardBody)).not.toBeNull();
  });

  it("메시지도 없고 스터디도 안 보이면 메타 줄을 안 그린다 — 빈 `p` 만 남으면 여백만 남는다", async () => {
    const 화면 = await 그리기([방({ available: false, id: "s1" })]);

    // 낱말이 아니라 **줄의 부재**를 본다. 내용만 비우는 변이는 낱말 검사로 안 잡힌다.
    expect(찾기(화면, (el) => (el.props as { className?: string })?.className === styles.meta)).toBeNull();
    expect(찾기(화면, (el) => el.type === CardBody)).not.toBeNull();
  });

  it("반대 절반: 멤버 수가 있으면 그 숫자를 그린다", async () => {
    const 화면 = await 그리기([방(살아있음)]);

    const 메타 = 찾기(화면, (el) => (el.props as { className?: string })?.className === styles.meta);
    expect(메타).not.toBeNull();
    // **숫자를 본다.** `글자()` 는 문자열만 모으므로 「멤버 (빈칸)명」도 「멤버」를 포함한다 —
    // 인원수 검사를 빼는 변이가 그 상태를 만든다 (2026-09-09 test-auditor).
    expect(숫자(메타)).toEqual([4]);
  });
});
