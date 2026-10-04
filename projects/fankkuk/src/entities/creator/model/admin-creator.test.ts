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
    const rows = [{ at: "t", actor_nickname: "라임", creator_id: ID, creator_name: "달무리", action: "revoke", reason: "코드가 사라짐" }];
    expect(verificationEventsFromRows(rows)).toEqual([{ at: "t", actorNickname: "라임", creatorId: ID, creatorName: "달무리", action: "revoke", reason: "코드가 사라짐" }]);
  });

  it("INV-K10 (실패경로): 꼴이 다른 줄이 있으면 null", () => {
    expect(adminCreatorsFromRows(undefined)).toBeNull();
    expect(adminCreatorsFromRows([{ id: ID, verified: "yes" }])).toBeNull();
    expect(verificationEventsFromRows([{ at: "t", actor_nickname: "라임", creator_id: ID, creator_name: "달무리", action: "reject", reason: "" }])).toBeNull();
  });
});
