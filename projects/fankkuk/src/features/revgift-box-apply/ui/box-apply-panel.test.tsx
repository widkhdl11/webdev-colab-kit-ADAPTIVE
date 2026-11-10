import { act, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { FanBox } from "@/entities/revgift-box/api/box-reads";

// 팬 신청 판·신청 모달 (revgift-box INV-GB4·GB5·GB6·GB9, 정할 것 Q5·Q6). 서버로 가는 신청·신청 취소와 주소 칸(봉인)은 가짜로 둔다 —
// 시험 대상은 상태마다 보이는 것과, 신청 요청이 선물함·토큰과 칸이 봉인한 값·구분만 보내는지다(INV-GB6 — 팬 등록 주소는 없다, 2026-11-08).
const sendApply = vi.fn();
const sendWithdraw = vi.fn();
const sendReceived = vi.fn();
const refresh = vi.fn();
const seal = vi.fn();
vi.mock("../api/apply-requests", () => ({
  sendApply: (...a: unknown[]) => sendApply(...a),
  sendWithdraw: (...a: unknown[]) => sendWithdraw(...a),
  sendReceived: (...a: unknown[]) => sendReceived(...a),
}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh, push: () => {} }) }));

type Name = "zipCode" | "address1" | "address2" | "recipientName" | "phone";
const EMPTY: Record<Name, string> = { zipCode: "", address1: "", address2: "", recipientName: "", phone: "" };
/** 가짜 주소 칸 — 묶음 검사는 진짜와 같은 모양(빈 필수 칸이면 그 묶음에서 막힌다), 봉인은 seal 가짜가 돌려준다 */
vi.mock("@/entities/address/ui/fan-address-fields", () => ({
  useFanAddressEntry: () => {
    const [values, setValues] = useState<Record<Name, string>>(EMPTY);
    const input = (n: Name) => <input key={n} data-field={n} value={values[n]} onChange={(e) => setValues((v) => ({ ...v, [n]: e.target.value }))} />;
    return {
      values,
      placeFields: <>{(["zipCode", "address1", "address2"] as const).map(input)}</>,
      personFields: <>{(["recipientName", "phone"] as const).map(input)}</>,
      check: (groups: readonly ("place" | "person")[]) =>
        groups.every((g) => (g === "place" ? values.zipCode !== "" && values.address1 !== "" : values.recipientName !== "" && values.phone !== "")),
      seal: () => seal(values),
      clear: () => setValues(EMPTY),
      focusFirst: () => {},
    };
  },
}));

import { BoxApplyPanel, type ApplyAddressKey } from "./box-apply-panel";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

if (typeof HTMLDialogElement !== "undefined" && !HTMLDialogElement.prototype.showModal) {
  HTMLDialogElement.prototype.showModal = function showModal(this: HTMLDialogElement) {
    this.setAttribute("open", "");
  };
  HTMLDialogElement.prototype.close = function close(this: HTMLDialogElement) {
    if (!this.hasAttribute("open")) return;
    this.removeAttribute("open");
    this.dispatchEvent(new Event("close"));
  };
}

const BOX: FanBox = {
  id: "8b0c2f9e-1f7a-4c1e-9a55-3f0c1d2e4a10",
  name: "겨울 선물",
  creator: { id: "00000000-0000-4000-b000-000000000001", slug: "haru", name: "하루" },
  open: true,
  viewer: "follower",
  myState: "none",
  waitlistNo: null,
  delivery: null,
};
/** 화면을 그린 서버 시각 — 서울 11월 12일 낮 */
const NOW = "2026-11-12T03:00:00.000Z";

const SEALED = { v: 1, alg: "RSA-OAEP-256+A256GCM", wrappedKey: "k", iv: "i", ciphertext: "c" } as const;
const KEY: ApplyAddressKey = { accountId: "00000000-0000-4000-b000-000000000009", sealingKeyPem: "pem" };

let host: HTMLDivElement;
let root: Root;
beforeEach(() => {
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
  for (const f of [sendApply, sendWithdraw, sendReceived, refresh, seal]) f.mockReset();
  seal.mockResolvedValue({ kind: "ok", envelope: SEALED, classified: "jeju" });
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
});

