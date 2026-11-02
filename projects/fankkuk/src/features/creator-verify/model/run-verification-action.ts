import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { CHANNEL_URL_MESSAGE, parseChannelUrl } from "@/entities/creator/model/channel-url";
import type { Viewer } from "@/entities/session/model/viewer";
import type { ChannelLoginVerifier } from "@/shared/api/platform-channel/login-verifier";
import { MESSAGE_FORBIDDEN, MESSAGE_NOT_FOUND } from "@/shared/lib/http/pg-error-reply";
import type { JsonReply } from "@/shared/lib/http/private-json";

// 크리에이터의 채널 확인 처리 — 앱 서버 (creator-verification INV-V1·V2·V4·V14·V17·V20).
// 2026-11-02 「팬꾹 링크 게시 확인」으로 바뀌었다 — 요청은 바로 확인 대기, 인증 코드·코드 자동 확인은 없다.
// 누구의 처리인지는 세션에서 확인한 사람으로 정한다(INV-L2). 본문에는 채널 주소나 요청 식별값만 온다 —
// 계정·아이디·코드·확인 방법은 받지 않는다(받으면 400). 요청 줄의 링크용 아이디는 DB 가 그 계정의 지금 아이디로 적는다(INV-V17).
// - request·withdraw·recheck_request: 로그인한 사람의 세션 클라이언트로 DB 함수를 부른다(DB 가 그 토큰의 사람으로 처리한다).
// - login (INV-V14): 로그인 창구가 답한 채널로 관리자 키 전용 로그인 확인 함수를 부른다. 채널 키는 창구의 답이다.
// 창구가 없으면(운영 — 외부 연결 전) 로그인 확인은 거부된다(503).

export type VerificationActionDeps = {
  session: Pick<SupabaseClient, "rpc">;
  admin: Pick<SupabaseClient, "rpc">;
  viewer: Viewer | null;
  loginVerifier: ChannelLoginVerifier | null;
};

const channelUrl = z.string().max(300);
const bodyShape = z.discriminatedUnion("action", [
  z.object({ action: z.literal("request"), channelUrl }).strict(),
  z.object({ action: z.literal("withdraw"), applicationId: z.guid() }).strict(),
  z.object({ action: z.literal("recheck_request") }).strict(),
  z.object({ action: z.literal("login"), channelUrl }).strict(),
]);

export type VerificationAction = z.input<typeof bodyShape>;

/** INV-V17: 링크용 아이디가 없으면 요청을 거부할 때의 문구. 화면은 이 상태에서 요청 칸 대신 링크 만들기 칸을 보여 주므로, 이 문구는 화면이 낡았을 때만 보인다. */
export const HANDLE_NEEDED_MESSAGE = "팬꾹 링크를 먼저 만들어 주세요.";

/** DB 오류 코드 → 화면 문구. DB 가 낸 문구는 그대로 내보내지 않는다. */
const CODE_REPLY: Record<string, JsonReply> = {
  FKV02: { status: 400, body: { message: CHANNEL_URL_MESSAGE.unsupported } },
  FKV03: { status: 409, body: { message: "진행 중인 확인 요청이 있습니다. 기존 요청이 끝나거나 요청을 취소한 뒤 다시 요청해 주세요." } },
  FKV04: { status: 409, body: { message: "이 채널로는 더 요청할 수 없습니다. 1:1 문의를 이용해 주세요." } },
  FKV05: { status: 409, body: { message: "이미 등록된 채널입니다." } },
  FKV06: { status: 409, body: { message: "이미 확인 중인 채널입니다." } },
  FKV13: { status: 409, body: { message: "현재 소유자 확인이 완료된 채널입니다." } },
  FKV16: { status: 409, body: { message: "운영자 재확인이 필요합니다. 채널 주소로 확인을 요청해 주세요." } },
  FKV17: { status: 409, body: { message: HANDLE_NEEDED_MESSAGE } },
  "22023": { status: 400, body: { message: CHANNEL_URL_MESSAGE.shape } },
  "42501": { status: 403, body: { message: MESSAGE_FORBIDDEN } },
  P0002: { status: 404, body: { message: MESSAGE_NOT_FOUND } },
  "55000": { status: 409, body: { message: "이미 처리된 요청입니다. 페이지를 새로고침해 주세요." } },
};
const FAILED: JsonReply = { status: 500, body: { message: "요청을 처리하지 못했습니다. 잠시 후 다시 시도해 주세요." } };
const UNAVAILABLE: JsonReply = { status: 503, body: { message: "현재 이 방법으로 확인할 수 없습니다. ‘확인 요청’을 이용해 주세요." } };
const OK: JsonReply = { status: 200, body: { ok: true } };

function errorReply(code: string | undefined): JsonReply {
  return (code && CODE_REPLY[code]) || FAILED;
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
  if (!deps.viewer) return { status: 401, body: { message: "로그인이 필요합니다." } };
  if (deps.viewer.role !== "creator") return { status: 403, body: { message: "크리에이터 계정만 이용할 수 있습니다." } };
  const shaped = bodyShape.safeParse(body);
  if (!shaped.success) return { status: 400, body: { message: "유효하지 않은 요청입니다. 페이지를 새로고침한 뒤 다시 시도해 주세요." } };
  const d = shaped.data;
  switch (d.action) {
    case "request": {
      // INV-V2: 앱 서버 입력 검사 — DB 가 같은 규칙으로 다시 본다. 넘기는 주소는 다시 만든 주소다.
      const parsed = parseChannelUrl(d.channelUrl);
      if (!parsed.ok) return { status: 400, body: { message: CHANNEL_URL_MESSAGE[parsed.reason] } };
      return sessionCall(deps, "request_creator_verification", { p_channel_url: parsed.channel.channelUrl });
    }
    case "withdraw":
      return sessionCall(deps, "withdraw_creator_verification", { p_application_id: d.applicationId });
    case "recheck_request":
      return sessionCall(deps, "request_creator_link_recheck", {});
    case "login":
      return loginConfirm(deps, deps.viewer.userId, d.channelUrl);
  }
}
