import { describe, expect, it } from "vitest";
import { matchesCreatorQuery, toCreatorCards, type CreatorCard } from "./creator-card";

const haru: CreatorCard = {
  id: "c1",
  name: "하루",
  platform: "치지직",
  category: "게임",
  channelTitle: "하루의 놀이터",
  intro: "게임 방송을 해요.",
  alias: "haru",
  approvalMinutes: 120,
  faceTone: "#000000",
  following: false,
};

describe("matchesCreatorQuery — 크리에이터 찾기 실시간 검색", () => {
  it("빈 검색어는 모두 통과한다", () => {
    expect(matchesCreatorQuery(haru, "")).toBe(true);
    expect(matchesCreatorQuery(haru, "   ")).toBe(true);
  });
  it("이름·로마자 이름·분야·채널 이름 어느 것으로도 걸린다", () => {
    expect(matchesCreatorQuery(haru, "하루")).toBe(true);
    expect(matchesCreatorQuery(haru, "HARU")).toBe(true);
    expect(matchesCreatorQuery(haru, "게임")).toBe(true);
    expect(matchesCreatorQuery(haru, "놀이터")).toBe(true);
  });
  it("방송 플랫폼 이름으로도 걸린다 — 선물 보내기의 크리에이터 고르기와 같은 규칙", () => {
    expect(matchesCreatorQuery(haru, "치지직")).toBe(true);
    expect(matchesCreatorQuery(haru, "유튜브")).toBe(false);
  });
  it("소개 칸이 비어 있는 크리에이터도 이름·플랫폼으로 걸린다", () => {
    const bare = { name: "모모", platform: "유튜브" };
    expect(matchesCreatorQuery(bare, "모모")).toBe(true);
    expect(matchesCreatorQuery(bare, "유튜브")).toBe(true);
    expect(matchesCreatorQuery(bare, "게임")).toBe(false);
  });
  it("띄어쓰기는 무시한다", () => {
    expect(matchesCreatorQuery(haru, "하루의 놀이 터")).toBe(true);
  });
  it("어디에도 없는 말은 걸리지 않는다", () => {
    expect(matchesCreatorQuery(haru, "노래")).toBe(false);
    expect(matchesCreatorQuery(haru, "momo")).toBe(false);
  });
});

describe("toCreatorCards", () => {
  const creators = [
    { id: "c1", name: "하루", channel: "치지직" },
    { id: "c2", name: "모모", channel: "유튜브" },
    { id: "c9", name: "소개없음", channel: "SOOP" },
  ];
  const profiles = [
    { creatorId: "c2", category: "노래", channelTitle: "모모네 거실", intro: "", alias: "momo", avgApprovalHours: 4, faceTone: "#111111" },
    { creatorId: "c1", category: "게임", channelTitle: "하루의 놀이터", intro: "", alias: "haru", avgApprovalHours: 2, faceTone: "#222222" },
  ];
  it("크리에이터 순서를 지키고 소개를 id 로 붙이며, 팔로우 여부를 표시한다", () => {
    const cards = toCreatorCards(creators, profiles, ["c2"]);
    expect(cards.map((c) => c.id)).toEqual(["c1", "c2"]);
    expect(cards[0]).toMatchObject({ name: "하루", platform: "치지직", category: "게임", faceTone: "#222222", following: false });
    expect(cards[1]).toMatchObject({ name: "모모", category: "노래", following: true });
  });
  it("평균 승인 시간은 주문 기록의 평균을 먼저 쓰고, 없으면 소개 칸 값을 쓴다", () => {
    const cards = toCreatorCards(creators, profiles, [], { c1: 45, c2: null });
    expect(cards[0]?.approvalMinutes).toBe(45);
    expect(cards[1]?.approvalMinutes).toBe(240);
  });
  it("승인 기록도 소개 칸 값도 없는 새 크리에이터는 평균 승인 시간을 비워 둔다 — 「약 1분」처럼 빨리 승인될 것처럼 보이지 않게", () => {
    const fresh = [{ ...profiles[0]!, creatorId: "c2", avgApprovalHours: null }];
    expect(toCreatorCards(creators, fresh, [], { c2: null }).find((c) => c.id === "c2")?.approvalMinutes).toBeNull();
  });
  it("소개가 없는 크리에이터는 목록에 넣지 않는다", () => {
    expect(toCreatorCards(creators, profiles, []).some((c) => c.id === "c9")).toBe(false);
  });
});
