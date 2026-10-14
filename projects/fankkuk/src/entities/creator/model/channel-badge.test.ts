import { describe, expect, it } from "vitest";
import { channelBadgeTitle, channelOwnerLine, channelPlatformLabel } from "./channel-badge";

// 확인된 채널의 공개 표시 (추가분 4-3·4-4·4-5)

describe("channelBadgeTitle — 마우스를 올리면 보이는 풀이", () => {
  it("「@핸들 · YYYY.MM.DD 확인」", () => {
    expect(channelBadgeTitle({ channelKey: "gguldanji", verifiedOn: "2026-10-14" })).toBe("@gguldanji · 2026.10.14 확인");
  });

  it("(실패경로) 확인 날짜가 없거나 꼴이 틀리면 날짜 대신 「채널 소유 확인」", () => {
    expect(channelBadgeTitle({ channelKey: "gguldanji", verifiedOn: null })).toBe("@gguldanji · 채널 소유 확인");
    expect(channelBadgeTitle({ channelKey: "gguldanji", verifiedOn: "2026/10/14" })).toBe("@gguldanji · 채널 소유 확인");
  });

  it("「공식·인증된·검증된·안전한」은 쓰지 않는다(design-rules 6절)", () => {
    const texts = [channelBadgeTitle({ channelKey: "a", verifiedOn: "2026-10-14" }), channelOwnerLine({ name: "하루", platform: "유튜브" }) ?? ""];
    for (const t of texts) expect(t).not.toMatch(/공식|인증된|검증된|안전한/);
  });
});

describe("channelPlatformLabel", () => {
  it("플랫폼 키를 화면 이름으로", () => {
    expect(channelPlatformLabel({ platform: "youtube" })).toBe("유튜브");
    expect(channelPlatformLabel({ platform: "chzzk" })).toBe("치지직");
    expect(channelPlatformLabel({ platform: "soop" })).toBe("SOOP");
    expect(channelPlatformLabel({ platform: "instagram" })).toBe("인스타그램");
  });
});

describe("channelOwnerLine — 선물 보내기 맨 위 한 줄", () => {
  it("「{닉네임}님의 {플랫폼} 채널 주인이 확인된 페이지예요」", () => {
    expect(channelOwnerLine({ name: "하루", platform: "유튜브" })).toBe("하루님의 유튜브 채널 주인이 확인된 페이지예요");
  });

  it("(실패경로) 크리에이터가 없거나 이름이 비었거나 플랫폼이 승인 때 적는 네 이름이 아니면 null", () => {
    expect(channelOwnerLine(null)).toBeNull();
    expect(channelOwnerLine(undefined)).toBeNull();
    expect(channelOwnerLine({ name: "  ", platform: "유튜브" })).toBeNull();
    expect(channelOwnerLine({ name: "하루", platform: "" })).toBeNull();
    expect(channelOwnerLine({ name: "하루", platform: "https://www.youtube.com/@haru" })).toBeNull();
  });
});
