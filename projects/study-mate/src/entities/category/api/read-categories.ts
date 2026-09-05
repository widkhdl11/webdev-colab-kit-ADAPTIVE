import { createServerSupabase } from "@/shared/api/supabase/server-client";
import { toCategory, type Category } from "../model/category";

/**
 * 대분류 8종을 정렬 순서대로. 화면의 형광펜 칩과 필터가 이 목록을 그린다.
 * 실패는 삼키지 않는다 — 분류가 안 보이는 것은 빈 결과가 아니라 고장이다.
 */
export async function readTopCategories(): Promise<readonly Category[]> {
  const supabase = await createServerSupabase();
  const { data, error } = await supabase
    .from("categories")
    .select("id, name, parent_id, sort_order")
    .is("parent_id", null)
    .order("sort_order", { ascending: true });

  if (error) throw new Error(`대분류를 읽지 못했다: ${error.message}`);
  return (data ?? []).map(toCategory);
}
