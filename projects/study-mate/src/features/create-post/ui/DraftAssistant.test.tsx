/**
 * 스펙: docs/specs/ai-assist.md — INV-G9
 *
 * **「적용」이 유일한 문이라 검사가 있어야 한다.** 초안이 도착하는 순간 폼을 채우도록
 * 한 줄만 바꾸면 화면은 더 편해 보이고 아무 검사도 안 깨진다 — 그런데 그 순간부터
 * 사용자가 안 읽은 문장이 사용자 이름으로 발행될 수 있다.
 *
 * **모킹하는 것은 이웃(서버 액션)이지 검증 대상(도우미)이 아니다.** 액션 파일은
 * `"use server"` 라 `next/headers` 를 끌고 오므로 이 환경에서 못 부른다.
 */
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ActionResult } from "@/shared/lib/action-result";
import type { PostDraft } from "../model/draft";

const DRAFT: PostDraft = {
  title: "모델이 쓴 제목",
  summary: "모델이 쓴 한 줄",
  content: "모델이 쓴 본문",
};

let reply: ActionResult<PostDraft> = { ok: true, value: DRAFT };
const action = vi.fn(async () => reply);
vi.mock("../api/draft-post", () => ({ draftPostAction: action }));

const { DraftAssistant } = await import("./DraftAssistant");

const STUDY = "11111111-1111-4111-8111-111111111111";

let container: HTMLDivElement;
let root: Root;
let applied: PostDraft[];

function mount(studyId = STUDY) {
  applied = [];
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  act(() => {
    root.render(<DraftAssistant studyId={studyId} onApply={(d) => applied.push(d)} />);
  });
}

beforeEach(() => {
  reply = { ok: true, value: DRAFT };
  action.mockClear();
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

const 버튼 = (label: string) =>
  [...container.querySelectorAll("button")].find((b) => b.textContent?.includes(label));

async function 초안받기() {
  await act(async () => {
    버튼("초안 만들기")?.click();
  });
}

describe("INV-G9: 초안은 「적용」 전에는 폼의 값이 아니다", () => {
  it("INV-G9 (실패경로): 초안이 도착해도 적용을 안 누르면 폼에 아무것도 안 간다", async () => {
    mount();
    await 초안받기();

    // 미리보기에는 나와 있다 — 도착 자체는 됐다는 것을 먼저 보인다.
    expect(container.textContent).toContain("모델이 쓴 제목");
    // 그런데 폼으로는 한 번도 안 갔다.
    expect(applied).toEqual([]);
  });

  it("INV-G9 (반대 절반): 적용을 누르면 그때 폼으로 간다", async () => {
    // 이게 없으면 `onApply` 를 아예 안 부르게 만들어도 위 검사가 통과한다.
    mount();
    await 초안받기();
    await act(async () => {
      버튼("적용")?.click();
    });
    expect(applied).toEqual([DRAFT]);
  });

  it("INV-G9: 버리면 미리보기가 사라지고 폼에는 여전히 안 간다", async () => {
    mount();
    await 초안받기();
    await act(async () => {
      버튼("버리기")?.click();
    });
    expect(container.textContent).not.toContain("모델이 쓴 제목");
    expect(applied).toEqual([]);
  });

  it("INV-G9: 적용한 뒤에는 미리보기가 닫힌다 — 같은 초안을 두 번 넣지 않게", async () => {
    mount();
    await 초안받기();
    await act(async () => {
      버튼("적용")?.click();
    });
    expect(버튼("적용")).toBeUndefined();
  });

  it("INV-G9 (실패경로): 모델을 못 썼으면 미리보기가 없고 문구만 나온다", async () => {
    reply = { ok: false, message: "지금은 초안을 만들지 못했습니다. 잠시 뒤 다시 시도해 주세요." };
    mount();
    await 초안받기();

    expect(container.textContent).toContain("잠시 뒤 다시 시도해");
    expect(버튼("적용")).toBeUndefined();
    expect(applied).toEqual([]);
  });

  it("INV-G8: 스터디를 안 골랐으면 요청 자체가 안 나간다", async () => {
    // 고른 스터디가 없으면 보낼 근거가 없다. 서버도 막지만 여기서 먼저 막는다.
    mount("");
    await 초안받기();
    expect(action).not.toHaveBeenCalled();
  });

  it("INV-G8: 스터디를 골랐으면 그 id 로 요청한다", async () => {
    mount();
    await 초안받기();
    expect(action).toHaveBeenCalledWith(STUDY);
  });

  it("INV-G9: 도착 소식은 살아 있는 영역의 **한 줄**로만 간다", async () => {
    // 미리보기 전체를 감싸면 초안이 도착할 때 내용 4000자가 통째로 읽힌다
    // (2026-09-10 ui-reviewer). 이 앱의 다른 살아 있는 영역도 한 문장씩만 진다.
    mount();
    const live = container.querySelector('[role="status"]');
    expect(live).not.toBeNull();
    expect(live?.textContent).toBe("");

    await 초안받기();
    expect(live?.textContent).toContain("아직 폼에 안 들어갔습니다");
    // 미리보기 본문은 그 영역 밖이다
    expect(live?.textContent).not.toContain("모델이 쓴 본문");
  });

  it("INV-G9 (실패경로): 실패 문구는 끼어드는 자리로 간다", async () => {
    // 사용자가 한 행동이 실패한 것이라 `polite` 로는 부족하다.
    reply = { ok: false, message: "지금은 초안을 만들지 못했습니다. 잠시 뒤 다시 시도해 주세요." };
    mount();
    await 초안받기();
    const alert = container.querySelector('[role="alert"]');
    expect(alert?.textContent).toContain("잠시 뒤 다시 시도해");
    // 살아 있는 영역 안에 있으면 두 번 읽힌다
    expect(container.querySelector('[role="status"]')?.contains(alert ?? null)).toBe(false);
  });

  it("INV-G9: 적용하면 초점이 사라지지 않는다 — 부르는 쪽이 옮길 수 있게 알린다", async () => {
    // 「적용」 버튼 자신이 사라지므로, 안 옮기면 초점이 문서 맨 앞으로 떨어진다.
    // 도우미는 폼 칸을 모르므로 옮기는 것은 `onApply` 를 받은 쪽 몫이다 —
    // 여기서 붙드는 것은 그 알림이 실제로 간다는 것이다.
    mount();
    await 초안받기();
    await act(async () => {
      버튼("적용")?.click();
    });
    expect(applied).toHaveLength(1);
  });

  it("INV-G9: 버리면 초점이 「초안 만들기」로 돌아온다", async () => {
    mount();
    await 초안받기();
    await act(async () => {
      버튼("버리기")?.click();
    });
    expect(document.activeElement).toBe(버튼("초안 만들기"));
  });

  it("한 패널에 잉크 버튼을 둘 두지 않는다 — 「적용」은 테두리 톤이다", async () => {
    // 같은 카드 안의 「모집글 올리기」가 이미 잉크다(승인된 시각 기준).
    mount();
    await 초안받기();
    expect(버튼("적용")?.className).not.toContain("ink");
  });
});
