import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { ADMIN_ACCESS_LOG_LIMIT, type AdminAccessEntry } from "@/entities/address/api/admin-access-log";
import { REVGIFT_ACCESS_DENY_TEXT } from "@/entities/address/ui/access-log-text";
import a from "@/shared/ui/admin.module.css";
import { AccessLogPanel } from "./access-log-panel";

// 관리자 「주소 열람 기록」 — INV-P7(2026-10-12 문제집 D12): 거부된 시도와 대표·직원 구분은 운영자 화면에만 있다.

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

const render = (entries: readonly AdminAccessEntry[]) => act(() => root.render(<AccessLogPanel entries={entries} />));
const rowsOf = () => [...host.querySelectorAll("tbody tr")].map((tr) => [...tr.querySelectorAll("td")].slice(1).map((td) => td.textContent));

describe("INV-P7 (D12): 운영자 내부 열람 기록 화면", () => {
  it("INV-P7 (D12): 직원 거절 줄은 「대표 아님 · 닉네임」과 C1 문구로, 대표의 연 줄은 「대표 · 닉네임」과 몇 번째로", () => {
    render([
      { at: "2026-10-12T06:00:00.000Z", target: "gift", orderNo: "FC-4T7NX", requester: "other", requesterNickname: "팬꾹 직원", result: { kind: "denied", reason: "not_owner" } },
      { at: "2026-10-12T05:50:00.000Z", target: "gift", orderNo: "FC-4T7NX", requester: "owner", requesterNickname: "팬꾹 운영", result: { kind: "opened", printNo: 2, released: false } },
      { at: "2026-10-12T05:40:00.000Z", target: "revgift", orderNo: "RG-AB12CD0", requester: "owner", requesterNickname: null, result: { kind: "denied", reason: "no_valid_approval" } },
      { at: "2026-10-12T05:30:00.000Z", target: "gift", orderNo: "FC-9QW2E", requester: "owner", requesterNickname: "팬꾹 운영", result: { kind: "denied", reason: "no_valid_approval" } },
    ]);
    expect(rowsOf()).toEqual([
      ["팬 선물", "FC-4T7NX", "대표 아님 · 팬꾹 직원", "거절", "권한이 없는 계정이라 열리지 않았어요"],
      ["팬 선물", "FC-4T7NX", "대표 · 팬꾹 운영", "열림", "재출력 2번째"],
      ["역조공", "RG-AB12CD0", "대표", "거절", "받기로 하며 입력한 주소가 없어 열리지 않았어요"],
      ["팬 선물", "FC-9QW2E", "대표 · 팬꾹 운영", "거절", "승인 서명이 확인되지 않아 열리지 않았어요"],
    ]);
  });

  it("INV-P7 · P18: 반송 송장의 주소 열기 줄은 「반송」으로, 확인 전 거부는 「반송 주소 확인 전」 문구로", () => {
    render([
      { at: "2026-10-17T06:00:00.000Z", target: "return", orderNo: "FC-4T7NX", requester: "owner", requesterNickname: "팬꾹 운영", result: { kind: "denied", reason: "no_valid_approval" } },
      { at: "2026-10-17T05:50:00.000Z", target: "return", orderNo: "RG-AB12CD0", requester: "owner", requesterNickname: "팬꾹 운영", result: { kind: "opened", printNo: 1, released: false } },
    ]);
    expect(rowsOf()).toEqual([
      ["반송", "FC-4T7NX", "대표 · 팬꾹 운영", "거절", "반송 주소 확인 전이라 열리지 않았어요"],
      ["반송", "RG-AB12CD0", "대표 · 팬꾹 운영", "열림", "첫 출력"],
    ]);
  });

  it("D12 반영: 결과 배지는 상태 4색 — 거절 빨강(tagDanger)·열림 파랑(tagInfo)", () => {
    render([
      { at: "2026-10-12T06:00:00.000Z", target: "gift", orderNo: "FC-4T7NX", requester: "other", requesterNickname: "팬꾹 직원", result: { kind: "denied", reason: "not_owner" } },
      { at: "2026-10-12T05:50:00.000Z", target: "gift", orderNo: "FC-4T7NX", requester: "owner", requesterNickname: "팬꾹 운영", result: { kind: "opened", printNo: 1, released: false } },
    ]);
    const tags = [...host.querySelectorAll("tbody tr")].map((tr) => tr.querySelectorAll("td")[4]?.querySelector("span"));
    expect(a.tagDanger).toBeTruthy();
    expect(a.tagInfo).toBeTruthy();
    expect(tags[0]?.classList.contains(a.tagDanger ?? "-")).toBe(true);
    expect(tags[1]?.classList.contains(a.tagInfo ?? "-")).toBe(true);
    expect(tags[0]?.classList.contains(a.tagInk ?? "-")).toBe(false);
  });

  it("D12 반영: 안내는 한 문단이고 줄 수는 앱 상수에서 — 안내에 인라인 style 없음", () => {
    render([]);
    const text = host.textContent ?? "";
    expect(text).toContain(`최근 순으로 ${ADMIN_ACCESS_LOG_LIMIT}줄까지`);
    expect(text.match(/거절된 시도/g)?.length).toBe(1);
    expect(host.querySelectorAll("p[style]").length).toBe(0);
    expect(host.querySelectorAll("p").length).toBe(1);
  });

  it("역조공 몫의 거부 사유 문구는 entities 의 문구 표에서 온다", () => {
    expect(REVGIFT_ACCESS_DENY_TEXT).toEqual({
      no_valid_approval: "받기로 하며 입력한 주소가 없어 열리지 않았어요",
      order_mismatch: "다른 선물의 주소라 열리지 않았어요",
    });
  });

  it("기록이 없으면 빈 줄 안내", () => {
    render([]);
    expect(host.textContent).toContain("아직 기록이 없어요.");
  });
});
