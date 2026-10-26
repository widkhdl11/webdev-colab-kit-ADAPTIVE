import { describe, expect, it } from "vitest";
import { channelBadgeTitle, channelOwnerLine, channelPlatformLabel } from "./channel-badge";
import { channelPlatformOfLabel } from "./channel-url";

// 확인된 채널의 공개 표시 (추가분 4-3·4-4·4-5)

describe("channelBadgeTitle — 마우스를 올리면 보이는 풀이", () => {
  it("유튜브 — 「@핸들 · YYYY.MM.DD 확인」", () => {
    expect(channelBadgeTitle({ platform: "youtube", channelKey: "gguldanji", verifiedOn: "2026-10-14" })).toBe("@gguldanji · 2026.10.14 확인");
  });

  it("인스타그램 — 「@사용자이름 · YYYY.MM.DD 확인」", () => {
    expect(channelBadgeTitle({ platform: "instagram", channelKey: "haru.day", verifiedOn: "2026-10-14" })).toBe("@haru.day · 2026.10.14 확인");
  });

  it("SOOP — 아이디 그대로(@ 없이)", () => {
    expect(channelBadgeTitle({ platform: "soop", channelKey: "haru01", verifiedOn: "2026-10-14" })).toBe("haru01 · 2026.10.14 확인");
    expect(channelBadgeTitle({ platform: "soop", channelKey: "haru01", verifiedOn: null })).toBe("haru01 · 채널 소유 확인");
  });

  it("치지직 — 32자 채널 ID 대신 「치지직 채널」", () => {
    const key = "0123456789abcdef0123456789abcdef";
    expect(channelBadgeTitle({ platform: "chzzk", channelKey: key, verifiedOn: "2026-10-14" })).toBe("치지직 채널 · 2026.10.14 확인");
    expect(channelBadgeTitle({ platform: "chzzk", channelKey: key, verifiedOn: null })).toBe("치지직 채널 소유 확인");
  });

  it("(실패경로) 확인 날짜가 없거나 꼴이 틀리면 날짜 대신 「채널 소유 확인」", () => {
    expect(channelBadgeTitle({ platform: "youtube", channelKey: "gguldanji", verifiedOn: null })).toBe("@gguldanji · 채널 소유 확인");
    expect(channelBadgeTitle({ platform: "youtube", channelKey: "gguldanji", verifiedOn: "2026/10/14" })).toBe("@gguldanji · 채널 소유 확인");
  });

  it("「공식·인증된·검증된·안전한」은 쓰지 않는다(design-rules 6절)", () => {
    const texts = [
      channelBadgeTitle({ platform: "youtube", channelKey: "a", verifiedOn: "2026-10-14" }),
      channelBadgeTitle({ platform: "chzzk", channelKey: "a", verifiedOn: null }),
      channelOwnerLine({ name: "하루", platform: "youtube" }) ?? "",
    ];
    for (const t of texts) expect(t).not.toMatch(/공식|인증된|검증된|안전한/);
  });
});

describe("channelPlatformLabel", () => {
  it("플랫폼 코드를 화면 이름으로", () => {
    expect(channelPlatformLabel({ platform: "youtube" })).toBe("유튜브");
    expect(channelPlatformLabel({ platform: "chzzk" })).toBe("치지직");
    expect(channelPlatformLabel({ platform: "soop" })).toBe("SOOP");
    expect(channelPlatformLabel({ platform: "instagram" })).toBe("인스타그램");
  });
});

describe("channelPlatformOfLabel — 크리에이터 카드의 플랫폼 이름을 코드로", () => {
  it("네 이름은 코드로", () => {
    expect(channelPlatformOfLabel("유튜브")).toBe("youtube");
    expect(channelPlatformOfLabel("치지직")).toBe("chzzk");
    expect(channelPlatformOfLabel(" SOOP ")).toBe("soop");
    expect(channelPlatformOfLabel("인스타그램")).toBe("instagram");
  });

  it("(실패경로) 넷이 아니면 null", () => {
    expect(channelPlatformOfLabel("")).toBeNull();
    expect(channelPlatformOfLabel("youtube")).toBeNull();
    expect(channelPlatformOfLabel("https://www.youtube.com/@haru")).toBeNull();
  });
});

describe("channelOwnerLine — 선물 보내기 맨 위 한 줄", () => {
  it("「{닉네임}님의 {플랫폼} 채널 소유자 확인 완료」 — 코드를 받아 화면 이름으로", () => {
    expect(channelOwnerLine({ name: "하루", platform: "youtube" })).toBe("하루님의 유튜브 채널 소유자 확인 완료");
    expect(channelOwnerLine({ name: "하루", platform: "soop" })).toBe("하루님의 SOOP 채널 소유자 확인 완료");
  });

  it("(실패경로) 크리에이터가 없거나 이름이 비었거나 플랫폼이 네 코드가 아니면 null", () => {
    expect(channelOwnerLine(null)).toBeNull();
    expect(channelOwnerLine(undefined)).toBeNull();
    expect(channelOwnerLine({ name: "  ", platform: "youtube" })).toBeNull();
    expect(channelOwnerLine({ name: "하루", platform: null })).toBeNull();
    expect(channelOwnerLine({ name: "하루", platform: "유튜브" })).toBeNull();
    expect(channelOwnerLine({ name: "하루", platform: "https://www.youtube.com/@haru" })).toBeNull();
  });
});
