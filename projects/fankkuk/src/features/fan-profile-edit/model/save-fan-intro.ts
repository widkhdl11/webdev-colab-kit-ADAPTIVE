import type { SupabaseClient } from "@supabase/supabase-js";
import type { Viewer } from "@/entities/session/model/viewer";
import { introInputSchema } from "./intro-input";

// 팬 자기소개 저장 (my-account INV-A12). 요청한 사람의 세션 클라이언트로 update_my_fan_profile 을 부른다 —
// DB 가 로그인 토큰으로 사람을 정하고(계정 ID 인자 없음) 팬 역할·길이·필터를 다시 검사한다. 하나라도 틀리면 아무 칸도 바뀌지 않는다.
// 사진·배경 사진은 이 경로가 아니라 서버 사진 저장 경로(save-fan-image)로만 바뀐다(INV-A14).

export type SaveIntroDeps = { client: Pick<SupabaseClient, "rpc">; viewer: Viewer | null };

export type SaveIntroResult = { ok: true; intro: string } | { ok: false; status: 400 | 401 | 403; message: string };

const DB_REFUSALS: Readonly<Record<string, string>> = {
  FKF01: "자기소개에 쓸 수 없는 말이 들어 있어요.",
  FKF02: "자기소개에 전화번호·이메일·인터넷 주소는 쓸 수 없어요.",
  FKF03: "자기소개에 글자나 숫자를 하나 이상 넣어 주세요.",
  "22023": "자기소개를 확인해 주세요.",
};

export async function saveFanIntro(deps: SaveIntroDeps, body: unknown): Promise<SaveIntroResult> {
  if (!deps.viewer) return { ok: false, status: 401, message: "로그인이 필요해요." };
  if (deps.viewer.role !== "fan") return { ok: false, status: 403, message: "팬 계정만 팬 프로필을 고칠 수 있어요." };

  const parsed = introInputSchema.safeParse(body);
  if (!parsed.success) return { ok: false, status: 400, message: parsed.error.issues[0]?.message ?? "자기소개를 확인해 주세요." };
  const intro = parsed.data.intro;

  const { error } = await deps.client.rpc("update_my_fan_profile", { p_intro: intro });
  if (!error) return { ok: true, intro };
  const known = Object.hasOwn(DB_REFUSALS, error.code) ? DB_REFUSALS[error.code] : undefined;
  if (known) return { ok: false, status: 400, message: known };
  if (error.code === "42501") return { ok: false, status: 401, message: "로그인이 필요해요." };
  throw new Error(`자기소개를 저장하지 못했다: ${error.code}`);
}
