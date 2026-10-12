import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { AdminAccessEntry } from "@/entities/address/api/admin-access-log";
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
  it("INV-P7 (D12): 직원 거부 줄은 「대표 아님 · 닉네임」과 C1 문구로, 대표의 연 줄은 「대표 · 닉네임」과 몇 번째로", () => {
    render([
      { at: "2026-10-12T06:00:00.000Z", target: "gift", orderNo: "FC-4T7NX", requester: "other", requesterNickname: "팬꾹 직원", result: { kind: "denied", reason: "not_owner" } },
      { at: "2026-10-12T05:50:00.000Z", target: "gift", orderNo: "FC-4T7NX", requester: "owner", requesterNickname: "팬꾹 운영", result: { kind: "opened", printNo: 2, released: false } },
      { at: "2026-10-12T05:40:00.000Z", target: "revgift", orderNo: "RG-AB12CD0", requester: "owner", requesterNickname: null, result: { kind: "denied", reason: "no_valid_approval" } },
      { at: "2026-10-12T05:30:00.000Z", target: "gift", orderNo: "FC-9QW2E", requester: "owner", requesterNickname: "팬꾹 운영", result: { kind: "denied", reason: "no_valid_approval" } },
    ]);
    expect(rowsOf()).toEqual([
      ["팬 선물", "FC-4T7NX", "대표 아님 · 팬꾹 직원", "거부", "권한이 없는 계정이라 열리지 않았어요"],
      ["팬 선물", "FC-4T7NX", "대표 · 팬꾹 운영", "열림", "재출력 2번째"],
      ["역조공", "RG-AB12CD0", "대표", "거부", "받기로 하며 입력한 주소가 없어 열리지 않았어요"],
      ["팬 선물", "FC-9QW2E", "대표 · 팬꾹 운영", "거부", "승인 서명이 확인되지 않아 열리지 않았어요"],
    ]);
  });

  it("기록이 없으면 빈 줄 안내", () => {
    render([]);
    expect(host.textContent).toContain("아직 기록이 없어요");
  });
});
