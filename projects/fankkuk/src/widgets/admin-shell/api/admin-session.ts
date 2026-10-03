import type { SupabaseClient } from "@supabase/supabase-js";
import { notFound } from "next/navigation";
import { cache } from "react";
import { readAdminAccess } from "@/entities/session/api/read-admin-access";
import { readViewer } from "@/entities/session/model/viewer";
import { createRequestSupabase } from "@/shared/api/supabase/server";

// 관리자 주소에 들어온 사람 판정 (admin-console INV-K1 S1c·K2). 운영자가 아니면(손님 포함) 404 — 관리자 화면이 있는지도 알리지 않는다.
// 레이아웃과 화면은 따로 그려지므로(레이아웃 판정만으로는 화면 데이터가 막히지 않는다) 둘 다 이 함수를 부른다.
// 한 요청 안에서는 cache 로 한 번만 묻는다.

export type AdminSession = { supabase: SupabaseClient; nickname: string; access: "staff" | "owner" };

export const loadAdminSession = cache(async (): Promise<AdminSession> => {
  const supabase = await createRequestSupabase();
  const viewer = await readViewer(supabase);
  if (!viewer) notFound();
  const access = await readAdminAccess(supabase);
  if (access === "not_found") notFound();
  return { supabase, nickname: viewer.nickname ?? "", access };
});
