import type { SupabaseClient } from "@supabase/supabase-js";
import { notFound, redirect } from "next/navigation";
import { cache } from "react";
import { readAdminAccess } from "@/entities/session/api/read-admin-access";
import { ADMIN_LOGIN_PATH } from "@/entities/session/model/admin-next-path";
import { sessionActivityOf } from "@/entities/session/api/session-activity";
import { readViewer } from "@/entities/session/model/viewer";
import { readSessionClock, type SessionClock } from "@/features/auth/model/session-clock";
import { createAdminSupabase } from "@/shared/api/supabase/admin";
import { createRequestSupabase } from "@/shared/api/supabase/server";

// 관리자 주소에 들어온 사람 판정 (admin-console INV-K1 S1c·K2·K13). 로그인한 팬·크리에이터는 404, 손님은 운영자 로그인 화면으로.
// 레이아웃과 화면은 따로 그려지므로(레이아웃 판정만으로는 화면 데이터가 막히지 않는다) 둘 다 이 함수를 부른다.
// 한 요청 안에서는 cache 로 한 번만 묻는다.

/** userId: 폼 임시 저장의 계정(session-login INV-L20) · clock: 끝나는 시각(INV-L19 — 서버가 정한다, 못 읽으면 null) */
export type AdminSession = { supabase: SupabaseClient; userId: string; nickname: string; access: "staff" | "owner"; clock: SessionClock | null };

export const loadAdminSession = cache(async (): Promise<AdminSession> => {
  const supabase = await createRequestSupabase();
  const viewer = await readViewer(supabase);
  // 손님은 운영자 로그인 화면으로(INV-K13). 가려던 주소는 요청 단계(proxy)가 붙여 보낸다 — 여기는 그 단계를 지나쳐 온 경우의 받침이다
  if (!viewer) redirect(ADMIN_LOGIN_PATH);
  const access = await readAdminAccess(supabase);
  if (access === "not_found") notFound();
  const clock = await readSessionClock(supabase.auth, sessionActivityOf(createAdminSupabase()));
  return { supabase, userId: viewer.userId, nickname: viewer.nickname ?? "", access, clock };
});
