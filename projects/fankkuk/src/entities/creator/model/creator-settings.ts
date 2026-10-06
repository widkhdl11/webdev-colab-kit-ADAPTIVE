// 크리에이터 「주소와 설정」 화면의 프로필·알림 값 (my-account INV-A9~A11). 로그인한 크리에이터 자신의 것만 읽는다.
// 방송 채널·본인 확인 여부는 이 모양에 없다 — 본인 확인 읽기(my_creator_verification_state)의 값을 쓴다(INV-V7: 승인으로만 바뀐다).

export type CreatorSettingsView = {
  publicName: string;
  intro: string;
  visibleInSearch: boolean;
  /** 알림 두 칸 — 팬과 같다. 승인 요청은 두 칸이 꺼져도 간다(notifications INV-N6). */
  notify: { kakao: boolean; email: boolean };
};
