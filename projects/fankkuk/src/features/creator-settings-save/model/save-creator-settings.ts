import type { SupabaseClient } from "@supabase/supabase-js";
import type { Viewer } from "@/entities/session/model/viewer";
import { notifyInputSchema, profileInputSchema } from "./creator-settings-input";
import { daysInputSchema, receivingInputSchema } from "./receiving-input";
import { hardItemsInputSchema } from "./hard-items-input";
import { handleInputSchema } from "./handle-input";
import { replySettingsInputSchema } from "./reply-settings-input";
import { previewPickInputSchema } from "./preview-pick-input";

// 크리에이터 설정 저장 (my-account INV-A9 공개 정보 · INV-A11 알림).
// 요청한 사람의 세션 클라이언트로 DB 함수를 부른다 — DB 가 로그인 토큰으로 크리에이터를 정하고 입력을 다시 검사한다.
// 넘기는 칸은 정해진 칸뿐이다. 크리에이터가 아니면 DB 를 부르지 않고 거부한다.

export type SaveCreatorSettingsDeps = { client: Pick<SupabaseClient, "rpc">; viewer: Viewer | null };

export type SaveCreatorSettingsResult = { ok: true } | { ok: false; status: 400 | 401 | 403; message: string };

function gate(viewer: Viewer | null): SaveCreatorSettingsResult | null {
  if (!viewer) return { ok: false, status: 401, message: "로그인이 필요합니다." };
  if (viewer.role !== "creator") return { ok: false, status: 403, message: "크리에이터 계정만 변경할 수 있는 설정입니다." };
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
  if (error.code === "22023") return { ok: false, status: 400, message: "입력한 정보를 확인해 주세요." };
  if (error.code === "42501") return { ok: false, status: 401, message: "로그인이 필요합니다." };
  throw new Error(`크리에이터 설정을 저장하지 못했다(${fn}): ${error.code}`);
}

export async function saveCreatorProfile(deps: SaveCreatorSettingsDeps, body: unknown): Promise<SaveCreatorSettingsResult> {
  const denied = gate(deps.viewer);
  if (denied) return denied;
  const parsed = profileInputSchema.safeParse(body);
  if (!parsed.success) return { ok: false, status: 400, message: parsed.error.issues[0]?.message ?? "입력한 정보를 확인해 주세요." };
  const { name, intro, searchable, fanName, personalColor } = parsed.data;
  // creator-link INV-E6: 한 줄 소개는 직접 입력 태그와 같은 필터를 거친다(DB 가 사유별 코드로 거부).
  // 팬을 부르는 이름(추가분 4-1)도 같은 필터. 본문에 없는 칸은 넘기지 않는다 — DB 가 지금 값 그대로 둔다(다른 화면이 고친 칸을 덮어쓰지 않게)
  const args: Record<string, string | boolean> = {};
  if (name !== undefined) args.p_name = name;
  if (intro !== undefined) args.p_intro = intro;
  if (searchable !== undefined) args.p_searchable = searchable;
  if (fanName !== undefined) args.p_fan_name = fanName;
  // creator-link INV-E13: 테마 색 — 8색인지 위에서 봤고 대문자로 바꿨다. 팬컬러·글자색은 받지도 넘기지도 않는다(INV-E13·E14)
  if (personalColor !== undefined) args.p_personal_color = personalColor;
  return call(
    deps,
    "update_my_creator_profile",
    args,
    {
      P0081: "한 줄 소개에 사용할 수 없는 표현이 포함되어 있습니다.",
      P0082: "한 줄 소개에 전화번호·이메일·인터넷 주소는 입력할 수 없습니다.",
      P0083: "한 줄 소개에 글자나 숫자를 하나 이상 넣어 주세요.",
      P0084: "팬덤 이름에 사용할 수 없는 표현이 포함되어 있습니다.",
      P0085: "팬덤 이름에 전화번호·이메일·인터넷 주소는 입력할 수 없습니다.",
      P0086: "팬덤 이름에 글자나 숫자를 하나 이상 넣어 주세요.",
    },
  );
}

