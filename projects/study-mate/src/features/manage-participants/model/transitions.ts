/**
 * 화면이 시킬 수 있는 참여 상태 변경. 다섯 값 중 `pending` 은 여기 없다 —
 * 신청을 만드는 것은 다른 액션(참가 신청)이고, 되돌아가는 전이는 없다(INV-P7).
 *
 * `model/` 에 있는 이유: 버튼(`ParticipantActions`)과 서버가 같은 목록을 봐야 하는데
 * 버튼은 클라이언트 컴포넌트라 서버 전용 모듈을 import 할 수 없다. 전에는 UI 가
 * 같은 union 을 손으로 다시 적고 있었고, 목록이 갈리면 런타임에만 드러났다
 * (2026-09-06 code-reviewer).
 */
export const ALLOWED = ["accepted", "rejected", "kicked", "withdrawn"] as const;
export type Transition = (typeof ALLOWED)[number];

/** 서버가 실패 문구에 쓰는 이름 ("수락할 수 없습니다") */
export const ACTION_NOUN: Readonly<Record<Transition, string>> = {
  accepted: "수락",
  rejected: "거절",
  kicked: "내보내기",
  withdrawn: "탈퇴",
};

/** 버튼에 쓰는 이름. 탈퇴만 「탈퇴하기」로 읽어야 자기 행동으로 읽힌다 */
export const BUTTON_LABEL: Readonly<Record<Transition, string>> = {
  ...ACTION_NOUN,
  withdrawn: "탈퇴하기",
};
