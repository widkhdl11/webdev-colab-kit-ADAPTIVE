import { describe, expect, it } from "vitest";
import {
  assignGate,
  computeIssueScore,
  GATE_ONE,
  placeArticle,
} from "./hot-issue";

const HOUR = 3600_000;
const NOW = new Date("2026-09-20T12:00:00.000Z");
const iso = (hoursAgo: number) => new Date(NOW.getTime() - hoursAgo * HOUR).toISOString();

describe("computeIssueScore — INV-N3 이슈성은 모델을 안 거친다", () => {
  it("INV-N3: 같은 항목을 두 번 재면 같은 값이다 (S35 — 모델 호출이 없다)", () => {
    const args = { crossPublisherCount: 1, weight: 1.3, publishedAt: iso(5), now: NOW };
    expect(computeIssueScore(args)).toBe(computeIssueScore(args));
    expect(computeIssueScore(args)).toBe(computeIssueScore({ ...args }));
  });

  it("INV-N3: 세 항이 전부 값에 반영된다 — 하나를 키우면 값이 커진다", () => {
    const base = { crossPublisherCount: 1, weight: 1.0, publishedAt: iso(10), now: NOW };
    // 교차 발행처 수
    expect(computeIssueScore({ ...base, crossPublisherCount: 3 })).toBeGreaterThan(
      computeIssueScore(base),
    );
    // 소스 weight
    expect(computeIssueScore({ ...base, weight: 1.6 })).toBeGreaterThan(computeIssueScore(base));
    // 시간감쇠 — 더 최근이면 크다
    expect(computeIssueScore({ ...base, publishedAt: iso(1) })).toBeGreaterThan(
      computeIssueScore(base),
    );
  });

  it("INV-N3: 교차 발행처 수가 1 이어도 그 항이 식에 남아 있다 (곱이 0 이 되지 않는다)", () => {
    const one = computeIssueScore({
      crossPublisherCount: 1,
      weight: 1.0,
      publishedAt: iso(0),
      now: NOW,
    });
    const two = computeIssueScore({
      crossPublisherCount: 2,
      weight: 1.0,
      publishedAt: iso(0),
      now: NOW,
    });
    expect(one).toBeGreaterThan(0);
    // 항이 살아 있으면 2배다. 식에서 빠졌다면 둘이 같아진다.
    expect(two).toBeCloseTo(one * 2, 10);
  });

  it("INV-N3 실패경로: 발행시각을 못 읽으면 0 이다 (NaN 이 정렬로 새지 않는다)", () => {
    expect(
      computeIssueScore({
        crossPublisherCount: 5,
        weight: 1.6,
        publishedAt: "읽을 수 없는 값",
        now: NOW,
      }),
    ).toBe(0);
  });
});

describe("assignGate — INV-H1 문 배정은 중요도로만 정한다", () => {
  it("INV-H1: 중요도가 1 이상이면 1번 문, 0 이면 비어 있다 (S34)", () => {
    expect(assignGate(1)).toBe(GATE_ONE);
    expect(assignGate(2)).toBe(GATE_ONE);
    expect(assignGate(3)).toBe(GATE_ONE);
    expect(assignGate(0)).toBeNull();
  });

  it("INV-H1 실패경로: 중요도가 없으면(판정 못 받음) 문도 비어 있다 (S34b)", () => {
    expect(assignGate(null)).toBeNull();
  });

  it("INV-H1: 이슈성은 배정의 입력이 아니다 — 인자가 중요도 하나뿐이다", () => {
    // INV-N2(합산 금지)를 타입이 아니라 값으로 붙든다. 이슈성이 배정에 끼면
    // 이 함수의 인자가 늘어나고 이 검사가 깨진다.
    expect(assignGate.length).toBe(1);
  });
});

describe("placeArticle — INV-G3 두 자리는 문턱으로 갈리고 스킬·툴이 겹친다", () => {
  const hot = GATE_ONE;

  it("INV-G3: 문턱 넘음 = 핫이슈, 소식에는 안 들어간다", () => {
    const at = placeArticle({ kinds: ["news"], gate: hot });
    expect(at.hotIssue).toBe(true);
    expect(at.news).toBe(false);
    expect(at.tools).toBe(false);
  });

  it("INV-G3: 문턱 못 넘음 = 소식", () => {
    const at = placeArticle({ kinds: ["news"], gate: null });
    expect(at.hotIssue).toBe(false);
    expect(at.news).toBe(true);
    expect(at.tools).toBe(false);
  });

  it("INV-G3: 툴 + 문턱 못 넘음 = 소식과 스킬·툴 양쪽 (S32)", () => {
    const at = placeArticle({ kinds: ["tool"], gate: null });
    expect(at.news).toBe(true);
    expect(at.tools).toBe(true);
    expect(at.hotIssue).toBe(false);
  });

  it("INV-G3: 툴 + 문턱 넘음 = 핫이슈와 스킬·툴 둘 다", () => {
    const at = placeArticle({ kinds: ["tool"], gate: hot });
    expect(at.hotIssue).toBe(true);
    expect(at.tools).toBe(true);
    expect(at.news).toBe(false);
  });

  it("INV-G1: 한 글이 뉴스이면서 툴일 수 있고, 두 자리에 다 선다 (S30 의 배치 쪽)", () => {
    const at = placeArticle({ kinds: ["news", "tool"], gate: null });
    expect(at.news).toBe(true);
    expect(at.tools).toBe(true);
  });

  // 이 테스트가 2026-09-21 에 뒤집힌 조항을 붙든다. 옛 규칙에서는 이 글이 어느 자리에도
  // 안 섰고, 실제로 117건 중 30건이 그렇게 사라졌다. 여기가 빨간불이 되면 그 구멍이 돌아온 것이다.
  it("INV-G3 실패경로: 종류가 비어 있어도 소식에는 선다 — 사라지는 글이 없다 (S32b)", () => {
    const at = placeArticle({ kinds: [], gate: null });
    expect(at.news).toBe(true);
    expect(at.tools).toBe(false);
    expect(at.hotIssue).toBe(false);
  });

  it("INV-G3: 어떤 종류든 핫이슈 아니면 소식 — 두 자리 중 정확히 하나에 선다", () => {
    for (const kinds of [[], ["news"], ["tool"], ["news", "tool"]] as const) {
      for (const gate of [hot, null] as const) {
        const at = placeArticle({ kinds, gate });
        expect(at.hotIssue !== at.news).toBe(true);
      }
    }
  });
});

/*
 * `applyRunCap` 절은 2026-09-21 에 지웠다 (INV-N4 개정 — 개수 상한 폐지).
 *
 * 검사 넷이 전부 "상한에 맞춰 잘린다"를 확인하던 것이라, 함수와 함께 사라진다.
 * 상한이 돌아오지 않는지는 `run-hot-issue.test.ts` 의 "문턱을 넘은 것은 전부 배정한다"가
 * 붙든다 — 여기에 남겨 두면 없어진 함수를 검사하는 껍데기가 된다.
 */
