import { describe, expect, it } from "vitest";
import {
  creatorBackgroundUrl,
  creatorPhotoUrl,
  creatorSymbolUrl,
  isCurrentPreviewVersion,
  nameInitial,
  NO_LOOK,
  NOTICE_SIZES,
  noticeImageInput,
  noticeImagePath,
  parseNoticeSize,
  previewImageInput,
  previewImagePath,
  previewImageVersion,
  previewPickOf,
  type PublicCreatorLink,
  type PublicCreatorLook,
} from "./link-images";

// 미리보기 이미지·공지 이미지에 넘기는 값 (creator-link INV-E7·E9·E10). 이미지 라우트는 이 함수의 결과만 그린다.

const BASE = "http://127.0.0.1:55321";
const ID = "00000000-0000-4000-b000-000000000001";
const withPhoto: PublicCreatorLink = { id: ID, name: "하루", handle: "haru", photoPath: `${ID}/3.webp`, intro: "느긋한 방송" };
const plain: PublicCreatorLink = { id: ID, name: "하루", handle: null, photoPath: null, intro: "" };
const withSymbol: PublicCreatorLook = { bgPath: `${ID}/bg-2.webp`, symbolPath: `${ID}/sym-4.webp`, previewPick: "symbol" };
const PUB = `${BASE}/storage/v1/object/public/creator-photos`;

describe("INV-E10: 미리보기 이미지에 들어가는 칸", () => {
  it("INV-E10 S10: 프로필 사진을 고르면 이름·프로필 사진 주소뿐", () => {
    expect(previewImageInput(withPhoto, NO_LOOK, BASE)).toEqual({ name: "하루", imageUrl: `${PUB}/${ID}/3.webp`, pick: "photo" });
    expect(previewImageInput(plain, NO_LOOK, BASE)).toEqual({ name: "하루", imageUrl: null, pick: "photo" });
  });

  it("INV-E10 S10: 팬덤 심볼을 고르면 프로필 사진 대신 심볼 주소", () => {
    expect(previewImageInput(withPhoto, withSymbol, BASE)).toEqual({ name: "하루", imageUrl: `${PUB}/${ID}/sym-4.webp`, pick: "symbol" });
  });

  it("INV-E10 (실패경로): 심볼을 골랐어도 심볼이 없거나 경로 꼴이 아니면 프로필 사진으로 그린다", () => {
    expect(previewPickOf({ ...withSymbol, symbolPath: null })).toBe("photo");
    expect(previewPickOf({ ...withSymbol, symbolPath: `${ID}/4.webp` })).toBe("photo");
    expect(previewImageInput(withPhoto, { ...withSymbol, symbolPath: null }, BASE)).toEqual({ name: "하루", imageUrl: `${PUB}/${ID}/3.webp`, pick: "photo" });
  });
});

describe("INV-E10: 공지 이미지에 들어가는 칸", () => {
  it("INV-E10 S10: 배경사진·프로필 사진·공개 이름·한 줄 소개·링크 주소·이름 첫 글자뿐", () => {
    expect(noticeImageInput(withPhoto, withSymbol, BASE)).toEqual({
      name: "하루",
      intro: "느긋한 방송",
      photoUrl: `${PUB}/${ID}/3.webp`,
      backgroundUrl: `${PUB}/${ID}/bg-2.webp`,
      linkText: "fankkuk.kr/haru",
      initial: "하",
    });
  });

  it("INV-E10 S10 (실패경로): 링크용 아이디가 없으면 공지 이미지를 만들지 않는다", () => {
    expect(noticeImageInput(plain, withSymbol, BASE)).toBeNull();
  });

  it("INV-E7: 넘긴 값에 다른 칸이 섞여 와도 이미지 입력에는 들어가지 않는다 — 심볼은 공지 이미지에 넣지 않는다", () => {
    const extra = { ...withPhoto, loginId: "haru_login", orderNo: "FC-ABC123", address: "와우산로 1" } as PublicCreatorLink;
    const lookExtra = { ...withSymbol, symbolRightsAt: "2026-10-14T00:00:00Z" } as PublicCreatorLook;
    const out = JSON.stringify([previewImageInput(extra, lookExtra, BASE), noticeImageInput(extra, lookExtra, BASE)]);
    expect(out).not.toMatch(/haru_login|FC-ABC123|와우산로|symbolRightsAt|2026-10-14/);
    expect(Object.keys(noticeImageInput(extra, lookExtra, BASE)!).sort()).toEqual(["backgroundUrl", "initial", "intro", "linkText", "name", "photoUrl"]);
    expect(Object.keys(previewImageInput(extra, lookExtra, BASE)).sort()).toEqual(["imageUrl", "name", "pick"]);
  });

  it("INV-E10: 공지 이미지 세 크기 — 정사각 1080×1080·스토리 세로 1080×1920·가로 1200×675, 다른 값은 받지 않는다", () => {
    expect(NOTICE_SIZES).toEqual({ square: { width: 1080, height: 1080 }, story: { width: 1080, height: 1920 }, wide: { width: 1200, height: 675 } });
    expect(["square", "story", "wide"].map(parseNoticeSize)).toEqual(["square", "story", "wide"]);
    for (const bad of [null, "", "SQUARE", "big", "square "]) expect([bad, parseNoticeSize(bad)]).toEqual([bad, null]);
    expect(noticeImagePath(ID, "story")).toBe(`/api/notice/${ID}?size=story`);
  });
});

