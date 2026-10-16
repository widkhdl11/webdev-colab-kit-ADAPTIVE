import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// 검수 작업 화면 (office-workflow INV-W4 S4h·S4c, 2026-10-12 문제집 D2·D5).
// 서버로 가는 호출(postInspect)만 가짜로 둔다 — 시험 대상은 화면이 무엇을 미리 고르고 무엇을 보내는지다.
const api = vi.hoisted(() => ({ postInspect: vi.fn() }));
vi.mock("../api/post-inspect-client", () => api);
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: () => {} }) }));

import { InspectWorkbench } from "./inspect-workbench";

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

function lookupReply(tier: "small" | "medium" | "large") {
  return {
    kind: "ok",
    body: {
      parcel: {
        qr: QR,
        kind: "gift",
        orderNo: "FC-7K3M9",
        senderNickname: "별빛",
        receiverName: "하루",
        tier,
        state: "labeled",
        nextStep: "inspect",
        envelopeNo: "E-1",
        outboundWaybillNo: null,
        returnWaybillNo: null,
      },
    },
  };
}

async function loadBox(tier: "small" | "medium" | "large" = "small") {
  act(() => root.render(<InspectWorkbench operatorNickname="담당" />));
  api.postInspect.mockResolvedValueOnce(lookupReply(tier));
  const scan = host.querySelector<HTMLInputElement>("#inspect-scan")!;
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
  act(() => {
    setter?.call(scan, QR);
    scan.dispatchEvent(new Event("input", { bubbles: true }));
  });
  await act(async () => {
    scan.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
  });
}

const radio = (name: string, value: string) => {
  const el = host.querySelector<HTMLInputElement>(`input[name="${name}"][value="${value}"]`);
  if (!el) throw new Error(`선택지 없음: ${name}=${value}`);
  return el;
};
const pick = (name: string, value: string) => act(() => radio(name, value).click());
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
const describedText = (el: Element) =>
  (el.getAttribute("aria-describedby") ?? "")
    .split(/\s+/)
    .filter(Boolean)
    .map((id) => document.getElementById(id)?.textContent ?? `(없는 id ${id})`)
    .join(" | ");
const writesOf = (kind: string) => api.postInspect.mock.calls.map((c) => c[0] as { kind: string }).filter((w) => w.kind === kind);

describe("실측 구간 — 신고 구간을 미리 골라 둔다 (INV-W4 S4h, 문제집 D5)", () => {
  it("INV-W4 (S4h): 소형 신고 상자는 소형이 골라져 열리고, 그대로 「실측 기록」이면 소형으로 기록한다", async () => {
    await loadBox("small");
    expect(radio("measured", "small").checked).toBe(true);
    expect(radio("measured", "medium").checked).toBe(false);
    api.postInspect.mockResolvedValueOnce({ kind: "ok", body: { measurement: { result: "none" } } });
    await click("실측 기록");
    expect(writesOf("measure")).toEqual([{ kind: "measure", qr: QR, tier: "small" }]);
  });

  it("INV-W4 (S4h): 중형으로 바꾸면 중형으로 기록한다 — 미리 고른 값에 묶이지 않는다", async () => {
    await loadBox("small");
    pick("measured", "medium");
    api.postInspect.mockResolvedValueOnce({ kind: "ok", body: { measurement: { result: "difference", amountKrw: 3000 } } });
    await click("실측 기록");
    expect(writesOf("measure")).toEqual([{ kind: "measure", qr: QR, tier: "medium" }]);
  });

  it("INV-W4 (S4h): 중형 신고 상자는 중형이 골라진다 — 신고 구간을 따른다", async () => {
    await loadBox("medium");
    expect(radio("measured", "medium").checked).toBe(true);
    expect(radio("measured", "small").checked).toBe(false);
  });

  it("INV-W4 (S4h): 미리 골라진 신고 구간 라벨에만 「(신고)」, 칸은 「재어 본 뒤 맞으면 그대로 기록해요」 안내와 이어진다", async () => {
    await loadBox("small");
    expect(radio("measured", "small").closest("label")?.textContent).toBe("소형 (신고)");
    expect(radio("measured", "medium").closest("label")?.textContent).toBe("중형");
    const field = radio("measured", "small").closest("fieldset")!;
    const strong = [...host.querySelectorAll("strong")].find((s) => s.textContent === "재어 본 뒤 맞으면 그대로 기록해요.");
    expect(strong).toBeDefined();
    expect(describedText(field)).toContain("재어 본 뒤 맞으면 그대로 기록해요.");
  });
});

