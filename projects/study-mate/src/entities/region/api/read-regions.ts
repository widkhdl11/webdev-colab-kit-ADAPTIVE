import { createServerSupabase } from "@/shared/api/supabase/server-client";

/** 필터 축이 되는 지역. 자유 텍스트가 아니라 고정 목록이라야 필터가 빠뜨리지 않는다 */
export type Region = { readonly id: string; readonly name: string };

export async function readRegions(): Promise<readonly Region[]> {
  const supabase = await createServerSupabase();
  const { data, error } = await supabase
    .from("regions")
    .select("id, name")
    .order("sort_order", { ascending: true });

  if (error) throw new Error(`지역 목록을 읽지 못했다: ${error.message}`);
  return (data ?? []) as Region[];
}
