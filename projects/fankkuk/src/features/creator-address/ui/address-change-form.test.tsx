import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { SealedAddressSendOutcome } from "@/shared/ui/sealed-address-form";

// 크리에이터 주소 폼의 카카오톡 서명 기다림 (address-protection INV-P22 · S22~S22d). 이 폼을 승인 창·설정·가입 4단계·반송 주소 확인 창이 같이 쓴다.
// 서버로 가는 요청·결과 확인은 가짜로 둔다. 공용 봉인 폼은 「봉인한 값을 send 에 넘기고, ok 면 onSaved · refused 면 문구 · handled 면 아무것도 하지 않는다」
// 약속만 흉내 낸다(봉인·칸 검사는 공용 폼의 몫). 시험 대상은 이 폼의 상태: 입력 → 기다림(안내·남은 시간·다시 보내기·취소) → 저장됨/끝남.
const startCreatorAddress = vi.fn();
const checkCreatorAddress = vi.fn();
vi.mock("../api/send-creator-address", () => ({
  startCreatorAddress: (...a: unknown[]) => startCreatorAddress(...a),
  checkCreatorAddress: (...a: unknown[]) => checkCreatorAddress(...a),
}));
const ENVELOPE = { v: 1, alg: "RSA-OAEP-256+A256GCM", wrappedKey: "k", iv: "i", ciphertext: "c" };
vi.mock("@/shared/ui/sealed-address-form", async (orig) => {
  const real = await orig<typeof import("@/shared/ui/sealed-address-form")>();
  const { useState } = await import("react");
  return {
    ...real,
    SealedAddressForm: (p: {
      send: (e: unknown, l: string, c: string) => Promise<SealedAddressSendOutcome>;
      onSaved: (l: string) => void;
      onCancel?: () => void;
      submitContent: (busy: boolean) => React.ReactNode;
    }) => {
      const [err, setErr] = useState<string | null>(null);
      return (
        <div data-form="">
          <p role="alert">{err}</p>
          {p.onCancel ? (
            <button type="button" onClick={p.onCancel}>
              취소
            </button>
          ) : null}
          <button
            type="button"
            data-submit=""
            onClick={async () => {
              const o = await p.send(ENVELOPE, "studio", "jeju");
              if (o.kind === "ok") p.onSaved("studio");
              else if (o.kind === "refused") setErr(o.message);
              else if (o.kind === "failed") setErr("저장하지 못했습니다.");
            }}
          >
            {p.submitContent(false)}
          </button>
        </div>
      );
    },
  };
});

import { AddressChangeForm } from "./address-change-form";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let host: HTMLDivElement;
let root: Root;
const onSaved = vi.fn();
const onCancel = vi.fn();
const onLoginExpired = vi.fn();
const NOW = Date.parse("2026-11-17T10:00:00.000Z");
const WAITING = { kind: "waiting", requestId: "5f0b2c1e-8d7a-4c3b-9e2f-1a2b3c4d5e6f", expiresAt: "2026-11-17T10:05:00.000Z" } as const;

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date", "setInterval", "clearInterval", "setTimeout", "clearTimeout"] });
  vi.setSystemTime(NOW);
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
  startCreatorAddress.mockReset();
  checkCreatorAddress.mockReset();
  checkCreatorAddress.mockResolvedValue({ kind: "pending" });
  onSaved.mockReset();
  onCancel.mockReset();
  onLoginExpired.mockReset();
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
  vi.useRealTimers();
});

function render(withCancel = true) {
  act(() =>
    root.render(
      <AddressChangeForm creatorId="c1" sealingKeyPem="PEM" onSaved={onSaved} onCancel={withCancel ? onCancel : undefined} onLoginExpired={onLoginExpired} />,
    ),
  );
}
const text = () => host.textContent ?? "";
const button = (name: string) => [...host.querySelectorAll("button")].find((b) => b.textContent?.trim() === name);
async function press(el: Element | undefined | null) {
  if (!el) throw new Error("누를 것이 없다");
  await act(async () => {
    (el as HTMLElement).click();
  });
}
const submit = () => press(host.querySelector("[data-submit]"));
async function advance(ms: number) {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
}

