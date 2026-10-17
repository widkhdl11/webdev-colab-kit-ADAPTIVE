import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// 운영자 「들어온 상자」 위의 크리에이터가 고른 상자 목록 (office-workflow INV-W13·W14). 서버 호출만 가짜로 둔다.
const api = vi.hoisted(() => ({ postProcessCheck: vi.fn() }));
vi.mock("../api/post-process-client", () => api);
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: () => {} }) }));

import { CreatorCheckChoices } from "./creator-check-choices";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let host: HTMLDivElement;
let root: Root;
beforeEach(() => {
  vi.clearAllMocks();
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
});

const row = (qr: string, choice: "accept" | "return" | "report" | "no_report") => ({ qr, orderNo: "FC-7K3M9", boxSeq: 1, choice, chosenAt: "2026-10-17T01:00:00Z", dueAt: "2026-10-24T01:00:00Z" });

describe("크리에이터가 고른 상자 (INV-W13·W14)", () => {
  it("INV-W14: 추적기 보관 상자의 선택은 「신고하기 선택」·「신고하지 않기 선택」, 처리 버튼은 신고 보관·반송 — 코드값이 보이지 않는다", () => {
    act(() => root.render(<CreatorCheckChoices rows={[row("Q-000001", "report"), row("Q-000002", "no_report"), row("Q-000003", "accept")]} />));
    const text = host.textContent ?? "";
    expect(text).toContain("신고하기 선택");
    expect(text).toContain("신고하지 않기 선택");
    expect(text).toContain("신고 보관으로 처리");
    expect(text).toContain("검수 완료로 처리");
    expect(text).not.toMatch(/no_report|report(?!\w)/);
    const buttons = [...host.querySelectorAll("button")].map((b) => b.textContent);
    expect(buttons).toEqual(["신고 보관으로 처리", "반송으로 처리", "검수 완료로 처리"]);
  });

  it("INV-W14: 처리 버튼은 화면에 보인 선택을 같이 보낸다", async () => {
    api.postProcessCheck.mockResolvedValueOnce({ kind: "ok" });
    act(() => root.render(<CreatorCheckChoices rows={[row("Q-000001", "no_report")]} />));
    await act(async () => host.querySelector("button")!.click());
    expect(api.postProcessCheck).toHaveBeenCalledWith("Q-000001", "no_report");
  });
});
