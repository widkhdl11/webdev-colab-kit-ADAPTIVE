import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import type { Viewer } from "@/entities/session/model/viewer";

// 반송 주소 확인 (office-workflow INV-W15, address-protection INV-P18, action-center INV-J4). 요청한 사람의 세션 클라이언트로 DB 함수
// confirm_return_address 를 부른다 — DB 가 로그인 토큰으로 그 상자 주문을 보낸 사람인지, 반송 대기·확인 전 출력·기한 전인지 잠근 뒤 다시 보고,
// 그 사람의 등록 주소 암호문을 상자에 복사한다. 이 경로는 주소를 받지도 돌려주지도 않는다 — 「바꾸기」는 설정의 주소 등록(INV-P13·P17)을 먼저 부른다.
// 본문에서는 주문번호와 상자 순번(팬 선물만 — 역조공 몫은 주문번호 하나)만 꺼낸다.
// 화면 문구는 용어집(return_address 행)으로 다음 묶음에서 넣는다 — 거부 사유는 코드값(reason)으로만 돌려준다.

const inputSchema = z
  .object({
    orderNo: z.string().regex(/^[A-Z0-9][A-Z0-9-]{0,39}$/),
    boxSeq: z.number().int().min(1).max(99).optional(),
  })
  .strict();

export type ReturnAddressWrite = z.input<typeof inputSchema>;

const replySchema = z.enum(["confirmed", "not_found", "no_address", "expired", "closed"]);
type Refusal = Exclude<z.infer<typeof replySchema>, "confirmed">;

export type ConfirmReturnResult =
  | { ok: true }
  | { ok: false; status: 401 | 403 | 400; message: string }
  | { ok: false; status: 404 | 409; reason: Refusal | "retry" };

const REFUSED: Record<Refusal, 404 | 409> = { not_found: 404, no_address: 409, expired: 409, closed: 409 };

export async function confirmReturnAddress(deps: { client: Pick<SupabaseClient, "rpc">; viewer: Viewer | null }, body: unknown): Promise<ConfirmReturnResult> {
  if (!deps.viewer) return { ok: false, status: 401, message: "로그인이 필요해요." };
  // 보내는 사람은 팬 또는 크리에이터(보낸 역조공·보낸 팬 선물). 운영자는 남의 반송 주소를 정하지 않는다
  if (deps.viewer.role === "operator") return { ok: false, status: 403, message: "operator" };
  const parsed = inputSchema.safeParse(body);
  if (!parsed.success) return { ok: false, status: 400, message: "잘못된 요청이에요." };
  const { orderNo, boxSeq } = parsed.data;
  const { data, error } = await deps.client.rpc("confirm_return_address", { p_order_no: orderNo, p_box_seq: boxSeq ?? null });
  // 잠그는 사이 상자 연결이 바뀌었다(office_lock_parcel 의 40001) — 다시 하면 된다. 복사되지 않았다
  if (error?.code === "40001") return { ok: false, status: 409, reason: "retry" };
  if (error) throw new Error(`반송 주소를 확인하지 못했다: ${error.code}`);
  // 꼴이 다르면 던진다 — 모르는 결과를 성공으로 치지 않는다
  const reply = replySchema.parse(data);
  if (reply === "confirmed") return { ok: true };
  return { ok: false, status: REFUSED[reply], reason: reply };
}