let mount = 0;
/** 부를 때마다 새로 그린다(앞 상태를 이어받지 않게). same 이면 같은 판에 새 값만 준다(신청 뒤 다시 읽기) */
function render(box: Partial<FanBox>, addressKey: ApplyAddressKey = KEY, token: string | null = null, same = false) {
  if (!same) mount += 1;
  act(() =>
    root.render(
      <BoxApplyPanel
        key={mount}
        box={{ ...BOX, ...box }}
        token={token}
        addressKey={addressKey}
        missingKeyText="열쇠 없음"
        followSlot={<button type="button">팔로우</button>}
        now={NOW}
        deliverySource="estimate"
      />,
    ),
  );
}
/** 글자가 있는 버튼(확인 창의 닫기 아이콘 버튼은 뺀다) */
const buttons = () => [...host.querySelectorAll("button")].map((b) => b.textContent).filter((x) => x);
const btn = (text: string) => [...host.querySelectorAll("button")].find((b) => b.textContent === text && !b.closest("[role=alertdialog]"))!;
const type = (n: Name, v: string) => {
  const el = host.querySelector<HTMLInputElement>(`[data-field=${n}]`)!;
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!;
  act(() => {
    setter.call(el, v);
    el.dispatchEvent(new Event("input", { bubbles: true }));
  });
};
async function fillAndConfirm() {
  await act(async () => btn("선물함 신청").click());
  type("zipCode", "06236");
  type("address1", "서울특별시 강남구 테헤란로 152");
  type("address2", "11층");
  await act(async () => btn("다음").click());
  type("recipientName", "김하늘");
  type("phone", "010-1234-5678");
  await act(async () => btn("다음").click());
}
const xButton = () => host.querySelector("dialog[open] button[aria-label=닫기]") as HTMLButtonElement;

