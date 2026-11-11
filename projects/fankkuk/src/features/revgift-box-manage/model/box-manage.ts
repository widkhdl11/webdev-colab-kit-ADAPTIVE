import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { BOX_CAPACITY_MAX, BOX_DESCRIPTION_MAX, BOX_NAME_MAX } from "@/entities/revgift-box/model/box-rules";
import { charCount } from "@/shared/lib/validation/char-count";
import { HIDDEN_CHAR, LINE_BREAK } from "@/shared/lib/validation/hidden-char";
import type { Viewer } from "@/entities/session/model/viewer";

// 선물함 만들기·신청 관리 (revgift-box INV-GB1·GB3·GB5·GB7·GB8). 크리에이터가 부른다.
// 마감 때 넣을 대기 신청 목록을 받는다(2026-11-09 개정 — 정원과 무관, 0명이어도 마감).
// DB 함수가 로그인 토큰으로 누구의 선물함인지·주인인지·상태가 맞는지를 판정한다 — 그래서 로그인 토큰을 실은 요청용 클라이언트로 부르고,
// 본문에서는 정해진 칸만 꺼낸다(계정·크리에이터 id 를 본문에서 받지 않는다). 상태를 직접 고르는 길은 없다(INV-GB1).

type Deps = { client: Pick<SupabaseClient, "rpc">; viewer: Viewer | null };
export type Refusal = { ok: false; status: 400 | 401 | 403 | 404 | 409; message: string };

const LOGIN: Refusal = { ok: false, status: 401, message: "로그인이 필요합니다." };
const CREATOR_ONLY: Refusal = { ok: false, status: 403, message: "크리에이터 계정만 이용할 수 있습니다." };
const NOT_FOUND: Refusal = { ok: false, status: 404, message: "선물함을 찾을 수 없습니다." };
const BAD_INPUT: Refusal = { ok: false, status: 400, message: `선물함 이름은 1~${BOX_NAME_MAX}자, 받을 인원은 1~${BOX_CAPACITY_MAX}명으로 입력해 주세요.` };
const BAD_DESCRIPTION: Refusal = { ok: false, status: 400, message: `간단한 설명은 한 줄로 ${BOX_DESCRIPTION_MAX}자까지 입력할 수 있습니다.` };
// 간단한 설명의 글자 검사 — 팬덤 이름과 같은 필터를 DB 가 돌린다(금칙어 · 연락처 꼴 · 기호만)
const DESCRIPTION_REFUSAL: Record<string, string> = {
  P0087: "간단한 설명에 사용할 수 없는 표현이 포함되어 있습니다.",
  P0088: "간단한 설명에 전화번호·이메일·인터넷 주소는 입력할 수 없습니다.",
  P0089: "간단한 설명에 글자나 숫자를 하나 이상 넣어 주세요.",
};
const FULL: Refusal = { ok: false, status: 409, message: "받을 인원이 다 찼습니다." };

const uuid = z.string().uuid();

function gate(viewer: Viewer | null): Refusal | null {
  if (!viewer) return LOGIN;
  if (viewer.role !== "creator") return CREATOR_ONLY;
  return null;
}

/** 공통 DB 오류. 모르는 코드는 던진다 — 성공으로 치지 않는다 */
function refusalOf(code: string, notOpen: string, what: string): Refusal {
  if (code === "P0002") return NOT_FOUND;
  if (code === "42501") return CREATOR_ONLY;
  if (code === "P0022") return { ok: false, status: 409, message: notOpen };
  if (code === "P0023") return FULL;
  throw new Error(`${what}: ${code}`);
}

const createBody = z.object({
  name: z.string().trim().min(1).max(BOX_NAME_MAX),
  capacity: z.number().int().min(1).max(BOX_CAPACITY_MAX),
  isPublic: z.boolean(),
  // 선택 — 없거나 빈 값이면 설명 없음(null). 한 줄, 앞뒤 공백을 뺀 뒤 100자
  description: z.string().trim().nullish(),
});

/** 간단한 설명 — 빈 값은 null, 줄바꿈·보이지 않는 글자·100자 초과는 거부(undefined). DB 가 같은 규칙에 금칙어 필터까지 다시 본다 */
export function normalizeBoxDescription(raw: string | null | undefined): string | null | undefined {
  const s = raw ?? "";
  if (s === "") return null;
  if (charCount(s) > BOX_DESCRIPTION_MAX || HIDDEN_CHAR.test(s) || LINE_BREAK.test(s)) return undefined;
  return s;
}

