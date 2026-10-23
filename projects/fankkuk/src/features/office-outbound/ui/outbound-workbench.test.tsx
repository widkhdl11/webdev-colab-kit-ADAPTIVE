import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// 출고 작업 화면 (office-workflow INV-W8·W14·W15, address-protection INV-P18). 서버로 가는 호출(postOutbound)만 가짜로 둔다.
const api = vi.hoisted(() => ({ postOutbound: vi.fn() }));
vi.mock("../api/post-outbound-client", () => api);
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: () => {} }) }));

import { OutboundWorkbench } from "./outbound-workbench";

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

const QR = "Q-123456";
const LABEL = { recipientName: "별빛", phone: "01012345678", zipCode: "06236", address1: "서울시 강남구 테헤란로 1", address2: "101호" };

function parcel(state: string, nextStep: string) {
  return {
    kind: "ok",
    body: {
      parcel: {
        qr: QR,
        kind: "gift",
        orderNo: "FC-7K3M9",
        senderNickname: "별빛",
        receiverName: "하루",
        tier: "small",
        state,
        nextStep,
        envelopeNo: "E-000123",
        outboundWaybillNo: null,
        returnWaybillNo: state === "return_printed" ? "555566667777" : null,
        openTarget: false,
      },
    },
  };
}

async function scanQr(reply: unknown) {
  act(() => root.render(<OutboundWorkbench access="owner" operatorNickname="담당" />));
  api.postOutbound.mockResolvedValueOnce(reply);
  const scan = host.querySelector<HTMLInputElement>("#outbound-scan")!;
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
  act(() => {
    setter?.call(scan, QR);
    scan.dispatchEvent(new Event("input", { bubbles: true }));
  });
  await act(async () => {
    scan.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
  });
}
const button = (name: string) => {
  const found = [...host.querySelectorAll("button")].find((b) => b.textContent === name);
  if (!found) throw new Error(`버튼 없음: ${name}`);
  return found;
};
const click = async (name: string) => {
  await act(async () => {
    button(name).click();
  });
};
const writes = () => api.postOutbound.mock.calls.map((c) => c[0] as { kind: string });

describe("출고 화면 — 확정 뒤 송장 다시 출력 (address-protection INV-P5 · reverse-gift INV-R9 · INV-P18, 카드 d120)", () => {
  function closed(kind: "gift" | "revgift", state: "shipped" | "returned") {
    const reply = parcel(state, "done") as { kind: string; body: { parcel: Record<string, unknown> } };
    reply.body.parcel = { ...reply.body.parcel, kind, orderNo: kind === "gift" ? "FC-7K3M9" : "RG-AB12CD", outboundWaybillNo: "111122223333", returnWaybillNo: state === "returned" ? "555566667777" : null };
    return reply;
  }

  it.each([
    ["gift", "shipped", "print_label"],
    ["revgift", "shipped", "print_label"],
    ["gift", "returned", "print_return"],
    ["revgift", "returned", "print_return"],
  ] as const)("대표: %s 상자 %s → 「송장 다시 출력」이 %s 로 간다", async (kind, state, write) => {
    await scanQr(closed(kind, state));
    api.postOutbound.mockResolvedValueOnce({ kind: "ok", body: { waybill: "111122223333", reprint: true, label: LABEL } });
    api.postOutbound.mockResolvedValueOnce(closed(kind, state));
    await click("송장 다시 출력");
    expect(writes().at(-2)).toEqual({ kind: write, qr: QR });
    expect(host.querySelector(".print-only")?.textContent).toContain("테헤란로 1");
  });

  it("역조공·반송 상자는 「확정하고 3일 안」을 안내하고, 팬 선물 출고 상자는 기한 문장이 없다", async () => {
    await scanQr(closed("revgift", "shipped"));
    expect(host.textContent).toContain("3일 안");
    await scanQr(closed("gift", "shipped"));
    expect(host.textContent).not.toContain("3일 안");
  });

  it("INV-W3 (실패경로): 직원 화면에는 확정 뒤 다시 출력 단추가 없다", async () => {
    act(() => root.render(<OutboundWorkbench access="staff" operatorNickname="담당" />));
    api.postOutbound.mockResolvedValueOnce(closed("revgift", "returned"));
    const scan = host.querySelector<HTMLInputElement>("input")!;
    await act(async () => {
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!;
      setter.call(scan, QR);
      scan.dispatchEvent(new Event("input", { bubbles: true }));
    });
    await act(async () => {
      scan.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
    });
    expect([...host.querySelectorAll("button")].some((b) => b.textContent === "송장 다시 출력")).toBe(false);
  });
});

