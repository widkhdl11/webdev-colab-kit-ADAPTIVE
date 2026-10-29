import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { parseAddressInput } from "@/entities/address/model/address-ciphertext";
import { parseAddressLabel } from "@/entities/address/model/address-label";
import type { Viewer } from "@/entities/session/model/viewer";
import type { ApprovalSigner } from "@/shared/api/approval-signer/signer";

// 크리에이터 주소 등록·변경 (address-protection INV-P1·P13, 카드 d28).
// 누구의 주소인지는 세션에서 확인한 사람으로 정한다(INV-L2·L3) — 본문에서는 봉인된 주소 하나만 꺼낸다.
// 카카오 재서명 자리는 승인과 같은 서명 창구가 맡는다. 창구가 없으면(운영, 카카오 연결 전) 저장하지 않는다.
// 저장 함수가 크리에이터 역할·봉인 형식을 한 번 더 보고, 주소 칸과 등록 기록을 한 처리에서 쓴다.
// 본문의 이름표(INV-P16)는 정해진 목록에서 고른 값만 받는다 — 저장 함수도 같은 목록으로 한 번 더 본다.

const resultSchema = z.enum(["saved", "not_creator", "method_refused"]);

export type SaveCreatorAddressResult = { ok: true } | { ok: false; status: 400 | 401 | 403 | 503; message: string };

const UNAVAILABLE = { ok: false, status: 503, message: "현재 주소를 변경할 수 없습니다. 잠시 후 다시 시도해 주세요." } as const;
const CREATOR_ONLY = { ok: false, status: 403, message: "크리에이터 계정만 이용할 수 있습니다." } as const;
const NOT_SEALED = { ok: false, status: 400, message: "주소를 다시 입력해 주세요." } as const;
const NO_LABEL = { ok: false, status: 400, message: "주소 별칭을 선택해 주세요." } as const;

export async function saveCreatorAddress(
  deps: { admin: Pick<SupabaseClient, "rpc">; viewer: Viewer | null; signer: ApprovalSigner | null },
  body: unknown,
): Promise<SaveCreatorAddressResult> {
  if (!deps.viewer) return { ok: false, status: 401, message: "로그인이 필요합니다." };
  if (deps.viewer.role !== "creator") return CREATOR_ONLY;
  // INV-P13: 창구가 없으면(운영) 로그인만으로 주소를 바꾸지 못한다
  if (!deps.signer) return UNAVAILABLE;

  // INV-P1: 봉인 형식이 아니면 거부 — 평문 주소가 들어올 자리가 없다
  const input = parseAddressInput(body);
  if (!input.ok) return NOT_SEALED;
  const label = parseAddressLabel((body as { label?: unknown }).label);
  if (!label) return NO_LABEL;

  const { data, error } = await deps.admin.rpc("set_creator_address", {
    p_actor_id: deps.viewer.userId,
    p_envelope: input.value,
    p_label: label,
    p_method: deps.signer.kind,
  });
  if (error) {
    if (error.code === "22023") return NOT_SEALED;
    throw new Error(`주소를 저장하지 못했다: ${error.code}`);
  }
  // 꼴이 다르면 던진다 — 모르는 결과를 성공으로 치지 않는다
  const result = resultSchema.parse(data);
  if (result === "saved") return { ok: true };
  if (result === "not_creator") return CREATOR_ONLY;
  return UNAVAILABLE;
}
