import type { SupabaseClient } from "@supabase/supabase-js";
import { nicknameRejection } from "@/entities/session/model/nickname-rule";
import type { Viewer } from "@/entities/session/model/viewer";
import { profileFieldOf, profileInputSchema, type ProfileField } from "./profile-input";

// 팬 프로필 글 저장 — 자기소개·닉네임 (my-account INV-A12). 요청한 사람의 세션 클라이언트로 update_my_fan_profile 을 한 번 부른다 —
// DB 가 로그인 토큰으로 사람을 정하고(계정 ID 인자 없음) 팬 역할·길이·필터·닉네임 겹침을 다시 검사한다.
// 두 칸이 한 처리라 하나라도 틀리면 둘 다 바뀌지 않는다(닉네임이 겹치면 같이 보낸 소개도 그대로).
// 닉네임 판정·문구는 내 정보 고치기와 같다(nickname_problem·유일 인덱스 → FKU04~07, nicknameRejection).
// 사진·배경 사진은 이 경로가 아니라 서버 사진 저장 경로(save-fan-image)로만 바뀐다(INV-A14).

export type SaveProfileDeps = { client: Pick<SupabaseClient, "rpc">; viewer: Viewer | null };

export type SaveProfileResult =
  | { ok: true; intro: string | null; nickname: string | null }
  | { ok: false; status: 400 | 401 | 403 | 409; message: string; field?: ProfileField };

const INTRO_REFUSALS: Readonly<Record<string, string>> = {
  FKF01: "자기소개에 쓸 수 없는 말이 들어 있어요.",
  FKF02: "자기소개에 전화번호·이메일·인터넷 주소는 쓸 수 없어요.",
  FKF03: "자기소개에 글자나 숫자를 하나 이상 넣어 주세요.",
};

export async function saveFanProfile(deps: SaveProfileDeps, body: unknown): Promise<SaveProfileResult> {
  if (!deps.viewer) return { ok: false, status: 401, message: "로그인이 필요해요." };
  if (deps.viewer.role !== "fan") return { ok: false, status: 403, message: "팬 계정만 팬 프로필을 고칠 수 있어요." };

  const parsed = profileInputSchema.safeParse(body);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    const field = profileFieldOf(issue?.path);
    const message = issue?.message ?? "입력을 확인해 주세요.";
    return field ? { ok: false, status: 400, field, message } : { ok: false, status: 400, message };
  }
  const intro = parsed.data.intro ?? null;
  const nickname = parsed.data.nickname ?? null;

  const { error } = await deps.client.rpc("update_my_fan_profile", { p_intro: intro, p_nickname: nickname });
  if (!error) return { ok: true, intro, nickname };
  const nick = nicknameRejection(error.code);
  if (nick) return { ok: false, status: nick.status, field: "nickname", message: nick.message };
  const introRefusal = Object.hasOwn(INTRO_REFUSALS, error.code) ? INTRO_REFUSALS[error.code] : undefined;
  if (introRefusal) return { ok: false, status: 400, field: "intro", message: introRefusal };
  if (error.code === "22023") return { ok: false, status: 400, message: "입력을 확인해 주세요." };
  if (error.code === "42501") return { ok: false, status: 401, message: "로그인이 필요해요." };
  throw new Error(`팬 프로필을 저장하지 못했다: ${error.code}`);
}
