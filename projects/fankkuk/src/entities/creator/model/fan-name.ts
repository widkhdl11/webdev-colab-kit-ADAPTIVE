// 팬을 부르는 이름 (추가분 4-1) — 크리에이터가 설정에서 고르는 선택 칸. 링크 페이지 감사 문장에 들어간다.
// 저장 검사는 DB 함수(update_my_creator_profile)가 다시 한다: 1~10자, 줄바꿈·보이지 않는 글자 없음, 직접 입력 태그와 같은 업계 기본 필터.

export const FAN_NAME_MAX = 10;

const THANKS_DEFAULT = "보내주시는 마음 늘 감사해요";

/** 링크 페이지 감사 문장 — 팬덤 이름이 있으면 「{팬덤 이름} 여러분의 마음 늘 감사해요」. */
export function thanksLine(fanName: string | null | undefined): string {
  const name = fanName?.trim() ?? "";
  return name ? `${name} 여러분의 마음 늘 감사해요` : THANKS_DEFAULT;
}
