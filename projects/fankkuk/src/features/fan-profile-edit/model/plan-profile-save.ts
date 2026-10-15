import { nicknameSchema } from "@/entities/session/model/nickname-rule";
import { introField, type ProfileField } from "./profile-input";

// 프로필 수정 화면의 「저장하기」가 무엇을 보낼지 정한다 (my-account INV-A12). 화면은 이 답대로 칸 오류를 띄우거나 보낸다.
// - 소개는 늘 검사하고(지금 칸의 값이 규칙에 맞아야 한다), 닉네임은 바뀌었을 때만 검사한다 — 바꾸지 않은 옛 닉네임이 새 규칙에
//   맞지 않아도 소개 저장을 막지 않는다.
// - 마지막으로 저장된 값과 다른 칸만 보낸다. 둘 다 같으면 보내지 않는다.

export type ProfileDraft = { nickname: string; intro: string };

export type ProfilePlan =
  | { kind: "invalid"; field: ProfileField; message: string }
  | { kind: "unchanged" }
  | { kind: "send"; body: { intro?: string; nickname?: string } };

export function planFanProfileSave(draft: ProfileDraft, saved: ProfileDraft): ProfilePlan {
  const intro = introField.safeParse(draft.intro);
  if (!intro.success) return { kind: "invalid", field: "intro", message: intro.error.issues[0]?.message ?? "자기소개를 확인해 주세요." };
  const nickChanged = draft.nickname.trim() !== saved.nickname;
  let nickname: string | undefined;
  if (nickChanged) {
    const nick = nicknameSchema.safeParse(draft.nickname);
    if (!nick.success) return { kind: "invalid", field: "nickname", message: nick.error.issues[0]?.message ?? "닉네임을 확인해 주세요." };
    nickname = nick.data;
  }
  const introChanged = intro.data !== saved.intro;
  if (!introChanged && nickname === undefined) return { kind: "unchanged" };
  return { kind: "send", body: { ...(introChanged ? { intro: intro.data } : {}), ...(nickname !== undefined ? { nickname } : {}) } };
}