export async function createBox(deps: Deps, body: unknown): Promise<{ ok: true; boxId: string } | Refusal> {
  const refused = gate(deps.viewer);
  if (refused) return refused;
  const input = createBody.safeParse(body);
  if (!input.success) return BAD_INPUT;
  const description = normalizeBoxDescription(input.data.description);
  if (description === undefined) return BAD_DESCRIPTION;
  const { data, error } = await deps.client.rpc("create_revgift_box", {
    p_name: input.data.name,
    p_capacity: input.data.capacity,
    p_is_public: input.data.isPublic,
    p_description: description,
  });
  if (error) {
    if (error.code === "22023") return BAD_INPUT;
    const descriptionMessage = DESCRIPTION_REFUSAL[error.code];
    if (descriptionMessage) return { ok: false, status: 400, message: descriptionMessage };
    return refusalOf(error.code, "선물함을 만들 수 없습니다.", "선물함을 만들지 못했다");
  }
  return { ok: true, boxId: z.object({ id: uuid }).parse(data).id };
}

const excludeBody = z.object({ applicationId: uuid, excluded: z.boolean() });

/** 줄마다 제외 토글 — `open` 일 때만, 다시 넣기는 받을 인원 안에서만(INV-GB5·GB7) */
export async function setExcluded(deps: Deps, boxId: string, body: unknown): Promise<{ ok: true; status: "applied" | "excluded" } | Refusal> {
  const refused = gate(deps.viewer);
  if (refused) return refused;
  if (!uuid.safeParse(boxId).success) return NOT_FOUND;
  const input = excludeBody.safeParse(body);
  if (!input.success) return { ok: false, status: 400, message: "다시 시도해 주세요." };
  const { data, error } = await deps.client.rpc("revgift_box_set_excluded", {
    p_box_id: boxId,
    p_application_id: input.data.applicationId,
    p_excluded: input.data.excluded,
  });
  if (error) return refusalOf(error.code, "신청 받는 중에만 제외할 수 있습니다.", "제외를 바꾸지 못했다");
  return { ok: true, status: z.enum(["applied", "excluded"]).parse(data) };
}

const closeBody = z.object({ waitlisted: z.array(uuid).max(100).default([]) });

/**
 * 마감(INV-GB8) — 넣을 대기 신청 목록(비어도 된다). 정원을 넘겨도 되고, 0명이어도 마감한다.
 * 목록이 그 선물함의 대기 신청인지는 DB 가 선물함 줄을 잠근 뒤 대조한다(하나라도 아니면 마감 전체 거부). 돌려주는 값: 담길 신청 수(0 이면 끝난 마감)
 */
export async function closeBox(deps: Deps, boxId: string, body: unknown = {}): Promise<{ ok: true; selected: number } | Refusal> {
  const refused = gate(deps.viewer);
  if (refused) return refused;
  if (!uuid.safeParse(boxId).success) return NOT_FOUND;
  const input = closeBody.safeParse(body ?? {});
  if (!input.success) return { ok: false, status: 400, message: "다시 시도해 주세요." };
  const { data, error } = await deps.client.rpc("revgift_box_close", { p_box_id: boxId, p_waitlisted: [...new Set(input.data.waitlisted)] });
  if (error) {
    if (error.code === "P0028") return { ok: false, status: 409, message: "대기 목록이 바뀌었습니다. 목록을 새로 불러와 다시 골라 주세요." };
    return refusalOf(error.code, "이미 마감했거나 취소한 선물함입니다.", "마감하지 못했다");
  }
  return { ok: true, selected: z.number().int().parse(data) };
}

/** 선물함 취소 — 큰 상자가 입고되기 전까지(INV-GB1, 정할 것 Q9). 결제 전이라 환불이 없다 */
export async function cancelBox(deps: Deps, boxId: string): Promise<{ ok: true } | Refusal> {
  const refused = gate(deps.viewer);
  if (refused) return refused;
  if (!uuid.safeParse(boxId).success) return NOT_FOUND;
  const { error } = await deps.client.rpc("revgift_box_cancel", { p_box_id: boxId });
  if (error) return refusalOf(error.code, "지금은 선물함을 취소할 수 없습니다.", "선물함을 취소하지 못했다");
  return { ok: true };
}

/** 초대 링크 다시 만들기 — 옛 링크는 그 순간 무효(정할 것 Q3) */
export async function renewInvite(deps: Deps, boxId: string): Promise<{ ok: true; token: string } | Refusal> {
  const refused = gate(deps.viewer);
  if (refused) return refused;
  if (!uuid.safeParse(boxId).success) return NOT_FOUND;
  const { data, error } = await deps.client.rpc("revgift_box_renew_invite", { p_box_id: boxId });
  if (error) return refusalOf(error.code, "신청 받는 중인 비공개 선물함만 초대 링크를 바꿀 수 있습니다.", "초대 링크를 바꾸지 못했다");
  return { ok: true, token: z.string().regex(/^[A-Za-z0-9_-]{22,64}$/).parse(data) };
}