describe("주소 저장 서명 — 기다림 (INV-P22 ①·②)", () => {
  it("INV-P22 ① S22: 「카카오톡 서명」을 누르면 봉인 값·이름표·구분으로 요청하고, 저장됨이 아니라 기다림 — 카카오톡 안내·남은 시간·다시 보내기·취소", async () => {
    startCreatorAddress.mockResolvedValue(WAITING);
    render();
    expect(host.querySelector("[data-submit]")?.textContent).toContain("카카오톡 서명");
    await submit();
    expect(startCreatorAddress).toHaveBeenCalledWith(ENVELOPE, "studio", "jeju", false);
    expect(onSaved).not.toHaveBeenCalled();
    expect(host.querySelector("[data-form]")).toBeNull();
    expect(text()).toContain("카카오톡으로 서명 요청을 보냈습니다.");
    expect(text()).toContain("카카오톡에서 요청을 열고 인증을 완료해 주세요.");
    const timer = host.querySelector('[role="timer"]');
    expect(timer?.textContent).toBe("5:00");
    expect(timer?.getAttribute("aria-live")).toBe("off");
    expect(button("다시 보내기")).toBeDefined();
    expect(button("취소")).toBeDefined();
  });

  it("INV-P22 ② S22: 결과 확인이 「저장됨」이면 그때 onSaved(고른 이름표) — 그 전에는 부르지 않는다", async () => {
    startCreatorAddress.mockResolvedValue(WAITING);
    checkCreatorAddress.mockResolvedValueOnce({ kind: "pending" }).mockResolvedValue({ kind: "saved" });
    render();
    await submit();
    expect(checkCreatorAddress).toHaveBeenCalledWith(WAITING.requestId);
    expect(onSaved).not.toHaveBeenCalled();
    await advance(2000);
    expect(onSaved).toHaveBeenCalledWith("studio");
  });

  it("남은 시간은 1초마다 줄어든다", async () => {
    startCreatorAddress.mockResolvedValue(WAITING);
    render();
    await submit();
    await advance(61_000);
    expect(host.querySelector('[role="timer"]')?.textContent).toBe("3:59");
  });

  it("INV-P22 ④ S22c: 가입 서명 갈음으로 바로 저장되면 기다림 없이 onSaved", async () => {
    startCreatorAddress.mockResolvedValue({ kind: "saved" });
    render();
    await submit();
    expect(onSaved).toHaveBeenCalledWith("studio");
    expect(host.querySelector('[role="timer"]')).toBeNull();
    expect(checkCreatorAddress).not.toHaveBeenCalled();
  });

  it("INV-P22 ② S22a (실패경로): 거절 · 기한 지남 · 서명 확인 실패는 각각 다른 문구 — 저장되지 않고, 「다시 보내기」·「주소 다시 입력」", async () => {
    const seen: string[] = [];
    for (const kind of ["rejected", "expired", "failed"] as const) {
      startCreatorAddress.mockResolvedValue(WAITING);
      checkCreatorAddress.mockResolvedValue({ kind });
      render();
      await submit();
      const alert = host.querySelector('[role="alert"]')?.textContent ?? "";
      expect(alert).toContain("주소를 저장하지 않았습니다");
      seen.push(alert);
      expect(onSaved).not.toHaveBeenCalled();
      expect(button("다시 보내기")).toBeDefined();
      expect(button("주소 다시 입력")).toBeDefined();
      expect(host.querySelector('[role="timer"]')).toBeNull();
      act(() => root.unmount());
      root = createRoot(host);
    }
    expect(new Set(seen).size).toBe(3);
  });

  it("INV-P22 ② S22a (실패경로): 화면 시계로 5분이 지나면 묻기를 멈추고 「서명 시간이 지나」", async () => {
    startCreatorAddress.mockResolvedValue(WAITING);
    render();
    await submit();
    await advance(300_000);
    expect(host.querySelector('[role="alert"]')?.textContent).toContain("서명 시간이 지나");
    const asked = checkCreatorAddress.mock.calls.length;
    await advance(10_000);
    expect(checkCreatorAddress.mock.calls.length).toBe(asked);
  });

  it("INV-P22 ③: 「다시 보내기」는 같은 봉인 값으로 다시 보내기 표시(resend)를 붙여 요청한다 — 다시 입력하지 않는다", async () => {
    startCreatorAddress.mockResolvedValue(WAITING);
    render();
    await submit();
    startCreatorAddress.mockResolvedValue({ ...WAITING, requestId: "6f0b2c1e-8d7a-4c3b-9e2f-1a2b3c4d5e6f", expiresAt: "2026-11-17T10:06:00.000Z" });
    await press(button("다시 보내기"));
    expect(startCreatorAddress).toHaveBeenLastCalledWith(ENVELOPE, "studio", "jeju", true);
    await advance(2000);
    expect(checkCreatorAddress).toHaveBeenLastCalledWith("6f0b2c1e-8d7a-4c3b-9e2f-1a2b3c4d5e6f");
  });

  it("INV-P22 ③ (실패경로): 「다시 보내기」 뒤에 늦게 온 앞 요청의 답(거절)은 새 요청의 기다림을 덮지 않는다", async () => {
    let answerOld: (v: unknown) => void = () => undefined;
    startCreatorAddress.mockResolvedValue(WAITING);
    checkCreatorAddress.mockImplementation((id: string) =>
      id === WAITING.requestId ? new Promise((res) => (answerOld = res)) : Promise.resolve({ kind: "pending" }),
    );
    render();
    await submit();
    startCreatorAddress.mockResolvedValue({ ...WAITING, requestId: "6f0b2c1e-8d7a-4c3b-9e2f-1a2b3c4d5e6f" });
    await press(button("다시 보내기"));
    await act(async () => answerOld({ kind: "rejected" }));
    expect(host.querySelector('[role="timer"]')).not.toBeNull();
    expect(button("주소 다시 입력")).toBeUndefined();
  });

  it("INV-P22 ③ S22b (실패경로): 다시 보내기가 한도에 걸리면 서버 문구, 「다시 보내기」는 숨긴다", async () => {
    startCreatorAddress.mockResolvedValue(WAITING);
    checkCreatorAddress.mockResolvedValue({ kind: "rejected" });
    render();
    await submit();
    startCreatorAddress.mockResolvedValue({ kind: "refused", message: "오늘 보낼 수 있는 요청 횟수를 모두 사용했습니다. 내일 다시 요청해 주세요.", code: "too_many" });
    await press(button("다시 보내기"));
    expect(text()).toContain("오늘 보낼 수 있는 요청 횟수를 모두 사용했습니다.");
    expect(button("다시 보내기")).toBeUndefined();
    expect(button("주소 다시 입력")).toBeDefined();
  });

  it("INV-P22 ① S22d (실패경로): 연결 없음·한도는 기다림으로 가지 않고 서버 문구를 그대로 보인다", async () => {
    startCreatorAddress.mockResolvedValue({ kind: "refused", message: "카카오톡 인증 알림을 먼저 연결해 주세요. 크리에이터 설정에서 연결할 수 있습니다.", code: "not_linked" });
    render();
    await submit();
    expect(host.querySelector("[data-form]")).not.toBeNull();
    expect(text()).toContain("카카오톡 인증 알림을 먼저 연결해 주세요.");
    expect(host.querySelector('[role="timer"]')).toBeNull();
  });

  it("「주소 다시 입력」을 누르면 입력 폼으로 돌아간다", async () => {
    startCreatorAddress.mockResolvedValue(WAITING);
    checkCreatorAddress.mockResolvedValue({ kind: "rejected" });
    render();
    await submit();
    await press(button("주소 다시 입력"));
    expect(host.querySelector("[data-form]")).not.toBeNull();
  });

  it("기다리는 중 「취소」는 부르는 곳의 취소를 부르고 결과 묻기를 멈춘다 · 취소가 없는 자리(가입 4단계)에는 취소 버튼이 없다", async () => {
    startCreatorAddress.mockResolvedValue(WAITING);
    render();
    await submit();
    await press(button("취소"));
    expect(onCancel).toHaveBeenCalled();
    act(() => root.unmount());
    root = createRoot(host);
    render(false);
    await submit();
    expect(host.querySelector('[role="timer"]')).not.toBeNull();
    expect(button("취소")).toBeUndefined();
  });

  it("로그인이 풀리면(결과 확인) onLoginExpired 한 번 — 기다림을 끝내 더 묻지 않고 시계도 멈춘다", async () => {
    startCreatorAddress.mockResolvedValue(WAITING);
    checkCreatorAddress.mockResolvedValue({ kind: "login" });
    render();
    await submit();
    expect(onLoginExpired).toHaveBeenCalledTimes(1);
    const asked = checkCreatorAddress.mock.calls.length;
    await advance(10_000);
    expect(checkCreatorAddress.mock.calls.length).toBe(asked);
    expect(host.querySelector('[role="timer"]')).toBeNull();
  });

  it("화면이 사라진 뒤 늦게 온 「저장됨」 답으로는 onSaved 를 부르지 않는다(서버에는 저장됐다 — 다음에 화면을 열면 등록됨으로 보인다)", async () => {
    let answer: (v: unknown) => void = () => undefined;
    startCreatorAddress.mockResolvedValue(WAITING);
    checkCreatorAddress.mockImplementation(() => new Promise((res) => (answer = res)));
    render();
    await submit();
    act(() => root.unmount());
    await act(async () => answer({ kind: "saved" }));
    expect(onSaved).not.toHaveBeenCalled();
    root = createRoot(host);
  });

  it("「다시 보내기」가 전송 실패면 앞 요청으로 돌아가지 않고 끝남 — 「보내지 못했습니다」 한 가지 문구만", async () => {
    startCreatorAddress.mockResolvedValue(WAITING);
    render();
    await submit();
    startCreatorAddress.mockResolvedValue({ kind: "refused", message: "카카오톡 인증 요청을 보내지 못했습니다. 다시 요청해 주세요." });
    await press(button("다시 보내기"));
    await advance(4000);
    const alert = host.querySelector('[role="alert"]')?.textContent ?? "";
    expect(alert).toBe("카카오톡 인증 요청을 보내지 못했습니다. 다시 요청해 주세요.");
    expect(host.querySelector('[role="timer"]')).toBeNull();
    expect(button("다시 보내기")).toBeDefined();
  });

  it("끝난 화면에도 부르는 곳의 취소가 있으면 「취소」 — 가입 4단계(취소 없음)에는 없다", async () => {
    startCreatorAddress.mockResolvedValue(WAITING);
    checkCreatorAddress.mockResolvedValue({ kind: "rejected" });
    render();
    await submit();
    await press(button("취소"));
    expect(onCancel).toHaveBeenCalled();
    act(() => root.unmount());
    root = createRoot(host);
    render(false);
    await submit();
    expect(button("주소 다시 입력")).toBeDefined();
    expect(button("취소")).toBeUndefined();
  });

  it("결과 확인이 서버 오류(500)면 기다림을 끝내고 「서명 결과를 확인하지 못했습니다」 — 거절·실패로 단정하지 않는다", async () => {
    startCreatorAddress.mockResolvedValue(WAITING);
    checkCreatorAddress.mockResolvedValue({ kind: "error" });
    render();
    await submit();
    expect(host.querySelector('[role="alert"]')?.textContent).toBe("서명 결과를 확인하지 못했습니다.");
    expect(host.querySelector('[role="timer"]')).toBeNull();
  });
});
