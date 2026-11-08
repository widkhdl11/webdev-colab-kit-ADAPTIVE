import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// 역조공 받기 판 — 받기 때 받을 주소 입력 (reverse-gift INV-R4·R6, address-protection INV-P17 — 팬 등록 주소는 없다, 2026-11-08).
// 서버로 가는 받기·받지 않기와 주소 입력 칸(봉인)은 가짜로 둔다 — 시험 대상은 판의 단계와, 받기 요청이 그 선물 번호와 칸이 봉인한 값만 보내는지다.
const acceptRevgift = vi.fn();
const declineRevgift = vi.fn();
const refresh = vi.fn();
vi.mock("../api/reply-requests", () => ({
  acceptRevgift: (...a: unknown[]) => acceptRevgift(...a),
  declineRevgift: (...a: unknown[]) => declineRevgift(...a),
}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh, push: () => {} }) }));

import { ReceiveFlow, type ReceiveAddressStep } from "./receive-flow";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

if (typeof HTMLDialogElement !== "undefined" && !HTMLDialogElement.prototype.showModal) {
  HTMLDialogElement.prototype.showModal = function showModal(this: HTMLDialogElement) {
    this.setAttribute("open", "");
  };
  // 브라우저처럼 열려 있던 창을 닫으면 close 이벤트를 낸다(BottomSheet 는 onClose 를 이 이벤트로만 부른다)
  HTMLDialogElement.prototype.close = function close(this: HTMLDialogElement) {
    if (!this.hasAttribute("open")) return;
    this.removeAttribute("open");
    this.dispatchEvent(new Event("close"));
  };
}

let host: HTMLDivElement;
let root: Root;
beforeEach(() => {
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
  acceptRevgift.mockReset();
  declineRevgift.mockReset();
  refresh.mockReset();
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
});

const ORDER_NO = "RG-ABC123";
// 칸이 봉인한 값 — 받기 요청에 그대로 실려야 한다
const SEALED = { v: 1, alg: "RSA-OAEP-256+A256GCM", wrappedKey: "k", iv: "i", ciphertext: "c" } as const;

function render(canEnter = true) {
  const address: ReceiveAddressStep = {
    canEnter,
    missingKeyText: "주소 보호 설정이 아직 안 돼 있어요.",
    renderForm: (p) => (
      <div data-form="">
        <button
          type="button"
          onClick={async () => {
            const o = await p.send(SEALED as never);
            if (o.kind === "ok") p.onDone();
            else if (o.kind === "refused") host.setAttribute("data-refused", o.message);
          }}
        >
          가짜 봉인 후 받기
        </button>
        <button type="button" onClick={p.onCancel}>
          가짜 돌아가기
        </button>
      </div>
    ),
  };
  act(() =>
    root.render(
      <ReceiveFlow
        orderNo={ORDER_NO}
        creatorName="하루"
        tierName="소"
        tierRule="가로·세로·높이 합 80cm 이하"
        stage="waiting"
        daysLeftText="5일 남음"
        deadlineText="10월 22일까지 정해 주세요"
        address={address}
        todo
      />,
    ),
  );
}
const button = (text: string) => [...host.querySelectorAll("button, a")].find((b) => b.textContent?.trim() === text) as HTMLElement | undefined;
const click = async (text: string) => {
  const b = button(text);
  if (!b) throw new Error(`버튼 없음: ${text}`);
  await act(async () => b.click());
};
const stepHead = () => host.querySelector("#rv-step-title")?.textContent;

