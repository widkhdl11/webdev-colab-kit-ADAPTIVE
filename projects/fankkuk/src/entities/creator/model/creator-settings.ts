// 크리에이터 「주소와 설정」 화면의 프로필·알림 값 (my-account INV-A9~A11). 로그인한 크리에이터 자신의 것만 읽는다.
// 활동 채널·본인 확인 여부는 이 모양에 없다 — 본인 확인 읽기(my_creator_verification_state)의 값을 쓴다(INV-V7: 승인으로만 바뀐다).

export type CreatorSettingsView = {
  publicName: string;
  intro: string;
  visibleInSearch: boolean;
  /** 고른 선택지 id — 숨기지 않은 것만(숨긴 선택지는 고를 수 없다, creator-tags INV-T6). */
  tagIds: readonly string[];
  /** 직접 입력한 태그(없으면 ""). 본인 설정 화면과 운영자 화면에서만 읽힌다(INV-T4). */
  customTag: string;
  /** 알림 두 칸 — 팬과 같다. 승인 요청은 두 칸이 꺼져도 간다(notifications INV-N6). */
  notify: { kakao: boolean; email: boolean };
  /** 가운데를 가린 휴대폰 번호(010-****-5678) — 팬 내 정보와 같은 값. 번호 바꾸기 칸 옆에 보인다. */
  phoneMasked: string | null;
};
