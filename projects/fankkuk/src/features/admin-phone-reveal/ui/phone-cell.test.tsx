// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { PhoneCell } from "./phone-cell";

let root: Root | null = null;
let host: HTMLDivElement | null = null;

beforeAll(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
});

afterEach(() => {
  act(() => root?.unmount());
  host?.remove();
  root = null;
  host = null;
  vi.unstubAllGlobals();
});

function show(node: React.ReactNode): HTMLDivElement {
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  act(() => root?.render(node));
  return host;
}

function stubFetch(status: number, body: Record<string, unknown>) {
  const fetchMock = vi.fn(async () => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } }));
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

async function click(el: Element | null) {
  await act(async () => {
    (el as HTMLButtonElement).click();
  });
  await act(async () => {});
}

describe("크리에이터 목록 휴대폰 칸 (admin-console INV-K14)", () => {
  it("INV-K14: 직원은 가린 번호만 보고 「보기」 버튼이 없다", () => {
    const el = show(<PhoneCell loginId="haru_creator" name="하루" masked="010-****-5678" canReveal={false} />);
    expect(el.textContent).toContain("010-****-5678");
    expect(el.querySelector("button")).toBeNull();
  });

  it("INV-K14: 대표는 「보기」를 누르면 사유 입력 없이 그 자리에서 원래 번호를 본다", async () => {
    const fetchMock = stubFetch(200, { phone: "010-1234-5678" });
    const el = show(<PhoneCell loginId="haru_creator" name="하루" masked="010-****-5678" canReveal />);
    const button = el.querySelector('button[aria-label="하루 휴대폰 번호 보기"]');
    expect(button).not.toBeNull();
    await click(button);
    expect(el.textContent).toContain("010-1234-5678");
    expect(el.textContent).not.toContain("010-****-5678");
    expect(el.querySelector("input, textarea, dialog")).toBeNull();
    expect(el.querySelector("button")).toBeNull();
    expect(fetchMock).toHaveBeenCalledWith("/api/admin/creators/phone", expect.objectContaining({ method: "POST", body: JSON.stringify({ loginId: "haru_creator" }) }));
  });

  it("INV-K14 실패경로: 거부되면 가린 번호를 그대로 두고 이유를 알린다", async () => {
    stubFetch(403, { message: "이 작업을 수행할 권한이 없습니다." });
    const el = show(<PhoneCell loginId="haru_creator" name="하루" masked="010-****-5678" canReveal />);
    await click(el.querySelector("button"));
    expect(el.querySelector('[role="alert"]')?.textContent).toContain("권한이 없습니다");
    expect(el.textContent).toContain("010-****-5678");
  });

  it("번호가 없으면 「—」만", () => {
    const el = show(<PhoneCell loginId="haru_creator" name="하루" masked={null} canReveal />);
    expect(el.textContent).toBe("—");
    expect(el.querySelector("button")).toBeNull();
  });
});
