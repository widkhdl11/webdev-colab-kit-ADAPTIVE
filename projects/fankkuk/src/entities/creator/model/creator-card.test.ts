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
  avgApprovalHours: 2,
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
  it("소개가 없는 크리에이터는 목록에 넣지 않는다", () => {
    expect(toCreatorCards(creators, profiles, []).some((c) => c.id === "c9")).toBe(false);
  });
});
