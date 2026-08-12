import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { FeedControls } from "./feed-controls";

/**
 * content-selection INV-L2: 층(daily/deep)은 화면에 별도 컨트롤로 드러나지 않는다.
 * 화면을 가르는 축은 갈래다 — 두 축을 동시에 1차 기준으로 두면 훑는 방법이 갈린다.
 */
describe("FeedControls — INV-L2 층은 화면 컨트롤로 드러나지 않는다", () => {
  it("INV-L2 (CS12): 컨트롤 줄에는 정렬·주제 필터 그룹만 있다", () => {
    const html = renderToStaticMarkup(
      <FeedControls sort="trending" tag={null} onSortChange={() => {}} onTagChange={() => {}} />,
    );
    const doc = new DOMParser().parseFromString(html, "text/html");
    const groups = [...doc.querySelectorAll('[role="group"]')].map((g) =>
      g.getAttribute("aria-label"),
    );
    // 정확한 목록을 단언한다 — "포함한다"만 보면 세 번째 그룹이 추가돼도 통과한다.
    expect(groups).toEqual(["정렬 방식", "주제 필터"]);
  });

  it("INV-L2 (CS12): 층을 고르는 토글·칩이 없다", () => {
    const html = renderToStaticMarkup(
      <FeedControls sort="latest" tag={null} onSortChange={() => {}} onTagChange={() => {}} />,
    );
    const doc = new DOMParser().parseFromString(html, "text/html");
    const buttonLabels = [...doc.querySelectorAll("button")].map((b) => b.textContent ?? "");
    expect(buttonLabels.some((t) => /daily|deep|매일|시간 날 때|층/.test(t))).toBe(false);
  });
});
