// 가입 3단계 머리와 단계 줄 완료 표시(UX 명세 signup.md 「2026-11-10 크리에이터 3단계 카카오톡 인증」).
// 크리에이터 3단계의 카카오 서명 카드는 따로 그린다(signup-kakao-step) — 이 머리는 팬 3단계와 크리에이터 장애 대비 6자리 화면(kakao_down)의 것이다.

/** kakao_down 은 제목 「휴대폰 번호 확인」, 연결 설명 줄 없이 장애 안내 상자만 — 안내 내용(인증번호로 가입)과 제목이 어긋나지 않게 */
export function phoneStepHead(role: "fan" | "creator", kakaoDown: boolean): { title: string; lead: string | null; downNotice: boolean } {
  return { title: "휴대폰 번호 확인", lead: null, downNotice: role === "creator" && kakaoDown };
}

/** 단계 줄의 완료 표시 — 지나온 단계만. 크리에이터 3단계에서 계정이 생겼으면(kakao_done) 지금 단계도 완료(1~3 체크) */
export function stepDone({ k, step, reached, accountMade }: { k: number; step: number; reached: number; accountMade: boolean }): boolean {
  return (k !== step || accountMade) && k < reached;
}
