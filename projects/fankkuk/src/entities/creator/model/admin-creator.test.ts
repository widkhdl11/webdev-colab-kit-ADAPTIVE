import { describe, expect, it } from "vitest";
import { adminCreatorsFromRows, verificationEventsFromRows } from "./admin-creator";

const ID = "3f1c2b7a-9d4e-4c1a-8b2f-0a1b2c3d4e5f";

describe("관리자 크리에이터 확인 읽기 (INV-K10·K8)", () => {
  it("INV-K10: 줄을 옮긴다 — 계정 없는 크리에이터·처리 기록 없는 크리에이터는 null 칸", () => {
    const rows = [
      { id: ID, slug: "haru", name: "하루", channel: "유튜브", channel_title: "하루의 방", login_id: null, verified: false, last_action_at: null, last_actor_nickname: null, email: "x@y" },
    ];
    expect(adminCreatorsFromRows(rows)).toEqual([
      { id: ID, slug: "haru", name: "하루", channel: "유튜브", channelTitle: "하루의 방", loginId: null, verified: false, lastActionAt: null, lastActorNickname: null },
    ]);
  });

  it("INV-K10: 처리 기록 — 승인·취소와 사유", () => {
    const rows = [
      { at: "t", actor_nickname: "라임", creator_id: ID, creator_name: "달무리", action: "revoke", reason: "코드가 사라짐", reason_code: "code_removed", method: null, channel_url: null, code: null, application_id: null },
    ];
    expect(verificationEventsFromRows(rows)).toEqual([
      { at: "t", actorNickname: "라임", creatorId: ID, creatorName: "달무리", action: "revoke", reason: "코드가 사라짐", reasonCode: "code_removed", method: null, channelUrl: null, code: null },
    ]);
  });

  it("INV-V6·V9·V13: 처리 기록은 반려·닫힘도 읽는다 — 그때의 채널 주소·코드·확인 방법과 함께", () => {
    const base = { at: "t", actor_nickname: "모아", creator_id: ID, creator_name: "꿀단지", reason: "", method: "code", channel_url: "https://www.youtube.com/@ggul", code: "FK-7H3Q-92" };
    const rows = [
      { ...base, action: "reject", reason: "다른 계정과 대조함", reason_code: "code_not_found" },
      { ...base, action: "close", reason_code: "owner_confirmed_elsewhere" },
      { ...base, action: "approve", reason_code: null, method: "login", code: null },
    ];
    expect(verificationEventsFromRows(rows)?.map((e) => [e.action, e.reasonCode, e.method, e.code])).toEqual([
      ["reject", "code_not_found", "code", "FK-7H3Q-92"],
      ["close", "owner_confirmed_elsewhere", "code", "FK-7H3Q-92"],
      ["approve", null, "login", null],
    ]);
  });

  it("INV-K10 (실패경로): 꼴이 다른 줄이 있으면 null", () => {
    expect(adminCreatorsFromRows(undefined)).toBeNull();
    expect(adminCreatorsFromRows([{ id: ID, verified: "yes" }])).toBeNull();
    const ev = { at: "t", actor_nickname: "라임", creator_id: ID, creator_name: "달무리", reason: "", reason_code: null, method: null, channel_url: null, code: null };
    expect(verificationEventsFromRows([{ ...ev, action: "unknown" }])).toBeNull();
    expect(verificationEventsFromRows([{ ...ev, action: "approve", method: "phone" }])).toBeNull();
  });
});
