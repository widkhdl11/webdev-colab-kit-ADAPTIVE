// 예시 데이터 — 크리에이터 「주소와 설정」 화면의 프로필·알림. DB 전에 화면을 보기 위한 것이고 이름·채널은 지어낸 값이다.
// 주소 등록 여부는 DB 에서 읽는다(my-address-status.ts — 주소 값은 오지 않는다, INV-P1·P9). 차단 목록도 DB 에서 읽는다(blocked-senders.ts).

export type CreatorSettingsView = {
  publicName: string;
  channelTitle: string;
  verifiedAt: string | null;
  visibleInSearch: boolean;
  notify: { expiringSoon: boolean; addressOpened: boolean };
};

/** 예시 크리에이터(하루)의 설정. */
export const SAMPLE_CREATOR_SETTINGS: CreatorSettingsView = {
  publicName: "하루",
  channelTitle: "하루의 놀이터",
  verifiedAt: "2026-09-02T03:00:00.000Z",
  visibleInSearch: true,
  notify: { expiringSoon: true, addressOpened: true },
};
