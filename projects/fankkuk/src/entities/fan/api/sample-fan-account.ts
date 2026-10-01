// 예시 데이터 — 로그인한 팬의 개인정보 화면을 그리기 위한 지어낸 값. 저장하지 않는다.
// 닉네임은 주문 예시의 로그인 팬(SAMPLE_SIGNED_IN_FAN)을 라우트가 붙인다.

export type FanAccountView = {
  loginId: string;
  email: string;
  /** 화면에는 가운데를 가린 번호만 온다. */
  phoneMasked: string;
  notifyKakao: boolean;
  notifyEmail: boolean;
};

export const SAMPLE_FAN_ACCOUNT: FanAccountView = {
  loginId: "byeolbit_fan",
  email: "byeolbit.fan@example.com",
  phoneMasked: "010-****-5678",
  notifyKakao: true,
  notifyEmail: true,
};
