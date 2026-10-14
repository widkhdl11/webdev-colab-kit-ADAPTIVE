import { describe, expect, it } from "vitest";
import { readCreatorLinkExtras } from "./creator-link-reads";

// 링크 페이지 공개 정보 읽기(추가분 4-3) — DB 응답은 신뢰 경계 밖이라, 확인된 채널은
// 플랫폼이 네 코드 중 하나이고 주소가 https:// 로 시작할 때만 화면에 넘긴다(아이콘의 href 가 된다).
// DB 는 가짜 rpc 로 둔다 — 시험 대상은 응답을 거르는 이 함수다.

const CREATOR_ID = "6f1c2b9e-4a3d-4c8e-9b7a-2d5e8f1a0c3b";

type ExtrasRow = {
  fan_name: string | null;
  platform: string | null;
  channel_key: string | null;
  channel_url: string | null;
  verified_on: string | null;
  bg_path: string | null;
  symbol_path: string | null;
  preview_pick: string;
};

const okRow: ExtrasRow = {
  fan_name: "꿀단지",
  platform: "youtube",
  channel_key: "gguldanji",
  channel_url: "https://www.youtube.com/@gguldanji",
  verified_on: "2026-10-14",
  bg_path: null,
  symbol_path: null,
  preview_pick: "photo",
};

function fakeClient(rows: ExtrasRow[]) {
  return { rpc: () => Promise.resolve({ data: rows, error: null }) } as unknown as Parameters<typeof readCreatorLinkExtras>[0];
}

const channelOf = async (patch: Partial<ExtrasRow>) => (await readCreatorLinkExtras(fakeClient([{ ...okRow, ...patch }]), CREATOR_ID)).channel;

describe("readCreatorLinkExtras — 확인된 채널 거르기", () => {
  it("네 플랫폼 중 하나 + https:// 주소면 채널을 넘긴다", async () => {
    expect(await channelOf({})).toEqual({
      platform: "youtube",
      channelKey: "gguldanji",
      channelUrl: "https://www.youtube.com/@gguldanji",
      verifiedOn: "2026-10-14",
    });
  });

  it("(실패경로) 플랫폼이 네 코드가 아니면(\"x\") channel 은 null", async () => {
    expect(await channelOf({ platform: "x" })).toBeNull();
  });

  it("(실패경로) 주소가 javascript: 면 channel 은 null", async () => {
    expect(await channelOf({ channel_url: "javascript:alert(1)" })).toBeNull();
  });

  it("(실패경로) 주소가 http:// 면 channel 은 null", async () => {
    expect(await channelOf({ channel_url: "http://www.youtube.com/@gguldanji" })).toBeNull();
  });

  it("(실패경로) 채널 키가 비었으면 channel 은 null", async () => {
    expect(await channelOf({ channel_key: "" })).toBeNull();
  });

  it("팬덤 이름은 채널과 따로 — 채널이 걸러져도 남는다", async () => {
    const r = await readCreatorLinkExtras(fakeClient([{ ...okRow, platform: "x" }]), CREATOR_ID);
    expect(r.fanName).toBe("꿀단지");
  });
});

describe("readCreatorLinkExtras — 배경사진·팬덤 심볼·미리보기 고르기 (creator-link INV-E7·E10)", () => {
  const lookOf = async (patch: Partial<ExtrasRow>) => (await readCreatorLinkExtras(fakeClient([{ ...okRow, ...patch }]), CREATOR_ID)).look;

  it("INV-E7: 저장소 경로 꼴이 맞는 배경사진·심볼만 넘긴다", async () => {
    expect(await lookOf({ bg_path: `${CREATOR_ID}/bg-2.webp`, symbol_path: `${CREATOR_ID}/sym-1.webp`, preview_pick: "symbol" })).toEqual({
      bgPath: `${CREATOR_ID}/bg-2.webp`,
      symbolPath: `${CREATOR_ID}/sym-1.webp`,
      previewPick: "symbol",
    });
  });

  it("INV-E7 (실패경로): 꼴이 틀린 경로·모르는 고르기 값은 없는 것으로 — 심볼이 없으면 고르기는 프로필 사진", async () => {
    expect(await lookOf({ bg_path: "../x.webp", symbol_path: `${CREATOR_ID}/1.webp`, preview_pick: "symbol" })).toEqual({ bgPath: null, symbolPath: null, previewPick: "photo" });
    expect(await lookOf({ preview_pick: "logo" })).toEqual({ bgPath: null, symbolPath: null, previewPick: "photo" });
  });
});
