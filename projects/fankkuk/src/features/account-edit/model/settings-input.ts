import { accountInputSchema, type AccountInput } from "./account-input";

// 계정 설정 화면의 「저장하기」가 보낼 묶음을 만든다 (my-account INV-A5). 내 정보 저장(/api/me)은 닉네임·이메일·알림 넷을 같이 받는데,
// 닉네임은 이 화면에서 고치지 않으므로 지금 값을 그대로 싣는다. 지금 닉네임이 규칙에 맞지 않으면 이 화면에서는 고칠 수 없으므로
// 프로필 수정으로 안내하는 문구를 돌려준다.

export type SettingsDraft = { nickname: string; email: string; notifyKakao: boolean; notifyEmail: boolean };

export type SettingsPlan = { ok: true; input: AccountInput } | { ok: false; message: string };

export const NICKNAME_ELSEWHERE = "‘프로필 수정’에서 닉네임을 입력 규칙에 맞게 변경해 주세요.";

export function planAccountSettingsSave(draft: SettingsDraft): SettingsPlan {
  const parsed = accountInputSchema.safeParse(draft);
  if (parsed.success) return { ok: true, input: parsed.data };
  const issue = parsed.error.issues[0];
  return { ok: false, message: issue?.path[0] === "nickname" ? NICKNAME_ELSEWHERE : (issue?.message ?? "입력한 정보를 확인해 주세요.") };
}
