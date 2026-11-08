import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { SURCHARGE_REGIONS, type SurchargeRegion } from "../model/surcharge-region";

// 할증 지역 불일치 (address-protection INV-P20 ③). 송장 출력 때 연 주소로 다시 정한 구분이 저장된 구분과 다른 상자 —
// 운영자만 부를 수 있는 DB 함수(admin_surcharge_mismatches)로 읽는다. 주소·우편번호 칸은 없다 — 상자와 두 구분 값과 시각만.

export type SurchargeMismatch = {
  at: string;
  /** 주문번호, 상자가 여럿이면 「주문번호-순번」 */
  box: string;
  stored: SurchargeRegion;
  opened: SurchargeRegion;
};

const rowSchema = z
  .object({
    at: z.iso.datetime({ offset: true }),
    order_no: z.string().min(1),
    box_seq: z.number().int().min(1),
    box_count: z.number().int().min(1),
    stored_region: z.enum(SURCHARGE_REGIONS),
    opened_region: z.enum(SURCHARGE_REGIONS),
  })
  .refine((r) => r.stored_region !== r.opened_region);

export function parseSurchargeMismatchRows(rows: unknown): SurchargeMismatch[] {
  return z
    .array(rowSchema)
    .parse(rows)
    .map((r) => ({
      at: new Date(r.at).toISOString(),
      box: r.box_count > 1 ? `${r.order_no}-${r.box_seq}` : r.order_no,
      stored: r.stored_region,
      opened: r.opened_region,
    }));
}

/** 최근 불일치 줄. 읽지 못하면 오류 코드만 담아 던진다. */
export async function readSurchargeMismatches(client: Pick<SupabaseClient, "rpc">): Promise<SurchargeMismatch[]> {
  const { data, error } = await client.rpc("admin_surcharge_mismatches");
  if (error) throw new Error(`할증 지역 불일치를 읽지 못했다: ${error.code}`);
  return parseSurchargeMismatchRows(data);
}