describe("팬 신청 판", () => {
  it("INV-GB6 S6: 페이지에는 버튼 하나 — 빈 칸이면 다음 단계로 가지 않는다", async () => {
    render({});
    expect(buttons()).toEqual(["선물함 신청"]);
    expect(host.querySelector("[data-field]")).toBeNull();
    await act(async () => btn("선물함 신청").click());
    expect(host.textContent).toContain("1/3 받을 주소");
    await act(async () => btn("다음").click());
    expect(host.textContent).toContain("1/3 받을 주소");
  });

  it("INV-GB6 S6: 모달 3단계(받을 주소→받는 분→확인) 뒤 칸이 봉인한 값·구분과 선물함·토큰만 보내고 다시 읽는다", async () => {
    sendApply.mockResolvedValue({ ok: true });
    render({}, KEY, "t".repeat(32));
    await fillAndConfirm();
    expect(host.textContent).toContain("3/3 확인");
    expect(host.textContent).toContain("서울특별시 강남구 테헤란로 152…");
    expect(host.textContent).toContain("010-****-5678");
    expect(sendApply).not.toHaveBeenCalled();
    await act(async () => btn("신청").click());
    expect(sendApply.mock.calls).toEqual([[BOX.id, "t".repeat(32), SEALED, "jeju"]]);
    expect(refresh).toHaveBeenCalled();
    // 다시 읽은 뒤(신청함) — 같은 판에서 완료 창이 이어진다
    render({ myState: "applied" }, KEY, "t".repeat(32), true);
    expect(host.querySelector("dialog[open] h2")!.textContent).toBe("신청했습니다");
  });

  it("INV-GB5·GB9: 정원이 차 대기로 들어가면 완료 창과 페이지에 자기 순번만 — 「대기 N번입니다.」", async () => {
    sendApply.mockResolvedValue({ ok: true });
    render({});
    await fillAndConfirm();
    await act(async () => btn("신청").click());
    render({ myState: "waitlisted", waitlistNo: 3 }, KEY, null, true);
    expect(host.querySelector("dialog[open] h2")!.textContent).toBe("대기 3번입니다.");
    const close = [...host.querySelectorAll("dialog[open] button")].find((b) => b.textContent === "닫기") as HTMLButtonElement;
    await act(async () => close.click());
    expect(host.querySelector("dialog[open]")).toBeNull();
    expect(host.textContent).toContain("대기 3번입니다.");
    expect(host.textContent).not.toMatch(/[0-9]+명/);
  });

  it("INV-GB6 (실패경로): 서버가 거부하면 3/3 에 그 문구와 「다시 신청」, 마감·다 참이면 다시 읽는다", async () => {
    sendApply.mockResolvedValue({ ok: false, status: 409, message: "신청을 마감한 선물함입니다." });
    render({});
    await fillAndConfirm();
    await act(async () => btn("신청").click());
    expect(host.querySelector("dialog [role=alert]")!.textContent).toBe("신청을 마감한 선물함입니다.");
    expect(buttons()).toContain("다시 신청");
    expect(refresh).toHaveBeenCalled();
  });

  it("INV-GB6 (실패경로): 봉인에 실패하면 보내지 않는다", async () => {
    seal.mockResolvedValue({ kind: "error", message: "주소를 다시 확인해 주세요." });
    render({});
    await fillAndConfirm();
    await act(async () => btn("신청").click());
    expect(sendApply).not.toHaveBeenCalled();
    expect(host.querySelector("dialog [role=alert]")!.textContent).toBe("주소를 다시 확인해 주세요.");
  });

  it("입력이 있는데 닫으면 「입력한 내용을 지울까요?」 — 계속 쓰기는 그대로, 지우기는 창을 닫는다", async () => {
    render({});
    await act(async () => btn("선물함 신청").click());
    type("address1", "서울");
    await act(async () => xButton().click());
    expect(host.querySelector("[role=alertdialog][open]")).not.toBeNull();
    const keep = [...host.querySelectorAll("[role=alertdialog] button")].find((b) => b.textContent === "계속 쓰기") as HTMLButtonElement;
    await act(async () => keep.click());
    expect(host.querySelector("[role=alertdialog][open]")).toBeNull();
    expect(host.querySelector<HTMLInputElement>("[data-field=address1]")!.value).toBe("서울");
    await act(async () => xButton().click());
    const erase = [...host.querySelectorAll("[role=alertdialog] button")].find((b) => b.textContent === "지우기") as HTMLButtonElement;
    await act(async () => erase.click());
    expect(host.querySelector("[data-field]")).toBeNull();
  });

  it("INV-GB6 (실패경로): 봉인 공개키가 없으면 신청 버튼 대신 안내", () => {
    render({}, null);
    expect(buttons()).toEqual([]);
    expect(host.textContent).toContain("열쇠 없음");
  });

  it("INV-GB4 S4b: 팔로우하지 않은 팬에게는 안내와 팔로우 버튼만 — 신청 폼이 열리지 않는다", () => {
    render({ viewer: "not_follower" });
    expect(host.textContent).toContain("팔로우한 팬만 신청할 수 있습니다.");
    expect(buttons()).toEqual(["팔로우"]);
    expect(host.querySelector("[data-address-form]")).toBeNull();
  });

  it("INV-GB9 S9c · Q6: 신청 뒤에는 「신청했습니다」와 신청 취소뿐, 마감 뒤에는 담긴 팬만 「준비」 — 다른 신청자 수는 없다", () => {
    render({ myState: "applied" });
    expect(host.textContent).toContain("신청했습니다.");
    expect(buttons()).toEqual(["신청 취소", "닫기", "신청 취소"]);
    expect(host.textContent).not.toMatch(/[0-9]+명/);
    render({ myState: "preparing", open: false });
    expect(host.textContent).toBe("선물이 준비되고 있어요.");
    render({ myState: "closed", open: false });
    expect(host.textContent).toBe("이번 선물함은 마감됐어요.");
    render({ myState: "none", open: false });
    expect(host.textContent).toBe("이번 선물함은 마감됐어요.");
  });

  it("Q5: 신청 취소는 확인 창의 「신청 취소」를 눌러야 보낸다", async () => {
    sendWithdraw.mockResolvedValue({ ok: true });
    render({ myState: "applied" });
    const all = [...host.querySelectorAll("button")].filter((b) => b.textContent === "신청 취소");
    const [open, confirm] = all;
    await act(async () => open.click());
    expect(sendWithdraw).not.toHaveBeenCalled();
    await act(async () => confirm.click());
    expect(sendWithdraw).toHaveBeenCalledWith(BOX.id);
  });

  it("로그인 안 함·크리에이터 계정·주인에게는 신청 폼이 없다", () => {
    render({ viewer: "guest" });
    expect(host.querySelector("a")?.getAttribute("href")).toBe(`/login?next=${encodeURIComponent(`/gift-boxes/${BOX.id}`)}`);
    render({ viewer: "not_fan" });
    expect(host.textContent).toBe("팬 계정만 신청할 수 있습니다.");
    render({ viewer: "owner" });
    expect(host.querySelector("a")?.getAttribute("href")).toBe(`/creator/revgift-boxes/${BOX.id}`);
  });
});

