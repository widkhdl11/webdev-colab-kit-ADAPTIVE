import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AdminInquiry } from "@/entities/inquiry/model/admin-inquiry";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }) }));

import { InquiriesPanel } from "./inquiries-panel";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let host: HTMLDivElement;
let root: Root;

beforeEach(() => {
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
});

afterEach(() => {
  act(() => root.unmount());
  host.remove();
});

function inquiry(restricted: boolean): AdminInquiry {
  return {
    id: "3f1c2b7a-9d4e-4c1a-8b2f-0a1b2c3d4e5f",
    kind: "etc",
    title: "같은 문의",
    body: "본문",
    orderNo: null,
    status: "open",
    answer: null,
    createdAt: "2026-10-08T02:00:00+00:00",
    answeredAt: null,
    authorLoginId: "dal_tokki",
    authorNickname: "달토끼",
    answeredByNickname: null,
    authorRestricted: restricted,
    authorRestrictionReason: restricted ? "같은 문의를 하루 100건" : null,
  };
}

const buttons = () => [...host.querySelectorAll("button")].map((b) => b.textContent ?? "");

describe("관리자 1:1 문의 — 문의 제한 표시와 버튼 (INV-K12)", () => {
  it("INV-K12: 제한 중인 사람은 목록에 「(문의 제한 중)」, 상세에 「제한 중」과 사유가 보인다", () => {
    act(() => root.render(<InquiriesPanel inquiries={[inquiry(true)]} canRestrict={false} />));
    expect(buttons().some((t) => t.includes("달토끼 (문의 제한 중)"))).toBe(true);
    expect(host.textContent).toContain("제한 중");
    expect(host.textContent).toContain("같은 문의를 하루 100건");
  });

  it("INV-K12: 제한되지 않은 사람은 「없음」, 「제한 중」 표시가 없다", () => {
    act(() => root.render(<InquiriesPanel inquiries={[inquiry(false)]} canRestrict={false} />));
    expect(host.textContent).not.toContain("제한 중");
    expect(host.textContent).toContain("없음");
  });

  it("INV-K12: 대표 화면에만 버튼 — 제한 안 됨이면 「문의 제한하기」, 제한 중이면 「제한 풀기」", () => {
    act(() => root.render(<InquiriesPanel inquiries={[inquiry(false)]} canRestrict />));
    expect(buttons()).toContain("문의 제한하기");
    act(() => root.render(<InquiriesPanel inquiries={[inquiry(true)]} canRestrict />));
    expect(buttons()).toContain("제한 풀기");
  });

  it("INV-K12 (실패경로): 직원 화면(canRestrict false)에는 제한·풀기 버튼이 없다", () => {
    for (const restricted of [false, true]) {
      act(() => root.render(<InquiriesPanel inquiries={[inquiry(restricted)]} canRestrict={false} />));
      expect(buttons()).not.toContain("문의 제한하기");
      expect(buttons()).not.toContain("제한 풀기");
    }
  });
});
