import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { parseAddressInput } from "@/entities/address/model/address-ciphertext";
import { parseSurchargeRegion } from "@/entities/address/model/surcharge-region";
import type { Viewer } from "@/entities/session/model/viewer";

// 선물함 신청·신청 취소 (revgift-box INV-GB4·GB5·GB6, 정할 것 Q5·Q20). 팬이 부른다.
// 정원이 차 있으면 DB 가 대기 신청으로 받는다(2026-11-09 개정) — 「다 찼다」 거부는 없다. 대기 여부·순번은 선물함 읽기로 본다.
// 신청 본문에는 초대 토큰과 신청 폼에서 봉인한 주소(address)·할증 구분(region)만 싣는다(INV-GB6 — 팬 등록 주소는 없다, 2026-11-08).
// 봉인이 없거나 꼴이 틀리면 DB 를 부르기 전에 거부한다 — 평문 주소가 들어올 자리가 없다(address-protection INV-P1).
// 팔로우·인원·마감·이미 신청·비공개 토큰은 모두 DB 신청 함수가 로그인 토큰으로 판정한다(선물함 줄·팔로우 줄 잠금 뒤).

type Deps = { client: Pick<SupabaseClient, "rpc">; viewer: Viewer | null };
export type ApplyRefusal = { ok: false; status: 400 | 401 | 403 | 404 | 409; message: string };

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
  P0025: { ok: false, status: 403, message: "팔로우한 팬만 신청할 수 있습니다." },
  P0027: { ok: false, status: 409, message: "이미 신청했습니다." },
  "22023": { ok: false, status: 400, message: "주소를 다시 입력해 주세요." },
};

export async function applyBox(deps: Deps, boxId: string, body: unknown): Promise<{ ok: true } | ApplyRefusal> {
  const refused = gate(deps.viewer);
  if (refused) return refused;
  if (!uuid.safeParse(boxId).success) return NOT_FOUND;
  const raw = typeof body === "object" && body !== null ? (body as { address?: unknown; region?: unknown }) : {};
  const address = parseAddressInput({ address: raw.address });
  const region = parseSurchargeRegion(raw.region);
  if (!address.ok || !region) return APPLY_REFUSAL["22023"];
  const token = z.object({ token: z.string().max(200) }).safeParse(body);
  const { error } = await deps.client.rpc("revgift_box_apply", {
    p_box_id: boxId,
    p_token: token.success ? token.data.token : null,
    p_envelope: address.value,
    p_region: region,
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

/**
 * 팬의 [받았어요](delivery-status INV-DS2·DS6) — 선물함 ID 만 보낸다. 신청은 DB 가 로그인 토큰의 팬 것만 찾고, 출고 뒤에만 남긴다.
 * 이미 남겼으면 그대로 성공(처음 시각 하나만 남는다).
 */
export async function confirmBoxReceived(deps: Deps, boxId: string): Promise<{ ok: true } | ApplyRefusal> {
  if (!deps.viewer) return LOGIN;
  if (deps.viewer.role !== "fan") return { ok: false, status: 403, message: "팬 계정만 확인할 수 있습니다." };
  if (!uuid.safeParse(boxId).success) return NOT_FOUND;
  const { error } = await deps.client.rpc("revgift_box_fan_received", { p_box_id: boxId });
  if (error) {
    if (error.code === "P0002") return { ok: false, status: 404, message: "신청 내역을 찾을 수 없습니다." };
    if (error.code === "P0022") return { ok: false, status: 409, message: "아직 발송되지 않은 선물입니다." };
    if (error.code === "42501") return LOGIN;
    throw new Error(`받았어요를 저장하지 못했다: ${error.code}`);
  }
  return { ok: true };
}
