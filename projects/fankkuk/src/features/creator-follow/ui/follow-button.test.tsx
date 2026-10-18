import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { FollowButton } from "./follow-button";

// 크리에이터 카드 아래 띠의 팔로우 갈래(variant="card") — 2026-10-18 사용자 「팔로우가 안 돼 있을 땐 팔로우 버튼만,
// 팔로우 상태에서만 선물 보내기와 팔로우 취소 버튼」. 카드 밖(row·profile) 버튼 모양·문구는 그대로.

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }) }));
const saveFollow = vi.fn();
vi.mock("../api/save-follow", () => ({ saveFollow: (...args: unknown[]) => saveFollow(...args) }));

const ID = "00000000-0000-4000-b000-000000000002";

function dom(html: string): HTMLElement {
  return new DOMParser().parseFromString(`<div>${html}</div>`, "text/html").body;
}
/** 띠에 놓이는 버튼·링크(보이는 것만 — 저장 실패 알림·확인 창 제외) */
function cardButtons(host: Element) {
  return Array.from(host.querySelectorAll<HTMLElement>("[data-card-btn]"));
}

describe("카드 띠 팔로우 — 팔로우 상태별 버튼 구성", () => {
  it("팔로우 안 함: 「팔로우」 하나(주 버튼, 하트 더하기 아이콘) — 선물 보내기 없음", () => {
    const host = dom(renderToStaticMarkup(<FollowButton creatorId={ID} creatorName="모모" initialFollowing={false} variant="card" mode="save" />));
    const btns = cardButtons(host);
    expect(btns.map((b) => [b.textContent, b.dataset.cardBtn])).toEqual([["팔로우", "main"]]);
    const svg = btns[0]!.querySelector("svg");
    expect(svg?.getAttribute("aria-hidden")).toBe("true");
    expect(svg?.getAttribute("data-icon")).toBe("heart-plus");
    expect(host.textContent).not.toContain("선물 보내기");
  });

  it("로그인 전: 「팔로우」 하나가 로그인으로 간다", () => {
    const host = dom(renderToStaticMarkup(<FollowButton creatorId={ID} creatorName="모모" initialFollowing={false} variant="card" mode="login" />));
    const btns = cardButtons(host);
    expect(btns.length).toBe(1);
    expect(btns[0]!.tagName).toBe("A");
    expect(btns[0]!.getAttribute("href")).toBe("/login");
    expect(btns[0]!.textContent).toBe("팔로우");
    expect(btns[0]!.querySelector("svg[data-icon='heart-plus']")).not.toBeNull();
  });

  it("팔로우 중: 왼쪽 「선물 보내기」(주, 선물 상자, 그 크리에이터를 고른 화면) · 오른쪽 「팔로우 취소」(보조, 하트 끄기)", () => {
    const host = dom(renderToStaticMarkup(<FollowButton creatorId={ID} creatorName="모모" initialFollowing variant="card" mode="save" />));
    const btns = cardButtons(host);
    // DOM 순서 = 보이는 순서 = 키보드 순서(2026-10-18 사용자 「선물하기 버튼이랑 취소버튼 순서 반대로」)
    expect(btns.map((b) => [b.textContent, b.dataset.cardBtn])).toEqual([
      ["선물 보내기", "main"],
      ["팔로우 취소", "sub"],
    ]);
    expect(btns[0]!.querySelector("svg[data-icon='gift']")?.getAttribute("aria-hidden")).toBe("true");
    expect(btns[0]!.getAttribute("href")).toBe(`/gifts/new?creator=${ID}`);
    expect(btns[1]!.querySelector("svg[data-icon='heart-off']")?.getAttribute("aria-hidden")).toBe("true");
    // 「팔로우 취소」는 늘 아이콘만(2026-10-18 「로그인 후 팔로우 취소는 아이콘만」) — 글자는 화면 낭독기용, 마우스를 올리면 title
    expect(btns[1]!.getAttribute("title")).toBe("팔로우 취소");
    expect(btns[1]!.querySelector(".sr-only")?.textContent).toBe("팔로우 취소");
    expect(btns[1]!.getAttribute("aria-label")).toBe("모모 팔로우 취소");
  });

  it("카드 밖(row·profile)은 그대로 — 「팔로우」「팔로우 중」 글자, 아이콘·선물 보내기 없음", () => {
    for (const variant of ["row", "profile"] as const) {
      for (const following of [false, true]) {
        const host = dom(renderToStaticMarkup(<FollowButton creatorId={ID} creatorName="모모" initialFollowing={following} variant={variant} mode="save" />));
        const btn = host.querySelector("button")!;
        expect(btn.textContent).toBe(following ? "팔로우 중" : "팔로우");
        expect(host.querySelector("svg, [data-card-btn]")).toBeNull();
        expect(host.textContent).not.toContain("선물 보내기");
      }
    }
  });
});

