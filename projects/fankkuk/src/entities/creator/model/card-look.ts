import type { CreatorCard } from "./creator-card";
import { creatorBackgroundUrl, creatorPhotoUrl, creatorSymbolUrl } from "./link-images";

// 크리에이터 카드에 싣는 꾸민 모양(2026-10-16 사용자 「각자 꾸밀 수 있게」) — 크리에이터 찾기·팔로우한 크리에이터 카드가 같이 쓴다.
// 공개 페이지 머리와 같은 값: 프로필 사진·배경사진·팬덤 심볼 공개 주소와 팬덤 이름. 테마 색은 카드(CreatorCard.colors)에 이미 있다.

/** 저장소 경로 꼴로 거른 꾸밈 칸(읽기 함수가 돌려준다). */
export type CreatorLookPaths = { bgPath: string | null; symbolPath: string | null; fanName: string | null };

/** 카드 한 장에 그릴 꾸밈 — 공개 저장소 주소와 팬덤 이름. */
export type CardLook = { photoUrl: string | null; backgroundUrl: string | null; symbolUrl: string | null; fanName: string | null };

export const NO_CARD_LOOK: CardLook = { photoUrl: null, backgroundUrl: null, symbolUrl: null, fanName: null };

/** 카드마다 그릴 꾸밈. 꾸밈을 읽지 못한 사람은 프로필 사진만(나머지는 기본 모양). */
export function toCardLooks(
  cards: readonly Pick<CreatorCard, "id" | "photoPath">[],
  looks: Readonly<Record<string, CreatorLookPaths>>,
  storageBase: string,
): Record<string, CardLook> {
  return Object.fromEntries(
    cards.map((c) => {
      const look = looks[c.id];
      return [
        c.id,
        {
          photoUrl: creatorPhotoUrl(storageBase, c.photoPath),
          backgroundUrl: creatorBackgroundUrl(storageBase, look?.bgPath ?? null),
          symbolUrl: creatorSymbolUrl(storageBase, look?.symbolPath ?? null),
          fanName: look?.fanName ?? null,
        },
      ];
    }),
  );
}
