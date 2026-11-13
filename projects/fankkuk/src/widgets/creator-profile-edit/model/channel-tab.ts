import { myVerificationPanel, type MyVerification, type MyVerificationState } from "@/entities/creator/model/creator-verification";

// 채널 탭에 「선물 링크」 판(링크 주소 칸)을 그릴지.
// 채널 소유자 확인 판은 링크용 아이디가 없으면(link_needed) 그 안에서 ① 팬꾹 링크 만들기 칸을 그린다 — 그동안 선물 링크 판까지 그리면
// 같은 탭에 링크 입력 칸이 둘 생긴다(옮기기 전에는 상세 설정·계정 설정 두 화면에 나뉘어 없던 중복). 그래서 그 단계에서는 선물 링크 판을 그리지 않는다.
// 채널이 없으면(name === null) 확인 판은 「채널 만들기」 링크만 그리므로 선물 링크 판을 그대로 둔다.
export function showsLinkSection(state: MyVerificationState, rows: readonly MyVerification[]): boolean {
  if (state.name === null) return true;
  return myVerificationPanel(state, rows).stage !== "link_needed";
}
