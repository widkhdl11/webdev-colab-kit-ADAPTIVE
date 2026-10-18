import type { Metadata } from "next";
import { readAdminBanners } from "@/entities/banner/api/read-banners";
import { bannerImageUrl } from "@/entities/banner/model/banner";
import { readPublicStorageBase } from "@/shared/api/supabase/detached";
import { BannersPanel } from "@/widgets/admin-banners/ui/banners-panel";
import { loadAdminSession } from "@/widgets/admin-shell/api/admin-session";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  await loadAdminSession(); // 운영자가 아니면 제목도 만들지 않고 404
  return { title: "광고 배너 · 팬꾹 운영자" };
}

// 광고 배너 (docs/specs/banners.md INV-Y1·Y2). 읽기는 로그인한 운영자의 세션으로 — 운영자가 아니면 그 전에 404 다.
export default async function Page() {
  const { supabase } = await loadAdminSession();
  const banners = await readAdminBanners(supabase);
  const base = readPublicStorageBase();
  const imageUrls = Object.fromEntries(banners.map((b) => [b.id, bannerImageUrl(base, b.imagePath)]));
  return <BannersPanel banners={banners} imageUrls={imageUrls} />;
}