describe("출고 화면 — 반송·처분·경찰 인계 (INV-W8·W14·W15)", () => {
  it("INV-P18: 주문에 이어진 상자의 반송 송장 응답(라벨 칸)을 읽는다 — 「출력 결과를 읽지 못했어요」가 없고, 주소는 인쇄 칸에만 있다", async () => {
    await scanQr(parcel("return_waiting", "print_return"));
    api.postOutbound.mockResolvedValueOnce({ kind: "ok", body: { waybill: "555566667777", reprint: false, label: LABEL } });
    api.postOutbound.mockResolvedValueOnce(parcel("return_printed", "confirm_return"));
    await click("반송 송장 출력");
    expect(host.textContent).not.toContain("출력 결과를 읽지 못했어요");
    const printOnly = host.querySelector(".print-only");
    expect(printOnly?.textContent).toContain("테헤란로 1");
    expect(button("송장 인쇄")).toBeTruthy();
    // 인쇄 칸 밖에는 주소가 없다
    const outside = (host.textContent ?? "").replace(printOnly?.textContent ?? "", "");
    expect(outside).not.toContain("테헤란로");
  });

  it("INV-W15: 반송 주소 확인 전 상자는 출력 버튼 없이 「반송 주소 확인 전」", async () => {
    await scanQr(parcel("return_waiting", "wait_return_address"));
    expect(host.textContent).toContain("반송 주소 확인 전");
    expect([...host.querySelectorAll("button")].some((b) => b.textContent === "반송 송장 출력")).toBe(false);
  });

  it("INV-W15 (S15d): 처분 대상 상자는 「처분 기록」 — 누르면 처분을 기록하고 봉투 파쇄를 안내한다", async () => {
    await scanQr(parcel("dispose_due", "record_disposal"));
    expect(host.textContent).toContain("처분 대상");
    api.postOutbound.mockResolvedValueOnce({ kind: "ok", body: { ok: true } });
    api.postOutbound.mockResolvedValueOnce(parcel("disposed", "done"));
    await click("처분 기록");
    expect(writes()).toContainEqual({ kind: "record_disposal", qr: QR });
    expect(host.textContent).toContain("E-000123");
    expect(host.textContent).toContain("파쇄");
  });

  it("INV-W14: 신고 보관 상자는 메모와 함께 「경찰 인계 기록」 — 메모 없이 누르면 보내지 않는다", async () => {
    await scanQr(parcel("report_held", "report_held"));
    expect(host.textContent).toContain("신고 보관");
    await click("경찰 인계 기록");
    expect(writes().filter((w) => w.kind === "record_police_handover")).toEqual([]);
    const memo = host.querySelector<HTMLInputElement>("#police-memo")!;
    // 오류는 바로 읽히고(alert) 포커스는 고칠 입력 칸으로 간다
    expect(host.querySelector("#police-memo-error")?.closest("[role=alert]")).not.toBeNull();
    expect(host.ownerDocument.activeElement).toBe(memo);
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
    act(() => {
      setter?.call(memo, "강남서 인계");
      memo.dispatchEvent(new Event("input", { bubbles: true }));
    });
    api.postOutbound.mockResolvedValueOnce({ kind: "ok", body: { ok: true } });
    api.postOutbound.mockResolvedValueOnce(parcel("police_handed", "done"));
    await click("경찰 인계 기록");
    expect(writes()).toContainEqual({ kind: "record_police_handover", qr: QR, memo: "강남서 인계" });
    expect(host.textContent).toContain("경찰 인계");
    expect(host.textContent).toContain("파쇄");
  });
});
