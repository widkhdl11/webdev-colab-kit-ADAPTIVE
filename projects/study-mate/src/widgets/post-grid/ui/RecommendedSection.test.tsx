/**
 * 스펙: docs/specs/ai-assist.md — INV-G6
 *
 * **문구 함수는 검사가 있는데 화면이 그것을 쓴다는 사실은 없었다.** 문구를 이 자리에
 * 박아 넣거나 `sectionCopy("model")` 로 고정해도 전부 초록불이었다(2026-09-10 ui-reviewer ·
 * test-auditor). INV-G6 의 강제 위치 절반이 화면 쪽이라 여기서 붙든다.
 *
 * 대역으로 세우는 것은 **이웃**(데이터를 읽어 오는 배선)이지 검증 대상이 아니다.
 * 검증 대상인 구역은 실제로 그려진다.
 */
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { PostSummary } from "@/entities/post";
import type { RecommendOutcome } from "@/features/recommend-studies";

function post(id: string): PostSummary {
  return {
    id,
    title: `제목 ${id}`,
    summary: "한 줄 소개",
    createdAt: "2026-09-01T00:00:00.000Z",
    viewsCount: 0,
    likesCount: 0,
    study: {
      id: `s-${id}`,
      categoryId: "it",
      categoryName: "IT/개발",
      regionCode: "seoul",
      regionName: "서울",
      locationDetail: null,
      meetingMode: "online",
      capacity: 6,
      filled: 1,
      recruiting: true,
      recruitUntil: null,
      slots: [],
    },
  };
}

let outcome: RecommendOutcome = { kind: "rule", reason: "no-evidence", posts: [post("a")] };
// **배럴을 통째로 불러오면 안 된다** — 그것이 모델 제공자를 끌고 오고, 그 모듈은
// 서버 전용 표시 때문에 이 환경에서 던진다. 문구 함수는 검증 대상이라 진짜를 쓰고,
// 데이터를 읽어 오는 배선만 대역으로 바꾼다.
vi.mock("@/features/recommend-studies", async () => {
  const copy = await import("@/features/recommend-studies/model/section-copy");
  const limits = await import("@/features/recommend-studies/model/limits");
  return {
    sectionCopy: copy.sectionCopy,
    SECTION_TITLE: copy.SECTION_TITLE,
    PENDING_SUB: copy.PENDING_SUB,
    RECOMMENDATION_SHOWN: limits.RECOMMENDATION_SHOWN,
    recommendForHome: async () => outcome,
  };
});

const { RecommendedSection } = await import("./RecommendedSection");

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

/** 서버 컴포넌트라 약속을 돌려준다 — 풀릴 때까지 기다렸다가 그린다 */
async function render() {
  const tree = await RecommendedSection();
  await act(async () => root.render(tree));
}

describe("INV-G6: 화면 문구가 어느 경로였는지에 따라 갈린다", () => {
  it("INV-G6 (실패경로): 규칙 경로면 화면에 「추천」이 없다", async () => {
    outcome = { kind: "rule", reason: "no-evidence", posts: [post("a")] };
    await render();
    expect(container.textContent).not.toContain("추천");
  });

  it("INV-G6 (반대 절반): 모델 경로면 화면에 「추천」이 있다", async () => {
    // 이게 없으면 문구를 규칙 쪽으로 고정해도 위 검사가 통과한다.
    outcome = { kind: "model", reason: null, posts: [post("a")] };
    await render();
    expect(container.textContent).toContain("추천");
  });

  it("INV-G6: 두 경로의 제목은 같다 — 나중에 채워지는 구역이라 제목이 갈아 끼워지면 눈에 띈다", async () => {
    outcome = { kind: "rule", reason: "no-evidence", posts: [post("a")] };
    await render();
    const ruleTitle = container.querySelector("h2")?.textContent;

    act(() => root.unmount());
    root = createRoot(container);
    outcome = { kind: "model", reason: null, posts: [post("a")] };
    await render();
    expect(container.querySelector("h2")?.textContent).toBe(ruleTitle);
  });

  it("추천이 0건이면 구역을 안 그린다", async () => {
    outcome = { kind: "rule", reason: "no-candidates", posts: [] };
    await render();
    expect(container.textContent).toBe("");
  });
});