export type SaveHandleResult = { ok: true; handle: string } | { ok: false; status: 400 | 401 | 403; message: string };

// creator-link INV-E1~E4: 링크용 아이디 — 아이디 한 칸만 넘긴다. 크리에이터는 DB 가 로그인 토큰으로 정한다.
export async function saveCreatorHandle(deps: SaveCreatorSettingsDeps, body: unknown): Promise<SaveHandleResult> {
  const denied = gate(deps.viewer);
  if (denied) return denied as SaveHandleResult;
  const parsed = handleInputSchema.safeParse(body);
  if (!parsed.success) return { ok: false, status: 400, message: parsed.error.issues[0]?.message ?? "입력한 정보를 확인해 주세요." };
  const { data, error } = await deps.client.rpc("update_my_creator_handle", { p_handle: parsed.data.handle });
  if (!error && typeof data === "string") return { ok: true, handle: data };
  const code = error?.code ?? "";
  if (code === "P0091") {
    const days = Number(error?.details);
    return { ok: false, status: 400, message: Number.isInteger(days) && days > 0 ? `링크 주소 변경까지 ${days}일 남았습니다.` : "아직 링크 주소를 변경할 수 없습니다." };
  }
  const messages: Record<string, string> = {
    "22023": "영문·숫자·밑줄(_)로 3~20자를 입력해 주세요.",
    P0090: "서비스에서 사용하는 주소입니다. 다른 링크 주소를 입력해 주세요.",
    P0092: "이미 사용 중인 링크 주소입니다. 다른 주소를 입력해 주세요.",
    P0093: "로그인 아이디와 다른 링크 주소를 입력해 주세요.",
  };
  if (messages[code]) return { ok: false, status: 400, message: messages[code] };
  if (code === "42501") return { ok: false, status: 401, message: "로그인이 필요합니다." };
  throw new Error(`링크 아이디를 저장하지 못했다: ${code || "응답 꼴"}`);
}

export async function saveCreatorNotify(deps: SaveCreatorSettingsDeps, body: unknown): Promise<SaveCreatorSettingsResult> {
  const denied = gate(deps.viewer);
  if (denied) return denied;
  const parsed = notifyInputSchema.safeParse(body);
  if (!parsed.success) return { ok: false, status: 400, message: "입력한 정보를 확인해 주세요." };
  const saved = await call(deps, "update_my_creator_notify", { p_notify_kakao: parsed.data.kakao, p_notify_email: parsed.data.email });
  // 선물 소식 바로 받기(notification-batching INV-NB5) — 두 칸 경로(INV-A11)는 두 칸만 받으므로 본인 함수로 따로 저장한다
  if (!saved.ok || parsed.data.instant === undefined) return saved;
  return call(deps, "set_notification_instant", { p_instant: parsed.data.instant });
}

// creator-receiving INV-B1·B3·B5: 받는 상태·다시 받는 날·팬당 한도. 크리에이터 ID 는 넘기지 않는다 — DB 가 로그인 토큰으로 정한다.
export async function saveCreatorReceiving(deps: SaveCreatorSettingsDeps, body: unknown): Promise<SaveCreatorSettingsResult> {
  const denied = gate(deps.viewer);
  if (denied) return denied;
  const parsed = receivingInputSchema.safeParse(body);
  if (!parsed.success) return { ok: false, status: 400, message: parsed.error.issues[0]?.message ?? "입력한 정보를 확인해 주세요." };
  const { resting, resumeOn, monthlyLimit } = parsed.data;
  return call(
    deps,
    "update_my_creator_receiving",
    { p_resting: resting, p_resume_on: resting ? resumeOn : null, p_monthly_limit: monthlyLimit },
    { "22023": "다시 받는 날은 내일부터 1년 안으로, 한도는 1~10개로 선택해 주세요." },
  );
}

