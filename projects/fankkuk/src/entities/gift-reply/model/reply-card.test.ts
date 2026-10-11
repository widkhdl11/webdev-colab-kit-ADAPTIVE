import { describe, expect, it } from "vitest";
import { replyCardInput } from "./reply-card";

// 공유 카드에 넘기는 값 (gift-reply INV-G9). 카드 라우트는 DB 가 주인을 확인해 돌려준 줄을 이 함수에 넘기고, 돌아온 칸만 그린다.

const PHOTO = "https://sb.example.com/storage/v1/object/public/creator-photos/c1/2.webp";
const row = {
  creatorName: "하루",
  creatorPhotoPath: "00000000-0000-4000-b000-000000000001/3.webp",
  phrase: "touched" as const,
  line: "손편지 읽고 울컥했어요",
  repliedOn: "2026-10-05",
  fanNickname: "별빛",
  xTag: "haru_tv",
};

describe("INV-G9: 공유 카드는 정해진 칸만", () => {
  it("INV-G9: 사진 주소·크리에이터 이름·문구 글·한 줄·점 날짜, 그리고 팬이 고른 경우에만 팬 닉네임", () => {
    expect(replyCardInput(row, { withName: true, photoUrl: PHOTO })).toEqual({
      creatorName: "하루",
      photoUrl: PHOTO,
      initial: "하",
      phraseText: "정성이 느껴져서 감동이에요",
      line: "손편지 읽고 울컥했어요",
      date: "2026.10.05",
      fanNickname: "별빛",
    });
    expect(replyCardInput(row, { withName: false, photoUrl: PHOTO }).fanNickname).toBeNull();
  });

  it("INV-G9 (실패경로): 카드 값에 X 태그·주문·상자 칸이 없다 — 공유 글은 따로 만든다", () => {
    const input = replyCardInput({ ...row, orderNo: "FC-ABC", waybill: "123456789012" } as never, { withName: true, photoUrl: PHOTO });
    expect(Object.keys(input).sort()).toEqual(["creatorName", "date", "fanNickname", "initial", "line", "photoUrl", "phraseText"]);
    expect(JSON.stringify(input)).not.toMatch(/haru_tv|FC-ABC|123456789012/);
  });

  it("탈퇴한 크리에이터는 「탈퇴한 크리에이터」·기본 이미지", () => {
    // 탈퇴하면 DB 가 사진 경로를 비워 보내고, 카드 라우트가 만드는 사진 주소도 null 이다(creatorPhotoUrl 의 null 처리는 link-images 시험)
    const input = replyCardInput({ ...row, creatorName: null, creatorPhotoPath: null }, { withName: false, photoUrl: null });
    expect(input.creatorName).toBe("탈퇴한 크리에이터");
    expect(input.photoUrl).toBeNull();
    expect(input.initial).toBe("");
  });
});