describe("추적기 판정 (INV-W4 S4c, 문제집 D2)", () => {
  it("INV-W4 (실패경로): 반응이 나왔는데 판정 없이 저장하면 기록을 보내지 않고, 판정 칸이 오류로 표시되고 첫 선택지로 커서가 간다", async () => {
    await loadBox();
    pick("bt", "found");
    await click("기록 저장");
    expect(writesOf("record")).toEqual([]);
    const field = radio("tracker", "tracker").closest("fieldset")!;
    expect(field.id).not.toBe("");
    expect(field.getAttribute("aria-invalid")).toBe("true");
    const described = describedText(field);
    expect(described).toContain("위치 추적기인지 골라 주세요");
    expect(described).toContain("에어태그·스마트태그 같은 위치 추적기인지 상자를 열어 확인해요.");
    expect(document.activeElement).toBe(radio("tracker", "tracker"));
    // 고르면 오류 표시가 풀린다
    pick("tracker", "not_tracker");
    expect(field.getAttribute("aria-invalid")).toBeNull();
  });

  it("화면 안에서 막힌 오류는 「확인 필요」 — 서버 거절이 아니므로 「거부」·「상자 상태는 그대로예요」가 없다", async () => {
    await loadBox();
    pick("bt", "found");
    await click("기록 저장");
    const panel = [...host.querySelectorAll("h2")].find((h) => h.textContent === "추적기인지 먼저 골라 주세요")!.closest("div")!.parentElement!;
    expect(panel.textContent).toContain("확인 필요");
    expect(panel.textContent).not.toContain("거부");
    expect(panel.textContent).not.toContain("상자 상태는 그대로예요");
  });

  it("서버가 거절한 오류는 그대로 「거부」·「상자 상태는 그대로예요」", async () => {
    await loadBox();
    api.postInspect.mockResolvedValueOnce({ kind: "failed", status: 409, message: "지금 단계에서 할 수 없어요.", reason: null });
    // 거절 뒤 화면이 상자를 다시 읽는다
    api.postInspect.mockResolvedValueOnce(lookupReply("small"));
    await click("기록 저장");
    const panel = [...host.querySelectorAll("h2")].find((h) => h.textContent === "기록을 저장하지 못했어요")!.closest("div")!.parentElement!;
    expect(panel.textContent).toContain("거부");
    expect(panel.textContent).toContain("상자 상태는 그대로예요");
  });

  it("INV-W4: 판정 전에는 결과 칸 아래에 「추적기 판정을 먼저 고르면 결과를 고를 수 있어요」, 평소에는 「…판정했을 때만 고를 수 있어요」", async () => {
    await loadBox();
    expect(host.textContent).toContain("추적기 반송은 위치 추적기로 판정했을 때만 고를 수 있어요.");
    pick("bt", "found");
    const result = radio("res", "pass").closest("fieldset")!;
    expect(result.textContent).toContain("추적기 판정을 먼저 고르면 결과를 고를 수 있어요.");
  });

  it("INV-W4: 반응이 없어지면 고른 판정이 지워진다 — 다시 반응이 나와도 아무것도 골라져 있지 않고 저장은 막힌다", async () => {
    await loadBox();
    pick("bt", "found");
    pick("tracker", "tracker");
    pick("bt", "clear");
    pick("bt", "found");
    expect(radio("tracker", "tracker").checked).toBe(false);
    expect(radio("tracker", "not_tracker").checked).toBe(false);
    await click("기록 저장");
    expect(writesOf("record")).toEqual([]);
  });
});

async function rescan() {
  const scan = host.querySelector<HTMLInputElement>("#inspect-scan")!;
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
  act(() => {
    setter?.call(scan, QR);
    scan.dispatchEvent(new Event("input", { bubbles: true }));
  });
  await act(async () => {
    scan.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
  });
}

describe("추적기 아님 → 크리에이터 확인 (INV-W4, 2026-10-12 (2) 문제집 D3 ②)", () => {
  it("INV-W4: 「추적기가 아니에요」면 「크리에이터 확인」이 골라지고 「통과」는 고를 수 없다 — 그대로 저장하면 confirm 으로 기록", async () => {
    await loadBox();
    pick("bt", "found");
    pick("tracker", "not_tracker");
    expect(radio("res", "confirm").checked).toBe(true);
    expect(radio("res", "pass").disabled).toBe(true);
    expect(radio("res", "confirm").closest("label")?.textContent).toBe("크리에이터 확인");
    api.postInspect.mockResolvedValueOnce({ kind: "ok", body: { ok: true } });
    await click("기록 저장");
    expect(writesOf("record")).toEqual([
      { kind: "record", qr: QR, result: { bluetooth: "found", rf: "clear", metal: "clear", tracker_verdict: "not_tracker", outcome: "confirm" } },
    ]);
  });

  it("INV-W4 (실패경로): 반응이 없는 상자에는 「크리에이터 확인」을 고를 수 없다", async () => {
    await loadBox();
    expect(radio("res", "confirm").disabled).toBe(true);
    expect(radio("res", "pass").checked).toBe(true);
  });

  it("INV-W4·W6: 다시 스캔해 크리에이터 확인 대기로 넘어가면 그 사실과 168시간 뒤 반송을 알린다", async () => {
    await loadBox();
    pick("bt", "found");
    pick("tracker", "not_tracker");
    api.postInspect.mockResolvedValueOnce({ kind: "ok", body: { ok: true } });
    await click("기록 저장");
    api.postInspect.mockResolvedValueOnce({ kind: "ok", body: { state: "held" } });
    await rescan();
    expect(writesOf("complete")).toEqual([{ kind: "complete", qr: QR }]);
    expect(host.textContent).toContain("크리에이터 확인을 기다려요");
    // INV-W13: 고른 것은 「들어온 상자」에서 운영자가 처리하고, 기한이 지나면 고른 쪽대로·고르지 않았으면 반송 대기
    expect(host.textContent).toContain("7일이 지나면 고른 쪽대로, 고르지 않았으면 반송 대기로 넘어가요.");
    expect(host.textContent).not.toContain("결과를 읽지 못했어요");
  });
});
