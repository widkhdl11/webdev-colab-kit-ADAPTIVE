import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import type { MetricRow } from "../model/metrics-view";

// 운영자 집계 읽기 (metrics INV-Q1·Q2). 운영자가 아니면 DB 가 거부한다(42501) — 화면은 그 전에 운영자 틀에서 404 다.
// 돌아오는 칸은 지표·기간·묶음·분자·분모·비율뿐이다. 다른 칸이 끼어 와도 여기서 버린다(strip).

const row = z.object({
  metric: z.string(),
  period: z.string(),
  bucket: z.string(),
  numerator: z.number().int().nonnegative(),
  denominator: z.number().int().nonnegative(),
  rate: z.number().nullable(),
});

export async function readMetrics(client: Pick<SupabaseClient, "rpc">): Promise<MetricRow[]> {
  const { data, error } = await client.rpc("admin_metrics");
  if (error) throw new Error(`측정 집계를 읽지 못했다: ${error.code}`);
  return z.array(row).parse(data);
}