describe("INV-E9: 사진 판이 바뀌면 미리보기 주소가 바뀐다", () => {
  it("INV-E9 S9c: 프로필 사진을 고르면 판 값은 사진 파일 이름의 판 번호 — 사진이 없으면 0", () => {
    expect(previewImagePath(withPhoto)).toBe(`/api/og/${ID}?v=3`);
    expect(previewImagePath({ ...withPhoto, photoPath: `${ID}/4.webp` })).toBe(`/api/og/${ID}?v=4`);
    expect(previewImagePath(plain)).toBe(`/api/og/${ID}?v=0`);
  });

  it("INV-E9: 팬덤 심볼을 고르면 판 값은 심볼 판(s 를 붙임) — 심볼을 바꾸거나 고르기를 바꾸면 주소가 바뀐다", () => {
    expect(previewImagePath(withPhoto, withSymbol)).toBe(`/api/og/${ID}?v=s4`);
    expect(previewImagePath(withPhoto, { ...withSymbol, symbolPath: `${ID}/sym-5.webp` })).toBe(`/api/og/${ID}?v=s5`);
    expect(previewImagePath(withPhoto, { ...withSymbol, previewPick: "photo" })).toBe(`/api/og/${ID}?v=3`);
    // 배경사진은 미리보기에 없어 판 값에 들어가지 않는다
    expect(previewImagePath(withPhoto, { ...withSymbol, bgPath: `${ID}/bg-9.webp` })).toBe(`/api/og/${ID}?v=s4`);
  });

  it("INV-E9 (실패경로): 저장소 경로 꼴이 아니면 사진 주소를 만들지 않는다 — 세 칸은 서로의 꼴을 받지 않는다", () => {
    expect(creatorPhotoUrl(BASE, "../secret.webp")).toBeNull();
    expect(creatorPhotoUrl(BASE, `${ID}/3.png`)).toBeNull();
    expect(creatorPhotoUrl(BASE, null)).toBeNull();
    expect(creatorPhotoUrl(BASE, `${ID}/bg-2.webp`)).toBeNull();
    expect(creatorBackgroundUrl(BASE, `${ID}/bg-2.webp`)).toBe(`${PUB}/${ID}/bg-2.webp`);
    expect(creatorBackgroundUrl(BASE, `${ID}/2.webp`)).toBeNull();
    expect(creatorBackgroundUrl(BASE, `${ID}/bg-../x.webp`)).toBeNull();
    expect(creatorSymbolUrl(BASE, `${ID}/sym-4.webp`)).toBe(`${PUB}/${ID}/sym-4.webp`);
    expect(creatorSymbolUrl(BASE, `${ID}/bg-4.webp`)).toBeNull();
  });
});

describe("INV-E9: 미리보기 이미지 주소의 판", () => {
  it("INV-E9: 주소의 v 가 지금 판과 같을 때만 지금 판이다", () => {
    expect(isCurrentPreviewVersion("3", previewImageVersion(withPhoto, NO_LOOK))).toBe(true);
    expect(isCurrentPreviewVersion("0", previewImageVersion(plain, NO_LOOK))).toBe(true);
    expect(isCurrentPreviewVersion("s4", previewImageVersion(withPhoto, withSymbol))).toBe(true);
  });

  it("INV-E9 (실패경로): 다른 판·없음·숫자가 아닌 값·앞에 0 이 붙은 값은 지금 판이 아니다", () => {
    const now = previewImageVersion(withPhoto, NO_LOOK);
    for (const v of ["2", null, "", "abc", "03", "3.0", " 3", "s3"]) expect([v, isCurrentPreviewVersion(v, now)]).toEqual([v, false]);
    expect(isCurrentPreviewVersion("3", previewImageVersion(withPhoto, withSymbol))).toBe(false);
  });
});

describe("INV-E10: 사진이 없을 때 기본 이미지의 글자", () => {
  it("INV-E10 S10: 이름 첫 글자", () => {
    expect(noticeImageInput({ ...plain, name: "하루시험", handle: "haru" }, NO_LOOK, "http://photo.test")).toMatchObject({ photoUrl: null, backgroundUrl: null, initial: "하" });
    expect(nameInitial("  Momo")).toBe("M");
    expect(nameInitial("")).toBe("");
  });
});
