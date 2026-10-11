import { describe, expect, it } from "vitest";
import { creatorPhotoUrl, isCurrentPreviewVersion, nameInitial, noticeImageInput, previewImageInput, previewImagePath, type PublicCreatorLink } from "./link-images";

// 미리보기 이미지·공지 이미지에 넘기는 값 (creator-link INV-E7·E9·E10). 이미지 라우트는 이 함수의 결과만 그린다.

const BASE = "http://127.0.0.1:55321";
const withPhoto: PublicCreatorLink = { id: "c1", name: "하루", handle: "haru", photoPath: "c1/3.webp" };
const plain: PublicCreatorLink = { id: "c1", name: "하루", handle: null, photoPath: null };

describe("INV-E10: 이미지에 들어가는 칸", () => {
  it("INV-E10 S10: 미리보기 이미지는 이름과 사진 주소뿐", () => {
    expect(previewImageInput(withPhoto, BASE)).toEqual({ name: "하루", photoUrl: `${BASE}/storage/v1/object/public/creator-photos/c1/3.webp` });
    expect(previewImageInput(plain, BASE)).toEqual({ name: "하루", photoUrl: null });
  });

  it("INV-E10 S10: 공지 이미지는 사진 주소·링크 주소·이름 첫 글자뿐 — 아이디가 없으면 만들지 않는다", () => {
    expect(noticeImageInput(withPhoto, BASE)).toEqual({ photoUrl: `${BASE}/storage/v1/object/public/creator-photos/c1/3.webp`, linkText: "fankkuk.kr/haru", initial: "하" });
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

describe("INV-E9: 미리보기 이미지 주소의 판", () => {
  it("INV-E9: 주소의 v 가 지금 사진 판과 같을 때만 지금 판이다 — 사진이 없으면 0", () => {
    const path = "00000000-0000-4000-b000-000000000001/3.webp";
    expect(isCurrentPreviewVersion("3", path)).toBe(true);
    expect(isCurrentPreviewVersion("0", null)).toBe(true);
  });

  it("INV-E9 (실패경로): 다른 판·없음·숫자가 아닌 값·앞에 0 이 붙은 값은 지금 판이 아니다", () => {
    const path = "00000000-0000-4000-b000-000000000001/3.webp";
    for (const v of ["2", null, "", "abc", "03", "3.0", " 3"]) expect([v, isCurrentPreviewVersion(v, path)]).toEqual([v, false]);
  });
});

describe("INV-E10: 사진이 없을 때 기본 이미지의 글자", () => {
  it("INV-E10 S10: 공지 입력은 공개 이름 전체가 아니라 첫 글자만 넘긴다", () => {
    const input = noticeImageInput({ id: "c1", name: "하루시험", handle: "haru", photoPath: null }, "http://photo.test");
    expect(input).toEqual({ photoUrl: null, linkText: "fankkuk.kr/haru", initial: "하" });
    expect(nameInitial("  Momo")).toBe("M");
    expect(nameInitial("")).toBe("");
  });
});
