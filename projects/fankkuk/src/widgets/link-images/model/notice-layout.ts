import type { NoticeSize } from "@/entities/creator/model/link-images";

// 공지 이미지(홍보 카드) 세 크기의 자리 (creator-link INV-E10, 디자인 기준 10절, 시안 docs/design/mockups/addendum/customize/story-card.html).
// 같은 구성: 위쪽 배경사진(없으면 단색) · 배경 아래 가장자리에 걸친 원형 프로필 사진 · 공개 이름 · 한 줄 소개 · 하단 작은 「팬꾹으로 선물 보내기」와 링크 주소.
// 글자는 모두 [textTop, textBottom] 세로 칸 안에 둔다 — 스토리 세로판은 스토리 앱이 가리는 위·아래 250px 밖이다(사진은 가려져도 된다).

export type NoticeLayout = {
  width: number;
  height: number;
  /** 배경사진 띠 높이(위에서부터) */
  bgHeight: number;
  photoSize: number;
  photoTop: number;
  /** 사진 둘레 흰 테두리 두께 */
  ring: number;
  /** 글자 칸의 위·아래 경계(이미지 위에서부터 잰 값) */
  textTop: number;
  textBottom: number;
  /** 글자 칸 좌우 여백 */
  padX: number;
  /** 공개 이름 글자 크기 — 8자까지 / 13자까지 / 그 이상 */
  nameSizes: readonly [number, number, number];
  introSize: number;
  footSize: number;
};

/** 스토리 앱이 위·아래에서 가리는 높이 — 여기에는 글자를 두지 않는다. */
export const STORY_SAFE_INSET = 250;

export const NOTICE_LAYOUT: Readonly<Record<NoticeSize, NoticeLayout>> = {
  square: {
    width: 1080,
    height: 1080,
    bgHeight: 420,
    photoSize: 280,
    photoTop: 280,
    ring: 12,
    textTop: 600,
    textBottom: 1016,
    padX: 96,
    nameSizes: [72, 56, 44],
    introSize: 40,
    footSize: 32,
  },
  story: {
    width: 1080,
    height: 1920,
    bgHeight: 1000,
    photoSize: 320,
    photoTop: 840,
    ring: 14,
    textTop: 1208,
    textBottom: 1920 - STORY_SAFE_INSET,
    padX: 96,
    nameSizes: [88, 64, 48],
    introSize: 44,
    footSize: 40,
  },
  wide: {
    width: 1200,
    height: 675,
    bgHeight: 260,
    photoSize: 180,
    photoTop: 170,
    ring: 8,
    textTop: 370,
    textBottom: 635,
    padX: 100,
    nameSizes: [52, 44, 36],
    introSize: 30,
    footSize: 26,
  },
};

/** 공개 이름 길이에 맞춘 글자 크기 — 길면 줄여 한 줄에 둔다. */
export function noticeNameSize(layout: NoticeLayout, name: string): number {
  const n = [...name].length;
  return n <= 8 ? layout.nameSizes[0] : n <= 13 ? layout.nameSizes[1] : layout.nameSizes[2];
}
