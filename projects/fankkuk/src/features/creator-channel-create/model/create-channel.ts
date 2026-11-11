import type { SupabaseClient } from "@supabase/supabase-js";
import {
  CHANNEL_EXISTS_CODE,
  CHANNEL_EXISTS_MESSAGE,
  fanNameFilterMessage,
  TAG_UNAVAILABLE_MESSAGE,
} from "@/entities/creator/model/channel-profile";
import { tagFilterMessage } from "@/entities/creator/model/creator-tags";
import { nicknameRejection } from "@/entities/session/model/nickname-rule";
import type { Viewer } from "@/entities/session/model/viewer";
import { channelCreateInputSchema, channelFieldOf, type ChannelCreateField } from "./channel-create-input";

// 채널 만들기 서버 처리(signup INV-U21). 요청한 사람의 세션 클라이언트로 create_my_channel 을 한 번 부른다 —
// DB 가 로그인 토큰으로 크리에이터를 정하고, 닉네임이 비어 있을 때 한 번만, 닉네임·팬덤 이름·태그를 한 처리에서 저장한다
// (하나라도 틀리면 아무것도 저장하지 않는다). 크리에이터가 아니면 DB 를 부르지 않고 거부한다.

export type CreateChannelDeps = { client: Pick<SupabaseClient, "rpc">; viewer: Viewer | null };

export type ChannelCreateRejection = { status: 400 | 403 | 409; field: ChannelCreateField; message: string };

export type CreateChannelResult = { ok: true } | ({ ok: false; status: 400 | 401 | 403 | 409 } & Omit<ChannelCreateRejection, "status">);

const CREATOR_ONLY = "크리에이터 계정만 채널을 만들 수 있습니다.";
const INPUT_CHECK_MESSAGE = "입력한 내용을 확인해 주세요.";

/**
 * DB 오류 코드 → 칸별 응답. 모르는 코드는 null(부르는 쪽이 던진다 — 성공으로 치지 않는다).
 * 닉네임 겹침 FKU04·필터 FKU05~07(가입·내 정보와 같은 문구) · 팬덤 이름 필터 P0084~86 · 태그 필터(creator-tags INV-T7) ·
 * 꼴 거부 22023 — DB 가 닉네임·팬덤 이름·태그 세 곳에서 같은 코드로 낸다. 입력 검사를 지난 뒤라 보통은 그 사이 숨긴 태그 선택지지만,
 * 화면 검사와 DB 검사가 어긋날 때 엉뚱한 칸에 문구가 뜨지 않게 DB 오류 문장의 첫 말로 칸을 가른다(create_my_channel·fan_name_checked 의 문장).
 * 이미 만듦 FKN02 · 크리에이터 아님 42501.
 */
export function channelCreateRejection(code: string | undefined, dbMessage = ""): ChannelCreateRejection | null {
  const nick = nicknameRejection(code);
  if (nick) return { status: nick.status, field: "nickname", message: nick.message };
  const fan = fanNameFilterMessage(code);
  if (fan) return { status: 400, field: "fanName", message: fan };
  const tag = tagFilterMessage(code);
  if (tag) return { status: 400, field: "tags", message: tag };
  if (code === "22023") {
    if (dbMessage.startsWith("닉네임")) return { status: 400, field: "nickname", message: INPUT_CHECK_MESSAGE };
    if (dbMessage.startsWith("팬을 부르는")) return { status: 400, field: "fanName", message: INPUT_CHECK_MESSAGE };
    return { status: 400, field: "tags", message: TAG_UNAVAILABLE_MESSAGE };
  }
  if (code === CHANNEL_EXISTS_CODE) return { status: 409, field: "form", message: CHANNEL_EXISTS_MESSAGE };
  if (code === "42501") return { status: 403, field: "form", message: CREATOR_ONLY };
  return null;
}

export async function createMyChannel(deps: CreateChannelDeps, body: unknown): Promise<CreateChannelResult> {
  if (!deps.viewer) return { ok: false, status: 401, field: "form", message: "로그인이 필요합니다." };
  if (deps.viewer.role !== "creator") return { ok: false, status: 403, field: "form", message: CREATOR_ONLY };
  const parsed = channelCreateInputSchema.safeParse(body);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return { ok: false, status: 400, field: channelFieldOf(issue?.path ?? []), message: issue?.message ?? "입력한 정보를 확인해 주세요." };
  }
  const { nickname, fanName, tagIds, customTag } = parsed.data;
  const { error } = await deps.client.rpc("create_my_channel", {
    p_nickname: nickname,
    p_fan_name: fanName ? fanName : null,
    p_tag_ids: tagIds,
    p_custom_tag: customTag === "" ? null : customTag,
  });
  if (!error) return { ok: true };
  const rejected = channelCreateRejection(error.code, error.message);
  if (rejected) return { ok: false, ...rejected };
  throw new Error(`채널을 만들지 못했다: ${error.code}`);
}
