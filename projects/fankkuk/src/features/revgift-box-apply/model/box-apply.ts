import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import type { Viewer } from "@/entities/session/model/viewer";

// 선물함 신청·신청 취소 (revgift-box INV-GB4·GB5·GB6, 정할 것 Q5). 팬이 부른다.
// 신청 본문에는 초대 토큰만 싣는다 — 받을 주소는 팬이 설정에 등록한 주소(봉인된 값)를 DB 신청 함수가 그 신청에 복사한다(INV-GB6, reverse-gift INV-R4).
// 팔로우·인원·마감·이미 신청·비공개 토큰은 모두 DB 신청 함수가 로그인 토큰으로 판정한다(선물함 줄·팔로우 줄 잠금 뒤).

type Deps = { client: Pick<SupabaseClient, "rpc">; viewer: Viewer | null };
export type ApplyRefusal = { ok: false; status: 401 | 403 | 404 | 409 | 422; message: string; reason?: "no_address" };

const LOGIN: ApplyRefusal = { ok: false, status: 401, message: "로그인이 필요합니다." };
const FAN_ONLY: ApplyRefusal = { ok: false, status: 403, message: "팬 계정만 신청할 수 있습니다." };
const NOT_FOUND: ApplyRefusal = { ok: false, status: 404, message: "선물함을 찾을 수 없습니다." };

const uuid = z.string().uuid();

function gate(viewer: Viewer | null): ApplyRefusal | null {
  if (!viewer) return LOGIN;
  if (viewer.role !== "fan") return FAN_ONLY;
  return null;
}

const APPLY_REFUSAL: Record<string, ApplyRefusal> = {
  P0002: NOT_FOUND,
  "42501": FAN_ONLY,
  P0022: { ok: false, status: 409, message: "신청이 마감된 선물함입니다." },
  P0023: { ok: false, status: 409, message: "받을 인원이 다 찼습니다." },
  P0025: { ok: false, status: 403, message: "팔로우한 팬만 신청할 수 있습니다." },
  P0027: { ok: false, status: 409, message: "이미 신청했습니다." },
  P0026: { ok: false, status: 422, message: "받을 주소를 먼저 입력해 주세요.", reason: "no_address" },
};

export async function applyBox(deps: Deps, boxId: string, body: unknown): Promise<{ ok: true } | ApplyRefusal> {
  const refused = gate(deps.viewer);
  if (refused) return refused;
  if (!uuid.safeParse(boxId).success) return NOT_FOUND;
  const token = z.object({ token: z.string().max(200) }).safeParse(body);
  const { error } = await deps.client.rpc("revgift_box_apply", {
    p_box_id: boxId,
    p_token: token.success ? token.data.token : null,
    p_envelope: null,
    p_region: null,
  });
  if (error) {
    const known = APPLY_REFUSAL[error.code];
    if (!known) throw new Error(`신청하지 못했다: ${error.code}`);
    return known;
  }
  return { ok: true };
}

export async function withdrawBox(deps: Deps, boxId: string): Promise<{ ok: true } | ApplyRefusal> {
  const refused = gate(deps.viewer);
  if (refused) return refused;
  if (!uuid.safeParse(boxId).success) return NOT_FOUND;
  const { error } = await deps.client.rpc("revgift_box_withdraw", { p_box_id: boxId });
  if (error) {
    if (error.code === "P0002") return { ok: false, status: 404, message: "신청 내역을 찾을 수 없습니다." };
    if (error.code === "P0022") return { ok: false, status: 409, message: "마감된 선물함은 신청을 취소할 수 없습니다." };
    throw new Error(`신청을 취소하지 못했다: ${error.code}`);
  }
  return { ok: true };
}
