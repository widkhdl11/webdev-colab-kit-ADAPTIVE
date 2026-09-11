import { describe, expect, it } from "vitest";
import type { PostSummary } from "@/entities/post";
import { ruleOrder } from "./fallback";

// 스펙: docs/specs/ai-assist.md — INV-G5 · G6
//
// 모델을 안 부르거나(근거 0) 못 쓸 때(지연·실패) 같은 자리를 채우는 규칙 순서.
// **모델 없이 정해지므로 언제나 같은 답이 나와야 한다** — 흔들리면 새로고침마다 순서가
// 바뀌어 사용자가 아까 본 것을 못 찾는다.

function post(id: string, likes: number, createdAt: string): PostSummary {
  return {
    id,
    title: `제목 ${id}`,
    summary: null,
    createdAt,
    viewsCount: 0,
    likesCount: likes,
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

const D1 = "2026-09-01T00:00:00.000Z";
const D2 = "2026-09-05T00:00:00.000Z";

describe("INV-G6: 근거가 없을 때 채우는 규칙 순서", () => {
  it("INV-G6: 좋아요가 많은 것이 앞에 온다", () => {
    const out = ruleOrder([post("a", 1, D1), post("b", 9, D1)]);
    expect(out.map((p) => p.id)).toEqual(["b", "a"]);
  });

  it("INV-G6: 좋아요가 같으면 최근에 열린 것이 앞에 온다", () => {
    const out = ruleOrder([post("a", 3, D1), post("b", 3, D2)]);
    expect(out.map((p) => p.id)).toEqual(["b", "a"]);
  });

  it("INV-G6: 좋아요와 시각이 같으면 id 로 가른다 — 같은 입력에 같은 답", () => {
    // 여기가 없으면 순서가 정렬 구현에 따라 흔들린다.
    const out = ruleOrder([post("b", 3, D1), post("a", 3, D1)]);
    expect(out.map((p) => p.id)).toEqual(["a", "b"]);
  });

  it("INV-G6: 넣은 배열을 안 고친다", () => {
    const list = [post("a", 1, D1), post("b", 9, D1)];
    ruleOrder(list);
    expect(list.map((p) => p.id)).toEqual(["a", "b"]);
  });

  it("INV-G5: 후보가 없으면 빈 결과다", () => {
    expect(ruleOrder([])).toEqual([]);
  });
});