describe("카드 띠 팔로우 — 누르면 그 자리에서 바뀐다", () => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  let host: HTMLDivElement;
  let root: Root;
  beforeEach(() => {
    saveFollow.mockReset();
    saveFollow.mockResolvedValue("ok");
    // jsdom 에는 <dialog>.showModal·close 가 없다 — 브라우저처럼 열고, 닫을 때 close 이벤트를 보내 초점 복귀(onClose)까지 돌게 한다
    const proto = HTMLDialogElement.prototype as unknown as Record<"showModal" | "close", (this: HTMLDialogElement) => void>;
    proto.showModal = function () {
      this.setAttribute("open", "");
    };
    proto.close = function () {
      if (!this.hasAttribute("open")) return;
      this.removeAttribute("open");
      this.dispatchEvent(new Event("close"));
    };
    host = document.createElement("div");
    document.body.append(host);
    root = createRoot(host);
  });
  afterEach(() => {
    act(() => root.unmount());
    host.remove();
  });

  it("「팔로우」 → 「선물 보내기」+「팔로우 취소」 → 확인 창(닫으면 초점 복귀) → 「취소하기」 → 다시 「팔로우」 하나", async () => {
    await act(async () => root.render(<FollowButton creatorId={ID} creatorName="모모" initialFollowing={false} variant="card" mode="save" />));
    await act(async () => cardButtons(host)[0]!.click());
    expect(saveFollow).toHaveBeenLastCalledWith(ID, true);
    expect(cardButtons(host).map((b) => b.textContent)).toEqual(["선물 보내기", "팔로우 취소"]);
    const unfollowBtn = cardButtons(host)[1]!;
    unfollowBtn.focus();
    await act(async () => unfollowBtn.click());
    // 확인 창을 거친다 — 아직 끊지 않았다
    expect(saveFollow).toHaveBeenCalledTimes(1);
    // 「계속 팔로우」로 닫으면 초점은 창을 연 「팔로우 취소」로 돌아온다
    const keep = Array.from(host.querySelectorAll("dialog button")).find((b) => b.textContent === "계속 팔로우") as HTMLButtonElement;
    await act(async () => keep.click());
    expect(document.activeElement).toBe(unfollowBtn);
    await act(async () => unfollowBtn.click());
    const confirm = Array.from(host.querySelectorAll("dialog button")).find((b) => b.textContent === "취소하기") as HTMLButtonElement;
    await act(async () => confirm.click());
    expect(saveFollow).toHaveBeenLastCalledWith(ID, false);
    expect(cardButtons(host).map((b) => b.textContent)).toEqual(["팔로우"]);
  });

  it("팔로우를 누르면 초점이 「선물 보내기」로, 팔로우 취소를 확정하면 「팔로우」로 옮겨 간다(누른 버튼이 사라져도 초점을 잃지 않게)", async () => {
    await act(async () => root.render(<FollowButton creatorId={ID} creatorName="모모" initialFollowing={false} variant="card" mode="save" />));
    cardButtons(host)[0]!.focus();
    await act(async () => cardButtons(host)[0]!.click());
    expect(document.activeElement?.textContent).toBe("선물 보내기");
    await act(async () => cardButtons(host)[1]!.click());
    const confirm = Array.from(host.querySelectorAll("dialog button")).find((b) => b.textContent === "취소하기") as HTMLButtonElement;
    await act(async () => confirm.click());
    expect(document.activeElement).toBe(cardButtons(host)[0]);
    expect(document.activeElement?.textContent).toBe("팔로우");
  });

  it("(실패경로) 저장하는 동안 「선물 보내기」는 누를 수 없다(aria-disabled · 이동 막음), 끝나면 풀린다", async () => {
    let finish: (v: string) => void = () => {};
    saveFollow.mockImplementation(() => new Promise((r) => (finish = r)));
    await act(async () => root.render(<FollowButton creatorId={ID} creatorName="모모" initialFollowing={false} variant="card" mode="save" />));
    await act(async () => cardButtons(host)[0]!.click());
    const gift = cardButtons(host)[0]!;
    expect(gift.getAttribute("aria-disabled")).toBe("true");
    const ev = new MouseEvent("click", { bubbles: true, cancelable: true });
    gift.dispatchEvent(ev);
    expect(ev.defaultPrevented).toBe(true);
    await act(async () => finish("ok"));
    expect(cardButtons(host)[0]!.hasAttribute("aria-disabled")).toBe(false);
  });

  it("팔로우 취소가 저장되면 onUnfollowed 를 부른다(팔로우한 크리에이터 목록에서 빼기) · (실패경로) 실패하면 부르지 않고 두 버튼으로 돌아온다", async () => {
    const onUnfollowed = vi.fn();
    await act(async () => root.render(<FollowButton creatorId={ID} creatorName="모모" initialFollowing variant="card" mode="save" onUnfollowed={onUnfollowed} />));
    const unfollowOnce = async () => {
      await act(async () => cardButtons(host)[1]!.click());
      const confirm = Array.from(host.querySelectorAll("dialog button")).find((b) => b.textContent === "취소하기") as HTMLButtonElement;
      await act(async () => confirm.click());
    };
    saveFollow.mockResolvedValueOnce("failed");
    await unfollowOnce();
    expect(onUnfollowed).not.toHaveBeenCalled();
    expect(cardButtons(host).map((b) => b.textContent)).toEqual(["선물 보내기", "팔로우 취소"]);
    await unfollowOnce();
    expect(onUnfollowed).toHaveBeenCalledTimes(1);
  });

  it("(실패경로) 카드 띠에서 저장이 실패하면 화면에도 보이는 문구 한 줄 — 알림 칸은 하나(두 번 읽히지 않게), 버튼은 원래대로", async () => {
    await act(async () => root.render(<FollowButton creatorId={ID} creatorName="모모" initialFollowing={false} variant="card" mode="save" />));
    const regions = () => Array.from(host.querySelectorAll<HTMLElement>("[role='status'], [role='alert']"));
    expect(regions().length).toBe(1);
    expect(regions()[0]!.textContent).toBe("");
    saveFollow.mockResolvedValueOnce("failed");
    await act(async () => cardButtons(host)[0]!.click());
    expect(regions().length).toBe(1);
    const msg = regions()[0]!;
    expect(msg.textContent).toBe("팔로우를 저장하지 못했어요. 잠시 뒤 다시 눌러 주세요.");
    // 화면에 보이는 칸 — 화면 낭독기 전용(sr) 모양이 아니다
    expect(msg.hasAttribute("data-card-notice")).toBe(true);
    expect(cardButtons(host).map((b) => b.textContent)).toEqual(["팔로우"]);
    // 다시 누르면 문구가 지워진다
    await act(async () => cardButtons(host)[0]!.click());
    expect(regions()[0]!.textContent).toBe("");
  });
});
