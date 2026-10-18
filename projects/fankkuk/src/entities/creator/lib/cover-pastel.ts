// 사진 없는 배너의 기본 색 — 파스텔 8색(design-rules 「크리에이터 카드·공개 프로필 머리」, DECISIONS 2026-10-17 d101).
// 퍼스널 컬러가 없을 때만 쓴다. 크리에이터 ID 로 정하므로 같은 크리에이터는 어느 화면에서나 늘 같은 색이다.
// 상세 설정 퍼스널 컬러의 추천 색 줄도 이 8색이다(같은 순서).

import { PASTEL_TONES, type PastelTone } from "@/shared/config/pastel-tones";

/** 목록은 shared/config/pastel-tones 가 정본이다(광고 배너 바탕과 같은 8색). */
export const COVER_PASTELS = PASTEL_TONES;

export type CoverPastel = PastelTone;

/** 문자열 → 32비트 FNV-1a 해시(부호 없음). 시안 v24 의 배정과 같은 계산이다. */
function fnv1a(text: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i += 1) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h;
}

/** 크리에이터 ID → 파스텔 8색 가운데 하나. 같은 ID 는 늘 같은 색. */
export function coverPastel(creatorId: string): CoverPastel {
  return COVER_PASTELS[fnv1a(creatorId) % COVER_PASTELS.length]!;
}
