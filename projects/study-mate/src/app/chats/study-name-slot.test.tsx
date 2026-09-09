/**
 * 채팅 화면에서 스터디 이름이 들어가는 칸 둘 — 목록의 이름표와 방 안의 제목.
 *
 * **이 파일이 붙드는 것은 글자가 아니라 모양이다.** 호스트가 스터디 이름을
 * 「지워진 스터디」로 지을 수 있으므로(제목은 60자, 공백·제어문자만 거른다), 글자만
 * 비교하는 검사는 두 경우를 못 가른다. 사용자가 만들 수 있는 것은 글자뿐이라 모양이
 * 판정 기준이 된다 — 시각 기준 「이름 칸에 제품이 들어가면 이름의 모양을 벗는다」.
 */
import { act, createElement, type FunctionComponent } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it } from "vitest";
import type { ChatStudy } from "@/entities/chat";
import { DELETED_STUDY } from "./copy";
import { StudyChip } from "./StudyChip";
import { StudyHeading } from "./StudyHeading";

const 살아있음: ChatStudy = {
  available: true,
  id: "55555555-5555-4555-8555-555555555555",
  title: "토익 새벽반",
  categoryId: "language",
  memberCount: 4,
};
const 안보임: ChatStudy = { available: false, id: "55555555-5555-4555-8555-555555555555" };

const 뿌리: Root[] = [];

function 그리기(
  study: ChatStudy,
  무엇: FunctionComponent<{ study: ChatStudy }> = StudyChip,
): HTMLElement {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  뿌리.push(root);
  act(() => {
    root.render(createElement(무엇, { study }));
  });
  const el = container.firstElementChild;
  if (!(el instanceof HTMLElement)) throw new Error("이름 칸이 아무것도 안 그렸다");
  return el;
}

afterEach(() => {
  for (const root of 뿌리.splice(0)) act(() => root.unmount());
  document.body.replaceChildren();
});

/**
 * 형광펜 칩인가 — `Tag` 는 채울 색을 인라인 사용자 정의 속성으로 싣는다.
 *
 * **하위까지 본다.** 루트만 보면 `<span class={gone}><Tag …/></span>` 처럼 한 겹 두른
 * 변이가 화면상 완전한 칩인데도 통과한다 (2026-09-09 test-auditor).
 */
function 형광펜(el: HTMLElement): string {
  if (el.style.getPropertyValue("--fill")) return el.style.getPropertyValue("--fill");
  const 안쪽 = el.querySelector<HTMLElement>('[style*="--fill"]');
  return 안쪽?.style.getPropertyValue("--fill") ?? "";
}

/**
 * 인라인으로 채운 자리가 있나 — `--fill` 말고 다른 이름으로 칠하는 변이를 잡는다.
 * (CSS 모듈은 vitest 가 처리하지 않으므로 `.gone` 자체에 배경을 넣는 변이는 이 검사
 * 밖이다. 그 사실은 사인오프에 적었다.)
 */
function 인라인채움(el: HTMLElement): string[] {
  return [el, ...el.querySelectorAll<HTMLElement>("*")]
    .flatMap((e) => [e.style.background, e.style.backgroundColor, e.style.padding, e.style.border])
    .filter((v) => v !== "");
}

describe("채팅 화면의 스터디 이름표", () => {
  it("스터디 이름은 형광펜 칩이고, 색은 그 갈래의 색이다", () => {
    expect(형광펜(그리기(살아있음))).toBe("var(--hl-lavender)");
    // 갈래마다 다른 색이어야 한다 — 한 색을 상수로 박는 변이를 잡는다.
    expect(형광펜(그리기({ ...살아있음, categoryId: "cert" }))).toBe("var(--hl-yellow)");
  });

  it("스터디가 안 보이면 칩이 아니다 — 대체 색을 꾸며 내지 않는다", () => {
    const 말 = 그리기(안보임);

    expect(말.textContent).toBe(DELETED_STUDY);
    expect(형광펜(말)).toBe("");
    expect(인라인채움(말)).toEqual([]);
  });

  it("이름을 「지워진 스터디」로 지어도 칩은 그대로다 — 두 경우가 모양에서 갈린다", () => {
    const 흉내 = 그리기({ ...살아있음, title: DELETED_STUDY });
    const 진짜 = 그리기(안보임);

    // 글자는 같다 — 그래서 글자만 보는 검사로는 못 가른다.
    expect(흉내.textContent).toBe(진짜.textContent);
    // 모양이 다르다: 하나는 형광펜이 칠해진 칩, 하나는 아무 채움도 없는 글자.
    expect(형광펜(흉내)).toBe("var(--hl-lavender)");
    expect(형광펜(진짜)).toBe("");
    expect(인라인채움(진짜)).toEqual([]);
  });
});

describe("채팅방 화면의 제목", () => {
  it("스터디 이름은 주아체다 — 「보는 텍스트」인 페이지 제목의 글꼴", () => {
    const 이름 = 그리기(살아있음, StudyHeading);

    expect(이름.tagName).toBe("H1");
    expect(이름.textContent).toBe("토익 새벽반");
    expect(이름.className).toContain("h-display");
  });

  it("스터디가 안 보이면 주아체를 안 쓴다", () => {
    const 말 = 그리기(안보임, StudyHeading);

    expect(말.textContent).toBe(DELETED_STUDY);
    expect(말.className).not.toContain("h-display");
  });

  it("이름을 「지워진 스터디」로 지어도 글꼴이 갈린다", () => {
    const 흉내 = 그리기({ ...살아있음, title: DELETED_STUDY }, StudyHeading);
    const 진짜 = 그리기(안보임, StudyHeading);

    expect(흉내.textContent).toBe(진짜.textContent);
    expect(흉내.className).toContain("h-display");
    expect(진짜.className).not.toContain("h-display");
  });
});
