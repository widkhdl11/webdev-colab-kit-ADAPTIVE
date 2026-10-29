import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { CHANNEL_URL_MESSAGE, parseChannelUrl } from "@/entities/creator/model/channel-url";
import type { Viewer } from "@/entities/session/model/viewer";
import type { ChannelBioReader } from "@/shared/api/platform-channel/bio-reader";
import type { ChannelLoginVerifier } from "@/shared/api/platform-channel/login-verifier";
import { MESSAGE_FORBIDDEN, MESSAGE_NOT_FOUND } from "@/shared/lib/http/pg-error-reply";
import type { JsonReply } from "@/shared/lib/http/private-json";
import { bioHasVerificationCode } from "./bio-code";

// 크리에이터의 본인 확인 처리 — 앱 서버 (creator-verification INV-V1·V2·V4·V5·V14·V16).
// 누구의 처리인지는 세션에서 확인한 사람으로 정한다(INV-L2). 본문에는 채널 주소나 신청 식별값만 온다 —
// 계정·코드·확인 방법·소개란 글은 받지 않는다(받으면 400).
// - request·regenerate·post·withdraw: 로그인한 사람의 세션 클라이언트로 DB 함수를 부른다(DB 가 그 토큰의 사람으로 처리한다).
// - auto_check (INV-V16): ① DB 가 1분 제한을 잡고 읽을 채널·찾을 코드를 준다 → ② 소개란 창구로 그 채널의 소개란 칸만 읽는다 →
//   ③ 코드가 꼴 그대로 있는지 → ④ 찾았는지만 DB 에 넘긴다. ①·④ 는 관리자 키 전용 함수라 관리자 클라이언트로, 계정은 세션의 사람.
// - login (INV-V14): 로그인 창구가 답한 채널로 관리자 키 전용 로그인 확인 함수를 부른다. 채널 키는 창구의 답이다.
// 창구가 없으면(운영 — 외부 연결 전) 자동 확인·로그인 확인은 거부된다(503).

export type VerificationActionDeps = {
  session: Pick<SupabaseClient, "rpc">;
  admin: Pick<SupabaseClient, "rpc">;
  viewer: Viewer | null;
  bioReader: ChannelBioReader | null;
  loginVerifier: ChannelLoginVerifier | null;
};

const channelUrl = z.string().max(300);
const bodyShape = z.discriminatedUnion("action", [
  z.object({ action: z.literal("request"), channelUrl }).strict(),
  z.object({ action: z.literal("regenerate") }).strict(),
  z.object({ action: z.literal("post"), applicationId: z.guid() }).strict(),
  z.object({ action: z.literal("withdraw"), applicationId: z.guid() }).strict(),
  z.object({ action: z.literal("auto_check"), applicationId: z.guid() }).strict(),
  z.object({ action: z.literal("login"), channelUrl }).strict(),
]);

export type VerificationAction = z.input<typeof bodyShape>;

export const NOT_FOUND_IN_BIO = "채널 소개란에서 인증 코드를 찾을 수 없습니다.";

/** DB 오류 코드 → 화면 문구. DB 가 낸 문구는 그대로 내보내지 않는다. */
const CODE_REPLY: Record<string, JsonReply> = {
  FKV02: { status: 400, body: { message: CHANNEL_URL_MESSAGE.unsupported } },
  FKV03: { status: 409, body: { message: "진행 중인 신청이 있습니다. 기존 신청을 완료하거나 취소한 뒤 다시 신청해 주세요." } },
  FKV04: { status: 409, body: { message: "채널 신청 횟수를 초과했습니다. 1:1 문의를 이용해 주세요." } },
  FKV05: { status: 409, body: { message: "이미 등록된 채널입니다." } },
  FKV06: { status: 409, body: { message: "이미 확인 중인 채널입니다." } },
  FKV07: { status: 409, body: { message: "이 채널은 인증 코드를 추가 발급받을 수 없습니다. 1:1 문의를 이용해 주세요." } },
  FKV08: { status: 409, body: { message: "확인 기한(7일)이 만료되었습니다. 다시 신청해 주세요." } },
  FKV13: { status: 409, body: { message: "현재 소유자 확인이 완료된 채널입니다." } },
  FKV14: { status: 409, body: { message: "자동 확인을 지원하지 않는 플랫폼입니다. 인증 코드를 채널 소개란에 입력하거나 팬꾹 계정으로 DM을 보낸 뒤 ‘확인 요청’을 눌러 주세요." } },
  FKV15: { status: 429, body: { message: "잠시 후 다시 시도해 주세요." } },
  FKV16: { status: 409, body: { message: "운영자 재확인이 필요합니다. 인증 코드를 받아 ‘확인 요청’을 눌러 주세요." } },
  "22023": { status: 400, body: { message: CHANNEL_URL_MESSAGE.shape } },
  "42501": { status: 403, body: { message: MESSAGE_FORBIDDEN } },
  P0002: { status: 404, body: { message: MESSAGE_NOT_FOUND } },
  "55000": { status: 409, body: { message: "이미 처리된 요청입니다. 페이지를 새로고침해 주세요." } },
};
const FAILED: JsonReply = { status: 500, body: { message: "요청을 처리하지 못했습니다. 잠시 후 다시 시도해 주세요." } };
const UNAVAILABLE: JsonReply = { status: 503, body: { message: "현재 이 방법으로 확인할 수 없습니다. ‘운영자에게 확인 요청’을 이용해 주세요." } };
const OK: JsonReply = { status: 200, body: { ok: true } };

