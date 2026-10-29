import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { normalizeReplyLine, REPLY_INPUT_MESSAGE, REPLY_PHRASES, replyLineProblem } from "@/entities/gift-reply/model/reply";
import type { Viewer } from "@/entities/session/model/viewer";

// 받았어요 · 답장 · 답장 지우기 · 공개 동의 저장 (gift-reply INV-G1·G2·G3·G4·G8).
// 요청한 사람의 세션 클라이언트로 DB 함수를 부른다 — DB 가 로그인 토큰으로 받는 크리에이터·보낸 사람인지 확인하고 규칙을 다시 검사한다.
// 본문에서는 정해진 칸만 꺼낸다. 크리에이터 ID·팬 ID 칸은 있어도 읽지 않는다.

export type GiftReplyDeps = { client: Pick<SupabaseClient, "rpc">; viewer: Viewer | null };
type Refusal = { ok: false; status: 400 | 401 | 403 | 404; message: string };

const boxId = z.string().regex(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);

const confirmSchema = z
  .object({ boxId, phrase: z.enum(REPLY_PHRASES).nullable(), line: z.string().max(400).nullable().optional() })
  .transform((v) => ({ boxId: v.boxId, phrase: v.phrase, line: normalizeReplyLine(v.line) }))
  .refine((v) => v.phrase !== null || v.line === null, REPLY_INPUT_MESSAGE.lineWithoutPhrase)
  .refine((v) => replyLineProblem(v.line) !== "too_long", REPLY_INPUT_MESSAGE.tooLong)
  .refine((v) => replyLineProblem(v.line) !== "forbidden_chars", REPLY_INPUT_MESSAGE.forbiddenChars);

// DB 오류 코드 → 사람이 읽는 문구. 남의 상자와 없는 상자는 같은 404 로(있는지 알리지 않는다).
const MESSAGES: Readonly<Record<string, { status: Refusal["status"]; message: string }>> = {
  "42501": { status: 401, message: "로그인이 필요합니다." },
  P0002: { status: 404, message: "상자를 찾을 수 없습니다. 새로고침해 주세요." },
  P0100: { status: 400, message: "출고 후 수령을 확인할 수 있습니다." },
  P0101: { status: 400, message: "이미 답장한 상자입니다. 답장은 수정할 수 없고 삭제만 가능합니다." },
  P0102: { status: 400, message: "삭제한 답장은 다시 작성할 수 없습니다." },
  P0103: { status: 400, message: "삭제할 답장이 없습니다. 새로고침해 주세요." },
  P0081: { status: 400, message: "사용할 수 없는 표현이 포함되어 있습니다." },
  P0082: { status: 400, message: "전화번호·이메일·인터넷 주소는 입력할 수 없습니다." },
  "22023": { status: 400, message: "입력 내용을 확인해 주세요." },
};

// 팬의 답장 공개 저장 — 팬 화면 문구(문구 3 다듬은본). 상태 코드는 위 표와 같다
const CONSENT_MESSAGES: Readonly<Record<string, string>> = {
  "42501": "로그인이 필요합니다.",
  P0002: "상자를 찾을 수 없습니다. 새로고침해 주세요.",
  "22023": "입력한 정보를 확인해 주세요.",
};

function refusalOf(code: string, fn: string): Refusal {
  const known = MESSAGES[code];
  if (known) return { ok: false, ...known };
  throw new Error(`${fn} 실패: ${code}`);
}

function creatorOnly(viewer: Viewer | null): Refusal | null {
  if (!viewer) return { ok: false, status: 401, message: "로그인이 필요합니다." };
  if (viewer.role !== "creator") return { ok: false, status: 403, message: "선물을 받은 크리에이터만 이용할 수 있습니다." };
  return null;
}

export type ConfirmResult = "received" | "replied" | "unchanged";

/** INV-G1·G2·G3: 받았어요(문구가 없으면 확인만, 있으면 답장과 함께). 결과 — received·replied·unchanged(이미 받았어요). */
export async function confirmGiftBox(deps: GiftReplyDeps, body: unknown): Promise<{ ok: true; result: ConfirmResult } | Refusal> {
  const denied = creatorOnly(deps.viewer);
  if (denied) return denied;
  const parsed = confirmSchema.safeParse(body);
  if (!parsed.success) return { ok: false, status: 400, message: parsed.error.issues[0]?.message ?? "입력 내용을 확인해 주세요." };
  const { data, error } = await deps.client.rpc("confirm_gift_box", { p_box_id: parsed.data.boxId, p_phrase: parsed.data.phrase, p_line: parsed.data.line });
  if (error) return refusalOf(error.code, "confirm_gift_box");
  const result = z.enum(["received", "replied", "unchanged"]).safeParse(data);
  if (!result.success) throw new Error(`받았어요 결과를 알 수 없다: ${String(data)}`);
  return { ok: true, result: result.data };
}

/** INV-G4: 답장 지우기 — 상자 하나만 넘긴다. */
export async function deleteGiftReply(deps: GiftReplyDeps, body: unknown): Promise<{ ok: true } | Refusal> {
  const denied = creatorOnly(deps.viewer);
  if (denied) return denied;
  const parsed = z.object({ boxId }).safeParse(body);
  if (!parsed.success) return { ok: false, status: 400, message: "잘못된 요청입니다." };
  const { error } = await deps.client.rpc("delete_gift_reply", { p_box_id: parsed.data.boxId });
  if (error) return refusalOf(error.code, "delete_gift_reply");
  return { ok: true };
}

const consentSchema = z.object({ boxId, isPublic: z.boolean(), showNickname: z.boolean() });
const consentRow = z.array(z.object({ fan_public: z.boolean(), fan_show_nickname: z.boolean() }).strict()).length(1);

export type ReplyConsent = { isPublic: boolean; showNickname: boolean };

/**
 * INV-G8: 공개 동의(「공개해도 괜찮아요」·「닉네임도 보이기」). 크리에이터 계정도 선물을 보낼 수 있어 역할로 막지 않는다 —
 * 그 선물을 보낸 사람인지는 DB 가 로그인 토큰으로 본다. 공개를 끄면 닉네임 보이기도 꺼지는 것도 DB 가 정하고,
 * 저장된 두 값을 돌려준다 — 화면은 이 값을 그린다.
 */
export async function saveReplyConsent(deps: GiftReplyDeps, body: unknown): Promise<{ ok: true; consent: ReplyConsent } | Refusal> {
  if (!deps.viewer) return { ok: false, status: 401, message: CONSENT_MESSAGES["42501"] };
  const parsed = consentSchema.safeParse(body);
  if (!parsed.success) return { ok: false, status: 400, message: CONSENT_MESSAGES["22023"] };
  const { data, error } = await deps.client.rpc("set_gift_reply_consent", {
    p_box_id: parsed.data.boxId,
    p_public: parsed.data.isPublic,
    p_show_nickname: parsed.data.showNickname,
  });
  if (error) {
    const refusal = refusalOf(error.code, "set_gift_reply_consent");
    return { ...refusal, message: CONSENT_MESSAGES[error.code] ?? refusal.message };
  }
  const parsedRow = consentRow.safeParse(data);
  if (!parsedRow.success) throw new Error("공개 동의 저장 결과를 알 수 없다");
  const [row] = parsedRow.data;
  return { ok: true, consent: { isPublic: row.fan_public, showNickname: row.fan_show_nickname } };
}