describe("받기 — 그 자리에서 받을 주소 입력 (INV-R4·R5·R6, INV-P17)", () => {
  it("INV-R4 S4: 받기를 누르면 「받을 주소 입력」과 입력 칸 — 칸이 봉인한 값과 선물 번호만 받기로 보내고 수락 완료가 된다", async () => {
    acceptRevgift.mockResolvedValue({ ok: true });
    render();
    await click("받기");
    expect(stepHead()).toBe("받을 주소 입력");
    expect(host.querySelector("[data-form]")).not.toBeNull();
    expect(host.querySelector("[data-address-on-file]")).toBeNull();
    await click("가짜 봉인 후 받기");
    expect(acceptRevgift.mock.calls).toEqual([[ORDER_NO, SEALED]]);
    expect(host.textContent).toContain("선물 수락 완료");
  });

  it("INV-R6 S6: 등록 주소를 확인하는 판·「이 주소로 받기」·「주소 변경」은 없다 — 받을 때마다 입력한다", async () => {
    render();
    await click("받기");
    expect(button("이 주소로 받기")).toBeUndefined();
    expect(button("주소 변경")).toBeUndefined();
  });

  it("INV-R4 (실패경로): 서버가 거부하면 그 문구를 칸에 돌려주고 받기는 끝나지 않는다 — 이미 정해진 선물이면 다시 읽는다", async () => {
    acceptRevgift.mockResolvedValue({ ok: false, status: 409, message: "이미 수락 여부를 선택했거나 기한이 지난 선물입니다." });
    render();
    await click("받기");
    await click("가짜 봉인 후 받기");
    expect(host.getAttribute("data-refused")).toBe("이미 수락 여부를 선택했거나 기한이 지난 선물입니다.");
    expect(host.textContent).not.toContain("선물 수락 완료");
    expect(refresh).toHaveBeenCalled();
  });

  it("INV-R4 (실패경로): 입력을 그만두면 판이 닫히고 받기·받지 않기로 돌아간다", async () => {
    render();
    await click("받기");
    await click("가짜 돌아가기");
    expect(stepHead()).toBeUndefined();
    expect(button("받기")).toBeDefined();
  });

  it("INV-R5 (실패경로): 봉인 공개키가 없으면 받기 버튼 대신 안내", () => {
    render(false);
    expect(button("받기")).toBeUndefined();
    expect(host.textContent).toContain("주소 보호 설정이 아직 안 돼 있어요.");
  });
});

describe("끝난 역조공의 결과 (office-workflow INV-W15)", () => {
  function renderSettled(stage: "returned" | "disposed") {
    act(() =>
      root.render(
        <ReceiveFlow
          orderNo={ORDER_NO}
          creatorName="하루"
          tierName="소"
          tierRule="가로·세로·높이 합 80cm 이하"
          stage={stage}
          daysLeftText="5일 남음"
          deadlineText="10월 22일까지 정해 주세요"
          address={{ canEnter: true, missingKeyText: "", renderForm: () => null }}
          todo={false}
        />,
      ),
    );
  }

  it("INV-W15: 처분된 몫은 「상자 처분 완료」 — 크리에이터에게 돌려보냈다는 말이 없다", () => {
    renderSettled("disposed");
    expect(host.querySelector("#rv-result-title")?.textContent).toBe("상자 처분 완료");
    expect(host.textContent).not.toContain("반송");
  });

  it("INV-W15 (실패경로): 반송된 몫은 그대로 「반송 완료」", () => {
    renderSettled("returned");
    expect(host.querySelector("#rv-result-title")?.textContent).toBe("반송 완료");
    expect(host.textContent).toContain("하루님에게 상자가 반송되었습니다.");
  });
});

describe("받기 칸은 「지금 할 일」 칸 안에만 (action-center INV-J13)", () => {
  function renderWaiting(todo: boolean) {
    act(() =>
      root.render(
        <ReceiveFlow
          orderNo={ORDER_NO}
          creatorName="하루"
          tierName="소"
          tierRule="가로·세로·높이 합 80cm 이하"
          stage="waiting"
          daysLeftText="5일 남음"
          deadlineText="10월 22일까지 정해 주세요"
          address={{ canEnter: true, missingKeyText: "", renderForm: () => null }}
          todo={todo}
        />,
      ),
    );
  }

  it("INV-J13: 처리할 일 읽기 결과에 있는 몫이면 받기·받지 않기가 #todo 칸 안에 있다", () => {
    renderWaiting(true);
    const box = host.querySelector("#todo");
    expect(box?.querySelector("h2")?.textContent).toBe("선물 수락 여부 선택");
    expect([...(box?.querySelectorAll("button") ?? [])].map((b) => b.textContent)).toEqual(["받기", "받지 않기"]);
  });

  it("INV-J13 (실패경로): 읽기 결과에 없으면 기다리는 중이어도 칸도 받기 버튼도 없다 — 화면이 따로 계산하지 않는다", () => {
    renderWaiting(false);
    expect(host.querySelector("#todo")).toBeNull();
    expect([...host.querySelectorAll("button")].map((b) => b.textContent)).not.toContain("받기");
    expect(host.textContent).toContain("5일 남음");
  });
});
