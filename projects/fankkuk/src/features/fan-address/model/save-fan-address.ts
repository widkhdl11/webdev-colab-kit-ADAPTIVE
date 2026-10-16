import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { parseAddressInput } from "@/entities/address/model/address-ciphertext";
import { parseAddressLabel } from "@/entities/address/model/address-label";
import type { Viewer } from "@/entities/session/model/viewer";

// 팬 받을 주소 등록·변경·지우기 (address-protection INV-P1·P16·P17, 카드 d100).
// DB 함수는 로그인 토큰(auth.uid())으로 본인 칸을 정한다 — 그래서 로그인 토큰을 실은 요청용 클라이언트로 부르고, 계정 인자는 넘기지 않는다.
// 본문에서는 봉인된 주소 하나와 고른 이름표만 꺼낸다. 카카오 재서명은 받지 않는다(INV-P17 — 팬 주소로 가는 것은 그 팬 본인 몫뿐).
// 저장 함수가 팬 역할·봉인 형식·이름표를 한 번 더 보고, 주소 칸과 기록 한 줄을 한 처리에서 쓴다.

export type FanAddressResult = { ok: true } | { ok: false; status: 400 | 401 | 403; message: string };

type Deps = { client: Pick<SupabaseClient, "rpc">; viewer: Viewer | null };

const LOGIN = { ok: false, status: 401, message: "로그인이 필요해요." } as const;
const FAN_ONLY = { ok: false, status: 403, message: "팬 계정만 할 수 있어요." } as const;
const NOT_SEALED = { ok: false, status: 400, message: "주소를 다시 입력해 주세요." } as const;
const NO_LABEL = { ok: false, status: 400, message: "주소 이름표를 골라 주세요." } as const;

const saveResult = z.enum(["saved", "not_fan"]);
const deleteResult = z.enum(["deleted", "none", "not_fan"]);

function viewerGate(viewer: Viewer | null): FanAddressResult | null {
  if (!viewer) return LOGIN;
  if (viewer.role !== "fan") return FAN_ONLY;
  return null;
}

export async function saveFanAddress(deps: Deps, body: unknown): Promise<FanAddressResult> {
  const refused = viewerGate(deps.viewer);
  if (refused) return refused;
  // INV-P1: 봉인 형식이 아니면 거부 — 평문 주소가 들어올 자리가 없다
  const input = parseAddressInput(body);
  if (!input.ok) return NOT_SEALED;
  // INV-P16: 이름표는 정해진 목록에서 고른 값만
  const label = parseAddressLabel((body as { label?: unknown }).label);
  if (!label) return NO_LABEL;

  const { data, error } = await deps.client.rpc("set_my_fan_address", { p_envelope: input.value, p_label: label });
  if (error) {
    if (error.code === "22023") return NOT_SEALED;
    throw new Error(`받을 주소를 저장하지 못했다: ${error.code}`);
  }
  // 꼴이 다르면 던진다 — 모르는 결과를 성공으로 치지 않는다
  return saveResult.parse(data) === "saved" ? { ok: true } : FAN_ONLY;
}

/** 지우면 설정의 칸만 빈다 — 이미 받기를 한 몫의 복사본은 그 몫이 끝날 때까지 남는다(INV-P17). 이미 비어 있어도 성공이다. */
export async function deleteFanAddress(deps: Deps): Promise<FanAddressResult> {
  const refused = viewerGate(deps.viewer);
  if (refused) return refused;
  const { data, error } = await deps.client.rpc("delete_my_fan_address");
  if (error) throw new Error(`받을 주소를 지우지 못했다: ${error.code}`);
  return deleteResult.parse(data) === "not_fan" ? FAN_ONLY : { ok: true };
}
