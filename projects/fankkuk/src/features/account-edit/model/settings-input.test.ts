import { describe, expect, it } from "vitest";
import { NICKNAME_ELSEWHERE, planAccountSettingsSave } from "./settings-input";

// 계정 설정 화면이 내 정보 저장으로 보낼 묶음 (docs/specs/my-account.md INV-A5). 실제 저장·DB 재검사는 save-account 시험과 통합 시험이 본다.

const draft = { nickname: "별빛", email: " byeol@example.com ", notifyKakao: true, notifyEmail: false };

describe("INV-A5: 계정 설정 저장 묶음", () => {
  it("INV-A5: 지금 닉네임을 그대로 싣고 이메일 앞뒤 공백을 뺀 네 칸을 만든다", () => {
    expect(planAccountSettingsSave(draft)).toEqual({ ok: true, input: { nickname: "별빛", email: "byeol@example.com", notifyKakao: true, notifyEmail: false } });
  });

  it("INV-A5 (실패경로): 이메일 꼴이 틀리면 그 문구, 지금 닉네임이 규칙에 안 맞으면 프로필 수정으로 안내", () => {
    expect(planAccountSettingsSave({ ...draft, email: "not-mail" })).toEqual({ ok: false, message: "이메일 주소를 확인해 주세요." });
    expect(planAccountSettingsSave({ ...draft, nickname: "가".repeat(13) })).toEqual({ ok: false, message: NICKNAME_ELSEWHERE });
  });
});