describe("선물함 선물의 배송 단계 — 받는 쪽은 팬 (delivery-status INV-DS1·DS2·DS6)", () => {
  const stageText = () => host.querySelector("[data-delivery-stage]")?.textContent ?? null;

  it("INV-DS6: 송장 출력 전(배송 없음)은 그대로 「선물이 준비되고 있어요.」", () => {
    render({ myState: "preparing", open: false, delivery: null });
    expect(host.textContent).toBe("선물이 준비되고 있어요.");
  });

  it("INV-DS1: 송장 출력만 → 「팬꾹에서 보냈어요」, [받았어요] 없음(출고 전)", () => {
    render({ myState: "preparing", open: false, delivery: { shippedOn: null, received: false, canConfirm: false, carrier: null } });
    expect(stageText()).toBe("팬꾹에서 보냈어요");
    expect(buttons()).toEqual([]);
  });

  it("INV-DS1: 출고 다음 날 → 「보통 1~2일 안에 도착해요」, 출고 + 3일 → 「도착했어요(예상)」 흐리게", () => {
    render({ myState: "preparing", open: false, delivery: { shippedOn: "2026-11-11", received: false, canConfirm: true, carrier: null } });
    expect(stageText()).toBe("보통 1~2일 안에 도착해요");
    render({ myState: "preparing", open: false, delivery: { shippedOn: "2026-11-09", received: false, canConfirm: true, carrier: null } });
    expect(stageText()).toBe("도착했어요(예상)");
    expect(host.querySelector("[data-delivery-stage]")!.className).toMatch(/estimated/);
  });

  it("INV-DS2·DS6: [받았어요]를 누르면 선물함 ID 만 보내고 다시 읽는다 — 확인이 있으면 「도착했어요」, 버튼 없음", async () => {
    sendReceived.mockResolvedValue({ ok: true });
    render({ myState: "preparing", open: false, delivery: { shippedOn: "2026-11-11", received: false, canConfirm: true, carrier: null } });
    const btn = [...host.querySelectorAll("button")].find((b) => b.textContent === "받았어요")!;
    await act(async () => btn.click());
    expect(sendReceived.mock.calls).toEqual([[BOX.id]]);
    expect(refresh).toHaveBeenCalled();
    render({ myState: "preparing", open: false, delivery: { shippedOn: "2026-11-09", received: true, canConfirm: false, carrier: null } });
    expect(stageText()).toBe("도착했어요");
    expect(host.querySelector("[data-delivery-stage]")!.className).not.toMatch(/estimated/);
    expect(buttons()).toEqual([]);
  });

  it("INV-DS2 (실패경로): 서버가 거부하면 문구를 보이고 다시 읽지 않는다", async () => {
    sendReceived.mockResolvedValue({ ok: false, status: 409, message: "아직 발송되지 않은 선물입니다." });
    render({ myState: "preparing", open: false, delivery: { shippedOn: "2026-11-11", received: false, canConfirm: true, carrier: null } });
    await act(async () => [...host.querySelectorAll("button")].find((b) => b.textContent === "받았어요")!.click());
    expect(host.querySelector("[role=alert]")!.textContent).toBe("아직 발송되지 않은 선물입니다.");
    expect(refresh).not.toHaveBeenCalled();
  });
});
