import { createServerSupabase } from "@/shared/api/supabase/server-client";

/**
 * 안 읽은 알림 수. 헤더의 종 아이콘에 붙는 값이다.
 *
 * 알림은 자기 것만 보이므로(접근 정책) 로그인하지 않았으면 0 이 나온다.
 * 헤더 하나 때문에 화면 전체가 죽지 않게 여기서는 실패를 0 으로 접는다 —
 * 안 읽은 알림이 없는 것과 못 읽은 것의 차이가 화면에서 같아도 잃는 것이 없다.
 */
export async function readUnreadNotificationCount(
  createSupabase: typeof createServerSupabase = createServerSupabase,
): Promise<number> {
  try {
    const supabase = await createSupabase();
    const { count, error } = await supabase
      .from("notifications")
      .select("id", { count: "exact", head: true })
      .is("read_at", null);
    if (error) return 0;
    return count ?? 0;
  } catch {
    return 0;
  }
}