// creator-receiving INV-B1·B7: 생일(월·일)·기념일(3개까지). 이름 필터는 직접 입력 태그와 같다(creator-tags INV-T7).
export async function saveCreatorDays(deps: SaveCreatorSettingsDeps, body: unknown): Promise<SaveCreatorSettingsResult> {
  const denied = gate(deps.viewer);
  if (denied) return denied;
  const parsed = daysInputSchema.safeParse(body);
  if (!parsed.success) return { ok: false, status: 400, message: parsed.error.issues[0]?.message ?? "입력한 정보를 확인해 주세요." };
  const { birthday, anniversaries } = parsed.data;
  return call(
    deps,
    "update_my_creator_days",
    { p_birthday_month: birthday?.month ?? null, p_birthday_day: birthday?.day ?? null, p_anniversaries: anniversaries },
    {
      "22023": "달력에 있는 날짜인지, 기념일 이름이 1~12자인지 확인해 주세요.",
      P0081: "기념일 이름에 사용할 수 없는 표현이 포함되어 있습니다.",
      P0082: "기념일 이름에 전화번호·이메일·인터넷 주소는 입력할 수 없습니다.",
      P0083: "기념일 이름에 글자나 숫자를 하나 이상 넣어 주세요.",
    },
  );
}

// hard-items INV-H3·H4: 받기 어려운 품목 — 품목·이유·기간·동작만. 품목이 비면 지운다. 크리에이터 ID 는 넘기지 않는다 — DB 가 로그인 토큰으로 정한다.
export async function saveCreatorHardItems(deps: SaveCreatorSettingsDeps, body: unknown): Promise<SaveCreatorSettingsResult> {
  const denied = gate(deps.viewer);
  if (denied) return denied;
  const parsed = hardItemsInputSchema.safeParse(body);
  if (!parsed.success) return { ok: false, status: 400, message: parsed.error.issues[0]?.message ?? "입력한 정보를 확인해 주세요." };
  const { categories, reason, period, action } = parsed.data;
  return call(
    deps,
    "update_my_creator_hard_items",
    { p_categories: categories, p_reason: reason, p_period: period, p_action: action },
    { "22023": "선물 종류·이유·기간·제한 방식을 목록에서 선택해 주세요." },
  );
}

// gift-reply INV-G8: 답장 모음 보이기 · X 계정 · 태그 허용 — 세 칸만 넘긴다. 크리에이터는 DB 가 로그인 토큰으로 정한다.
export async function saveCreatorReplySettings(deps: SaveCreatorSettingsDeps, body: unknown): Promise<SaveCreatorSettingsResult> {
  const denied = gate(deps.viewer);
  if (denied) return denied;
  const parsed = replySettingsInputSchema.safeParse(body);
  if (!parsed.success) return { ok: false, status: 400, message: parsed.error.issues[0]?.message ?? "입력한 정보를 확인해 주세요." };
  const { wallVisible, xHandle, xTagAllowed } = parsed.data;
  return call(
    deps,
    "update_my_reply_settings",
    { p_wall_visible: wallVisible, p_x_handle: xHandle, p_x_tag_allowed: xTagAllowed },
    { "22023": "X 계정은 영문·숫자·밑줄 1~15자로 입력해 주세요." },
  );
}

// creator-link INV-E1·E10: 링크 미리보기 이미지에 쓸 사진(프로필 사진·팬덤 심볼) — 고르기 한 칸만 넘긴다. 크리에이터는 DB 가 로그인 토큰으로 정한다.
// 심볼이 없는데 심볼을 고르면 DB 가 거부한다(P0096).
export async function savePreviewPick(deps: SaveCreatorSettingsDeps, body: unknown): Promise<SaveCreatorSettingsResult> {
  const denied = gate(deps.viewer);
  if (denied) return denied;
  const parsed = previewPickInputSchema.safeParse(body);
  if (!parsed.success) return { ok: false, status: 400, message: "프로필 사진과 팬마크 가운데 하나를 선택해 주세요." };
  return call(deps, "set_my_preview_pick", { p_pick: parsed.data.pick }, { P0096: "팬마크를 먼저 등록해 주세요." });
}
