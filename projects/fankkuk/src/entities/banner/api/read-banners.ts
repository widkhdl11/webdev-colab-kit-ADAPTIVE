import type { SupabaseClient } from "@supabase/supabase-js";
import { parseAdminBanners, parsePublicBanners, toBannerViews, type AdminBanner, type BannerView } from "../model/banner";

// 광고 배너 읽기 (docs/specs/banners.md INV-Y2·Y8).

/**
 * 공개 읽기(누구나) — 지금 보이는 배너를 보이는 순서대로. 못 읽었거나 꼴이 다르면 null:
 * 배너 하나 때문에 첫 화면·홈·크리에이터 찾기 전체가 실패하지 않게 칸만 그리지 않는다(홈 받은 선물 수와 같은 방식).
 */
export async function readPublicBannersOrNull(client: Pick<SupabaseClient, "rpc">, storageBase: string): Promise<BannerView[] | null> {
  try {
    const { data, error } = await client.rpc("list_banners");
    if (error) throw new Error(`배너를 읽지 못했다: ${error.code}`);
    const banners = parsePublicBanners(data);
    if (!banners) throw new Error("배너 목록의 형식이 다르다");
    return toBannerViews(banners, storageBase);
  } catch (e) {
    console.error(e instanceof Error ? e.message : "배너를 읽지 못했다");
    return null;
  }
}

/** 운영자 목록 — 로그인한 운영자의 세션 클라이언트로. 운영자가 아니면 DB 가 빈 목록을 준다(그 전에 화면이 404). */
export async function readAdminBanners(client: Pick<SupabaseClient, "rpc">): Promise<AdminBanner[]> {
  const { data, error } = await client.rpc("admin_banners");
  if (error) throw new Error(`배너 목록을 읽지 못했다: ${error.code}`);
  const banners = parseAdminBanners(data);
  if (!banners) throw new Error("배너 목록의 형식이 다르다");
  return banners;
}
