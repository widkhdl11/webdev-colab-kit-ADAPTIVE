import { describe, expect, it } from "vitest";
import { toMyAccount } from "./my-account";

const ROW = {
  login_id: "byeolbit_fan",
  nickname: "별빛",
  email: "byeolbit.fan@example.com",
  pending_email: null,
  phone_masked: "010-****-5678",
  notify_kakao: true,
  notify_email: false,
};

describe("내 정보 한 줄 옮기기", () => {
  it("DB 한 줄을 화면 모양으로 옮긴다", () => {
    expect(toMyAccount(ROW)).toEqual({
      loginId: "byeolbit_fan",
      nickname: "별빛",
      email: "byeolbit.fan@example.com",
      pendingEmail: null,
      phoneMasked: "010-****-5678",
      notifyKakao: true,
      notifyEmail: false,
    });
  });

  it("INV-A2: 가리지 않은 번호가 오면 화면에 넘기지 않는다", () => {
    expect(toMyAccount({ ...ROW, phone_masked: "010-1234-5678" })).toBeNull();
    expect(toMyAccount({ ...ROW, phone_masked: "01012345678" })).toBeNull();
    expect(toMyAccount({ ...ROW, phone_masked: null })).toMatchObject({ phoneMasked: null });
  });

  it("꼴이 틀린 줄은 null", () => {
    expect(toMyAccount(undefined)).toBeNull();
    expect(toMyAccount({ ...ROW, notify_kakao: "yes" })).toBeNull();
  });
});
