import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { FeedControls } from "./feed-controls";

/**
 * content-selection INV-L2: 층(daily/deep)은 화면에 별도 컨트롤로 드러나지 않는다.
 * 화면을 가르는 축은 갈래다 — 두 축을 동시에 1차 기준으로 두면 훑는 방법이 갈린다.
 */
describe("FeedControls — INV-L2 층은 화면 컨트롤로 드러나지 않는다", () => {
  it("INV-L2 (CS12): 컨트롤 줄에는 자리 그룹만 있다", () => {
    const html = renderToStaticMarkup(
      <FeedControls segment="hot" onSegmentChange={() => {}} />,
    );
    const doc = new DOMParser().parseFromString(html, "text/html");
    const groups = [...doc.querySelectorAll('[role="group"]')].map((g) =>
      g.getAttribute("aria-label"),
    );
    // 정확한 목록을 단언한다 — "포함한다"만 보면 세 번째 그룹이 추가돼도 통과한다.
    // 키워드 `전체` 칩은 2026-09-24 에 뱃지 줄로 옮겼다(keyword-badges.test.tsx).
    expect(groups).toEqual(["볼 자리"]);
  });

  it("INV-L2 (CS12): 층을 고르는 토글·칩이 없다", () => {
    const html = renderToStaticMarkup(
      <FeedControls segment="news" onSegmentChange={() => {}} />,
    );
    const doc = new DOMParser().parseFromString(html, "text/html");
    const buttonLabels = [...doc.querySelectorAll("button")].map((b) => b.textContent ?? "");
    expect(buttonLabels.some((t) => /daily|deep|매일|시간 날 때|층/.test(t))).toBe(false);
  });
});

/**
 * badge-keywords INV-N5 (2026-08-31 에 planned 에서 옮겨 온 조항) — 앞쪽 절반.
 *
 * "글 목록에는 건수를 안 붙인다." 붙일 자리가 생기면 제일 먼저 생기는 곳이 `전체` 칩이다
 * (`전체 37` → 그게 곧 오늘 치 할당량이 된다). 뒤쪽 절반("뱃지에는 붙인다")은
 * keyword-badges.test.tsx 가 본다 — 한쪽만 보면 **숫자를 통째로 없애도 통과한다.**
 */
describe("FeedControls — 목록에는 건수를 안 붙인다 (INV-N5)", () => {
  it("BK20: 자리 버튼 어디에도 숫자가 없다 — `전체` 포함", () => {
    const html = renderToStaticMarkup(
      <FeedControls segment="all" onSegmentChange={() => {}} />,
    );
    const doc = new DOMParser().parseFromString(html, "text/html");
    for (const button of doc.querySelectorAll("button")) {
      expect(button.textContent ?? "").not.toMatch(/\d/);
    }
  });
});

/** 2026-09-24: 자리 줄에 `전체` 가 생겼다 — 핫이슈와 소식을 합친 자리다. */
describe("FeedControls — 자리 넷", () => {
  it("자리는 `전체 · 핫이슈 · 소식 · 스킬·툴` 순서이고 지금 자리만 눌려 있다", () => {
    const html = renderToStaticMarkup(
      <FeedControls segment="all" onSegmentChange={() => {}} />,
    );
    const doc = new DOMParser().parseFromString(html, "text/html");
    const buttons = [...doc.querySelectorAll("button")];
    expect(buttons.map((b) => b.textContent)).toEqual(["전체", "핫이슈", "소식", "스킬·툴"]);
    expect(buttons.map((b) => b.getAttribute("aria-pressed"))).toEqual([
      "true",
      "false",
      "false",
      "false",
    ]);
  });
});
