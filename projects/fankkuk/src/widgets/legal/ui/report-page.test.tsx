import { act, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { orBlank, SITE_INFO } from "@/shared/config/site-info";
import { ReportPage } from "./report-page";

// 신고·문의 — 버튼 가까이는 받는 이메일 한 줄만(S10-2, 2026-11-21 사용자 「다 추천대로」).

vi.mock("next/link", () => ({
  default: ({ href, children, ...rest }: { href: string; children: ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let host: HTMLDivElement;
let root: Root;
beforeEach(() => {
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  act(() => root.render(<ReportPage />));
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
});

describe("신고·문의 버튼 둘레(S10-2)", () => {
  it("버튼 위에 사용 방법 문장이 없고, 버튼 바로 아래는 받는 이메일 한 줄뿐이다", () => {
    const btn = host.querySelector('form button[type="submit"]')!;
    expect(host.textContent).not.toContain("버튼을 누르면 작성한 내용을 이메일 앱으로 전달합니다");
    expect(btn.previousElementSibling?.getAttribute("role")).toBe("status");
    expect(btn.nextElementSibling?.textContent).toBe(`받는 이메일: ${orBlank(SITE_INFO.supportEmail)}`);
  });

  it("첨부 안내는 내용 칸 아래, 회원 1:1 문의는 양식 밖 한 줄", () => {
    expect(host.querySelector("#r-body-hint")?.textContent).toMatch(/^최대 1,000자 · 파일은 이메일 앱에서 첨부할 수 있습니다$/);
    const support = [...host.querySelectorAll("a")].find((a) => a.getAttribute("href") === "/support")!;
    expect(support.closest("form")).toBeNull();
    expect(support.parentElement?.textContent).toBe("회원은 고객센터의 1:1 문의도 이용할 수 있습니다.");
  });
});