function errorReply(code: string | undefined): JsonReply {
  return (code && CODE_REPLY[code]) || FAILED;
}

const claimedShape = z.object({ platform: z.string(), channel_key: z.string(), code: z.string() }).strict();
const confirmedShape = z.enum(["approved", "not_found"]);

async function autoCheck(deps: VerificationActionDeps, userId: string, applicationId: string): Promise<JsonReply> {
  // 창구가 없으면 1분 제한도 쓰지 않고 거부한다
  const reader = deps.bioReader;
  if (!reader) return UNAVAILABLE;
  // ① 플랫폼 API 를 부르기 전에 1분 제한을 잡는다 — 읽을 채널·찾을 코드는 DB 가 신청 줄에서 정한다
  const claim = await deps.admin.rpc("claim_creator_verification_auto_check", { p_account_id: userId, p_application_id: applicationId });
  if (claim.error) return errorReply(claim.error.code);
  const claimed = claimedShape.parse(claim.data);
  // ② 소개란 칸만 읽는다
  const profile = await reader.readProfile({ platform: claimed.platform, channelKey: claimed.channel_key, codeForFake: claimed.code });
  if (!profile) return { status: 502, body: { message: "채널 정보를 불러오지 못했습니다. 잠시 후 다시 시도해 주세요." } };
  // ③ 꼴 그대로 있는지
  const found = bioHasVerificationCode(profile.bio, claimed.code);
  // ④ 찾았는지만 넘긴다
  const done = await deps.admin.rpc("confirm_creator_verification_auto_check", { p_application_id: applicationId, p_found: found });
  if (done.error) return errorReply(done.error.code);
  const result = confirmedShape.parse(done.data);
  return result === "approved" ? { status: 200, body: { result } } : { status: 200, body: { result, message: NOT_FOUND_IN_BIO } };
}

async function loginConfirm(deps: VerificationActionDeps, userId: string, url: string): Promise<JsonReply> {
  const verifier = deps.loginVerifier;
  if (!verifier) return UNAVAILABLE;
  const parsed = parseChannelUrl(url);
  if (!parsed.ok) return { status: 400, body: { message: CHANNEL_URL_MESSAGE[parsed.reason] } };
  const owned = await verifier.ownedChannel({ accountId: userId, platform: parsed.channel.platform, requestedChannelKey: parsed.channel.channelKey });
  if (!owned) return { status: 403, body: { message: "로그인한 계정으로 채널 소유자를 확인하지 못했습니다." } };
  const { error } = await deps.admin.rpc("confirm_creator_channel_by_login", {
    p_account_id: userId,
    p_platform: owned.platform,
    p_channel_key: owned.channelKey,
  });
  if (!error) return OK;
  if (error.code === "FKV05") return { status: 409, body: { message: "이미 등록된 채널입니다. 1:1 문의를 이용해 주세요." } };
  if (error.code === "22023") return { status: 400, body: { message: "로그인 확인을 지원하지 않는 플랫폼입니다." } };
  return errorReply(error.code);
}

async function sessionCall(deps: VerificationActionDeps, fn: string, args: Record<string, unknown>): Promise<JsonReply> {
  const { error } = await deps.session.rpc(fn, args);
  return error ? errorReply(error.code) : OK;
}

export async function runVerificationAction(deps: VerificationActionDeps, body: unknown): Promise<JsonReply> {
  if (!deps.viewer) return { status: 401, body: { message: "로그인이 필요해요." } };
  if (deps.viewer.role !== "creator") return { status: 403, body: { message: "크리에이터 계정만 이용할 수 있습니다." } };
  const shaped = bodyShape.safeParse(body);
  if (!shaped.success) return { status: 400, body: { message: "유효하지 않은 요청입니다. 페이지를 새로고침한 뒤 다시 시도해 주세요." } };
  const d = shaped.data;
  const userId = deps.viewer.userId;
  switch (d.action) {
    case "request": {
      // INV-V2: 앱 서버 입력 검사 — DB 가 같은 규칙으로 다시 본다. 넘기는 주소는 다시 만든 주소다.
      const parsed = parseChannelUrl(d.channelUrl);
      if (!parsed.ok) return { status: 400, body: { message: CHANNEL_URL_MESSAGE[parsed.reason] } };
      return sessionCall(deps, "request_creator_verification", { p_channel_url: parsed.channel.channelUrl });
    }
    case "regenerate":
      return sessionCall(deps, "regenerate_creator_verification_code", {});
    case "post":
      return sessionCall(deps, "mark_creator_verification_posted", { p_application_id: d.applicationId });
    case "withdraw":
      return sessionCall(deps, "withdraw_creator_verification", { p_application_id: d.applicationId });
    case "auto_check":
      return autoCheck(deps, userId, d.applicationId);
    case "login":
      return loginConfirm(deps, userId, d.channelUrl);
  }
}
