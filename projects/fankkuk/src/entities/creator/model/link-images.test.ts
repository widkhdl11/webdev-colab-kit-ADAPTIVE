import { describe, expect, it } from "vitest";
import { creatorPhotoUrl, noticeImageInput, previewImageInput, previewImagePath, type PublicCreatorLink } from "./link-images";

// 미리보기 이미지·공지 이미지에 넘기는 값 (creator-link INV-E7·E9·E10). 이미지 라우트는 이 함수의 결과만 그린다.

const BASE = "http://127.0.0.1:55321";
const withPhoto: PublicCreatorLink = { id: "c1", name: "하루", handle: "haru", photoPath: "c1/3.webp" };
const plain: PublicCreatorLink = { id: "c1", name: "하루", handle: null, photoPath: null };

describe("INV-E10: 이미지에 들어가는 칸", () => {
  it("INV-E10 S10: 미리보기 이미지는 이름과 사진 주소뿐", () => {
    expect(previewImageInput(withPhoto, BASE)).toEqual({ name: "하루", photoUrl: `${BASE}/storage/v1/object/public/creator-photos/c1/3.webp` });
    expect(previewImageInput(plain, BASE)).toEqual({ name: "하루", photoUrl: null });
  });

  it("INV-E10 S10: 공지 이미지는 사진 주소와 링크 주소뿐 — 아이디가 없으면 만들지 않는다", () => {
    expect(noticeImageInput(withPhoto, BASE)).toEqual({ photoUrl: `${BASE}/storage/v1/object/public/creator-photos/c1/3.webp`, linkText: "fankkuk.kr/haru" });
    expect(noticeImageInput(plain, BASE)).toBeNull();
  });

  it("INV-E7: 넘긴 값에 다른 칸이 섞여 와도 이미지 입력에는 들어가지 않는다", () => {
    const extra = { ...withPhoto, intro: "소개", loginId: "haru_login", orderNo: "FC-ABC123" } as PublicCreatorLink;
    expect(JSON.stringify([previewImageInput(extra, BASE), noticeImageInput(extra, BASE)])).not.toMatch(/haru_login|FC-ABC123|소개/);
  });
});

describe("INV-E9: 사진 판이 바뀌면 미리보기 주소가 바뀐다", () => {
  it("INV-E9 S9c: 판 값은 사진 파일 이름의 판 번호 — 사진이 없으면 0", () => {
    expect(previewImagePath(withPhoto)).toBe("/api/og/c1?v=3");
    expect(previewImagePath({ ...withPhoto, photoPath: "c1/4.webp" })).toBe("/api/og/c1?v=4");
    expect(previewImagePath(plain)).toBe("/api/og/c1?v=0");
  });

  it("INV-E9 (실패경로): 저장소 경로 꼴이 아니면 사진 주소를 만들지 않는다", () => {
    expect(creatorPhotoUrl(BASE, "../secret.webp")).toBeNull();
    expect(creatorPhotoUrl(BASE, "c1/3.png")).toBeNull();
    expect(creatorPhotoUrl(BASE, null)).toBeNull();
  });
});
