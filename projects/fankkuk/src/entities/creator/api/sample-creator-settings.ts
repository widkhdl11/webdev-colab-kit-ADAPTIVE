// 예시 데이터 — 크리에이터 「주소와 설정」 화면. DB 전에 화면을 보기 위한 것이고 이름·채널은 지어낸 값이다.
// 주소는 값이 아니라 「등록돼 있는가」만 담는다 — 주소는 브라우저에서 잠가 보내므로 화면이 받을 값이 없다(INV-P1).
// 차단 목록은 DB 에서 읽는다(blocked-senders.ts).

export type CreatorSettingsView = {
  addressRegistered: boolean;
  publicName: string;
  channelTitle: string;
  verifiedAt: string | null;
  visibleInSearch: boolean;
  notify: { newRequest: boolean; expiringSoon: boolean; addressOpened: boolean };
};

/** 예시 크리에이터(하루)의 설정. */
export const SAMPLE_CREATOR_SETTINGS: CreatorSettingsView = {
  addressRegistered: true,
  publicName: "하루",
  channelTitle: "하루의 놀이터",
  verifiedAt: "2026-09-02T03:00:00.000Z",
  visibleInSearch: true,
  notify: { newRequest: true, expiringSoon: true, addressOpened: true },
};
