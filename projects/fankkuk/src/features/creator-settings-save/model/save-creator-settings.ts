import type { SupabaseClient } from "@supabase/supabase-js";
import type { Viewer } from "@/entities/session/model/viewer";
import { notifyInputSchema, profileInputSchema } from "./creator-settings-input";
import { daysInputSchema, receivingInputSchema } from "./receiving-input";
import { hardItemsInputSchema } from "./hard-items-input";
import { handleInputSchema } from "./handle-input";
import { replySettingsInputSchema } from "./reply-settings-input";

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
  // creator-link INV-E6: 한 줄 소개는 직접 입력 태그와 같은 필터를 거친다(DB 가 사유별 코드로 거부)
  return call(
    deps,
    "update_my_creator_profile",
    { p_name: name, p_intro: intro, p_searchable: searchable },
    {
      P0081: "한 줄 소개에 쓸 수 없는 말이 들어 있어요.",
      P0082: "한 줄 소개에 전화번호·이메일·인터넷 주소는 쓸 수 없어요.",
      P0083: "한 줄 소개에 글자나 숫자를 하나 이상 넣어 주세요.",
    },
  );
}

export type SaveHandleResult = { ok: true; handle: string } | { ok: false; status: 400 | 401 | 403; message: string };

// creator-link INV-E1~E4: 링크용 아이디 — 아이디 한 칸만 넘긴다. 크리에이터는 DB 가 로그인 토큰으로 정한다.
export async function saveCreatorHandle(deps: SaveCreatorSettingsDeps, body: unknown): Promise<SaveHandleResult> {
  const denied = gate(deps.viewer);
  if (denied) return denied as SaveHandleResult;
  const parsed = handleInputSchema.safeParse(body);
  if (!parsed.success) return { ok: false, status: 400, message: parsed.error.issues[0]?.message ?? "입력을 확인해 주세요." };
  const { data, error } = await deps.client.rpc("update_my_creator_handle", { p_handle: parsed.data.handle });
  if (!error && typeof data === "string") return { ok: true, handle: data };
  const code = error?.code ?? "";
  if (code === "P0091") {
    const days = Number(error?.details);
    return { ok: false, status: 400, message: Number.isInteger(days) && days > 0 ? `링크 주소는 ${days}일 뒤에 바꿀 수 있어요.` : "링크 주소는 아직 바꿀 수 없어요." };
  }
  const messages: Record<string, string> = {
    "22023": "영문·숫자·밑줄(_)로 3~20자를 적어 주세요.",
    P0090: "사이트가 쓰는 주소라 쓸 수 없어요. 다른 아이디를 골라 주세요.",
    P0092: "이미 누가 쓰고 있는 아이디예요. 다른 아이디를 골라 주세요.",
    P0093: "로그인 아이디와 같은 값은 쓸 수 없어요. 로그인 아이디가 드러나지 않게 다른 값을 골라 주세요.",
  };
  if (messages[code]) return { ok: false, status: 400, message: messages[code] };
  if (code === "42501") return { ok: false, status: 401, message: "로그인이 필요해요." };
  throw new Error(`링크 아이디를 저장하지 못했다: ${code || "응답 꼴"}`);
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

// hard-items INV-H3·H4: 받기 어려운 품목 — 품목·이유·기간·동작만. 품목이 비면 지운다. 크리에이터 ID 는 넘기지 않는다 — DB 가 로그인 토큰으로 정한다.
export async function saveCreatorHardItems(deps: SaveCreatorSettingsDeps, body: unknown): Promise<SaveCreatorSettingsResult> {
  const denied = gate(deps.viewer);
  if (denied) return denied;
  const parsed = hardItemsInputSchema.safeParse(body);
  if (!parsed.success) return { ok: false, status: 400, message: parsed.error.issues[0]?.message ?? "입력을 확인해 주세요." };
  const { categories, reason, period, action } = parsed.data;
  return call(
    deps,
    "update_my_creator_hard_items",
    { p_categories: categories, p_reason: reason, p_period: period, p_action: action },
    { "22023": "품목·이유·기간·동작을 목록에서 골라 주세요." },
  );
}

// gift-reply INV-G8: 답장 모음 보이기 · X 계정 · 태그 허용 — 세 칸만 넘긴다. 크리에이터는 DB 가 로그인 토큰으로 정한다.
export async function saveCreatorReplySettings(deps: SaveCreatorSettingsDeps, body: unknown): Promise<SaveCreatorSettingsResult> {
  const denied = gate(deps.viewer);
  if (denied) return denied;
  const parsed = replySettingsInputSchema.safeParse(body);
  if (!parsed.success) return { ok: false, status: 400, message: parsed.error.issues[0]?.message ?? "입력을 확인해 주세요." };
  const { wallVisible, xHandle, xTagAllowed } = parsed.data;
  return call(
    deps,
    "update_my_reply_settings",
    { p_wall_visible: wallVisible, p_x_handle: xHandle, p_x_tag_allowed: xTagAllowed },
    { "22023": "X 계정은 영문·숫자·밑줄 1~15자로 적어 주세요." },
  );
}
