import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { CHOSEN_TIERS } from "@/entities/revgift-box/model/box-tiers";
import type { Viewer } from "@/entities/session/model/viewer";

// 선물함 3부 크리에이터 동작 (revgift-box INV-GB1·GB10·GB11·GB12·GB23) — 2페이지 「다음」 · 3페이지 보낸 상자 수 · 확인 필요 팬 고르기 · 취소한 선물함 상자.
// 누구의 선물함인지·상태가 맞는지는 DB 함수가 로그인 토큰으로 판정한다. 본문에서는 정해진 칸만 꺼낸다 — 금액·상태·6자리를 받지 않는다(INV-GB13 믿지 않는 값).

type Deps = { client: Pick<SupabaseClient, "rpc">; viewer: Viewer | null };
type Refusal = { ok: false; status: 400 | 401 | 403 | 404 | 409; message: string };
type Done = { ok: true };

const LOGIN: Refusal = { ok: false, status: 401, message: "로그인이 필요합니다." };
const CREATOR_ONLY: Refusal = { ok: false, status: 403, message: "크리에이터 계정만 이용할 수 있습니다." };
const NOT_FOUND: Refusal = { ok: false, status: 404, message: "선물함을 찾을 수 없습니다." };
const RETRY: Refusal = { ok: false, status: 400, message: "다시 시도해 주세요." };

const uuid = z.string().uuid();

function gate(viewer: Viewer | null): Refusal | null {
  if (!viewer) return LOGIN;
  if (viewer.role !== "creator") return CREATOR_ONLY;
  return null;
}

/** DB 오류 → 화면 답. 모르는 코드는 던진다 — 성공으로 치지 않는다 */
function refusalOf(code: string, messages: { notNow: string; badInput?: string }, what: string): Refusal {
  if (code === "P0002") return NOT_FOUND;
  if (code === "42501") return CREATOR_ONLY;
  if (code === "P0022") return { ok: false, status: 409, message: messages.notNow };
  if (code === "22023") return { ok: false, status: 400, message: messages.badInput ?? RETRY.message };
  throw new Error(`${what}: ${code}`);
}

const tiersBody = z.object({ tiers: z.record(uuid, z.enum(CHOSEN_TIERS)) });

/** 2페이지 「다음」 — 선택된 신청 모두에 구간을 고르면 상자 보내 주세요로, 같은 처리에서 6자리 발급(INV-GB1·GB10) */
export async function submitTiers(deps: Deps, boxId: string, body: unknown): Promise<Done | Refusal> {
  const refused = gate(deps.viewer);
  if (refused) return refused;
  if (!uuid.safeParse(boxId).success) return NOT_FOUND;
  const input = tiersBody.safeParse(body);
  if (!input.success) return RETRY;
  const { error } = await deps.client.rpc("revgift_box_submit_tiers", { p_box_id: boxId, p_tiers: input.data.tiers });
  if (error) return refusalOf(error.code, { notNow: "모든 팬의 상자 크기를 골라 주세요." }, "상자 크기를 저장하지 못했다");
  return { ok: true };
}

const countBody = z.object({ count: z.number().int().min(1) });

/** 3페이지 보낸 상자 수 — 첫 상자 입고 전까지만(Q8) */
export async function setCartonCount(deps: Deps, boxId: string, body: unknown): Promise<Done | Refusal> {
  const refused = gate(deps.viewer);
  if (refused) return refused;
  if (!uuid.safeParse(boxId).success) return NOT_FOUND;
  const input = countBody.safeParse(body);
  if (!input.success) return { ok: false, status: 400, message: "보낸 상자 수를 1 이상의 숫자로 입력해 주세요." };
  const { error } = await deps.client.rpc("revgift_box_set_carton_count", { p_box_id: boxId, p_count: input.data.count });
  if (error)
    return refusalOf(
      error.code,
      { notNow: "첫 상자가 도착한 뒤에는 상자 수를 바꿀 수 없습니다.", badInput: "보낸 상자 수를 1 이상의 숫자로 입력해 주세요." },
      "보낸 상자 수를 저장하지 못했다",
    );
  return { ok: true };
}

const holdBody = z.object({ applicationId: uuid });

/** 확인 필요 선물의 팬 고르기 — 그 선물함의 담길 신청만(INV-GB12, DB 가 판정) */
export async function resolveHold(deps: Deps, holdId: string, body: unknown): Promise<Done | Refusal> {
  const refused = gate(deps.viewer);
  if (refused) return refused;
  if (!uuid.safeParse(holdId).success) return NOT_FOUND;
  const input = holdBody.safeParse(body);
  if (!input.success) return RETRY;
  const { error } = await deps.client.rpc("revgift_box_resolve_hold", { p_hold_id: holdId, p_application_id: input.data.applicationId });
  if (error)
    return refusalOf(error.code, { notNow: "이미 처리한 선물입니다.", badInput: "이 선물함에 신청한 팬만 고를 수 있습니다." }, "팬을 고르지 못했다");
  return { ok: true };
}

const choiceBody = z.object({ choice: z.enum(["reopen", "return"]) });

/** 취소한 선물함의 상자 — 선물함 다시 열기 · 돌려받기(INV-GB23) */
export async function chooseCancelledArrival(deps: Deps, cardId: string, body: unknown): Promise<Done | Refusal> {
  const refused = gate(deps.viewer);
  if (refused) return refused;
  if (!uuid.safeParse(cardId).success) return NOT_FOUND;
  const input = choiceBody.safeParse(body);
  if (!input.success) return RETRY;
  const { error } = await deps.client.rpc("revgift_box_choose_cancelled_arrival", { p_card_id: cardId, p_choice: input.data.choice });
  if (error) return refusalOf(error.code, { notNow: "이미 처리했거나 다시 열 수 없는 선물함입니다." }, "취소한 선물함 상자를 처리하지 못했다");
  return { ok: true };
}
