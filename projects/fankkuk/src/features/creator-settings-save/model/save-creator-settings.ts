import type { SupabaseClient } from "@supabase/supabase-js";
import type { Viewer } from "@/entities/session/model/viewer";
import { notifyInputSchema, profileInputSchema } from "./creator-settings-input";
import { daysInputSchema, receivingInputSchema } from "./receiving-input";

// 크리에이터 설정 저장 (my-account INV-A9 공개 정보 · INV-A11 알림).
// 요청한 사람의 세션 클라이언트로 DB 함수를 부른다 — DB 가 로그인 토큰으로 크리에이터를 정하고 입력을 다시 검사한다.
// 넘기는 칸은 정해진 칸뿐이다. 크리에이터가 아니면 DB 를 부르지 않고 거부한다.

export type SaveCreatorSettingsDeps = { client: Pick<SupabaseClient, "rpc">; viewer: Viewer | null };

export type SaveCreatorSettingsResult = { ok: true } | { ok: false; status: 400 | 401 | 403; message: string };

function gate(viewer: Viewer | null): SaveCreatorSettingsResult | null {
  if (!viewer) return { ok: false, status: 401, message: "로그인이 필요해요." };
  if (viewer.role !== "creator") return { ok: false, status: 403, message: "크리에이터 계정만 이 설정을 바꿀 수 있어요." };
  return null;
}

async function call(
  deps: SaveCreatorSettingsDeps,
  fn: string,
  args: Record<string, unknown>,
  messages: Readonly<Record<string, string>> = {},
): Promise<SaveCreatorSettingsResult> {
  const { error } = await deps.client.rpc(fn, args);
  if (!error) return { ok: true };
  const known = messages[error.code];
  if (known) return { ok: false, status: 400, message: known };
  if (error.code === "22023") return { ok: false, status: 400, message: "입력을 확인해 주세요." };
  if (error.code === "42501") return { ok: false, status: 401, message: "로그인이 필요해요." };
  throw new Error(`크리에이터 설정을 저장하지 못했다(${fn}): ${error.code}`);
}

export async function saveCreatorProfile(deps: SaveCreatorSettingsDeps, body: unknown): Promise<SaveCreatorSettingsResult> {
  const denied = gate(deps.viewer);
  if (denied) return denied;
  const parsed = profileInputSchema.safeParse(body);
  if (!parsed.success) return { ok: false, status: 400, message: parsed.error.issues[0]?.message ?? "입력을 확인해 주세요." };
  const { name, intro, searchable } = parsed.data;
  return call(deps, "update_my_creator_profile", { p_name: name, p_intro: intro, p_searchable: searchable });
}

export async function saveCreatorNotify(deps: SaveCreatorSettingsDeps, body: unknown): Promise<SaveCreatorSettingsResult> {
  const denied = gate(deps.viewer);
  if (denied) return denied;
  const parsed = notifyInputSchema.safeParse(body);
  if (!parsed.success) return { ok: false, status: 400, message: "입력을 확인해 주세요." };
  return call(deps, "update_my_creator_notify", { p_notify_kakao: parsed.data.kakao, p_notify_email: parsed.data.email });
}

// creator-receiving INV-B1·B3·B5: 받는 상태·다시 받는 날·팬당 한도. 크리에이터 ID 는 넘기지 않는다 — DB 가 로그인 토큰으로 정한다.
export async function saveCreatorReceiving(deps: SaveCreatorSettingsDeps, body: unknown): Promise<SaveCreatorSettingsResult> {
  const denied = gate(deps.viewer);
  if (denied) return denied;
  const parsed = receivingInputSchema.safeParse(body);
  if (!parsed.success) return { ok: false, status: 400, message: parsed.error.issues[0]?.message ?? "입력을 확인해 주세요." };
  const { resting, resumeOn, monthlyLimit } = parsed.data;
  return call(
    deps,
    "update_my_creator_receiving",
    { p_resting: resting, p_resume_on: resting ? resumeOn : null, p_monthly_limit: monthlyLimit },
    { "22023": "다시 받는 날은 내일부터 1년 안으로, 한도는 1~10개로 골라 주세요." },
  );
}

// creator-receiving INV-B1·B7: 생일(월·일)·기념일(3개까지). 이름 필터는 직접 입력 태그와 같다(creator-tags INV-T7).
export async function saveCreatorDays(deps: SaveCreatorSettingsDeps, body: unknown): Promise<SaveCreatorSettingsResult> {
  const denied = gate(deps.viewer);
  if (denied) return denied;
  const parsed = daysInputSchema.safeParse(body);
  if (!parsed.success) return { ok: false, status: 400, message: parsed.error.issues[0]?.message ?? "입력을 확인해 주세요." };
  const { birthday, anniversaries } = parsed.data;
  return call(
    deps,
    "update_my_creator_days",
    { p_birthday_month: birthday?.month ?? null, p_birthday_day: birthday?.day ?? null, p_anniversaries: anniversaries },
    {
      "22023": "달력에 있는 날짜인지, 기념일 이름이 1~12자인지 확인해 주세요.",
      P0081: "기념일 이름에 쓸 수 없는 말이 들어 있어요.",
      P0082: "기념일 이름에 전화번호·이메일·인터넷 주소는 쓸 수 없어요.",
      P0083: "기념일 이름에 글자나 숫자를 하나 이상 넣어 주세요.",
    },
  );
}
