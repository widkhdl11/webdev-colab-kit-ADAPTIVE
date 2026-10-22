import { redirect } from "next/navigation";
import { readCreatorCards } from "@/entities/creator/api/creator-reads";
import { creatorPhotoUrl } from "@/entities/creator/model/link-images";
import { readPublicStorageBase } from "@/shared/api/supabase/detached";
import { MyFollowingPanel } from "@/widgets/my-following/ui/my-following-page";
import { MyShell } from "@/widgets/my-nav/ui/my-shell";
import { SiteFooter } from "@/widgets/site-footer/ui/site-footer";
import {
  loadSession,
  readSiteHeader,
} from "@/widgets/site-header/api/session-header";
import { SiteHeader } from "@/widgets/site-header/ui/site-header";

export const dynamic = "force-dynamic";

// 로그인한 팬·크리에이터가 팔로우한 크리에이터(DB — my_follows 는 로그인한 사람 기준). 크리에이터도 다른 크리에이터를 팔로우한다(2026-10-22).
// 그 밖(로그인 안 함·운영자)은 로그인으로 보낸다.
export default async function Page() {
  const { supabase, viewer } = await loadSession();
  if (viewer?.role !== "fan" && viewer?.role !== "creator") redirect("/login");
  const header = await readSiteHeader(supabase, viewer, "/me/following");
  const followed = (
    await readCreatorCards(supabase, { signedIn: true })
  ).filter((c) => c.following);
  // 줄 목록은 얼굴(프로필 사진, 없으면 얼굴 색)만 쓴다 — 배경사진·팬덤 꾸밈은 읽지 않는다(2026-10-22 정돈 시범, design-rules 27절)
  const storageBase = readPublicStorageBase();
  const photos = Object.fromEntries(
    followed.map((c) => [c.id, creatorPhotoUrl(storageBase, c.photoPath)]),
  );
  return (
    <>
      <SiteHeader {...header} />
      <MyShell width="list">
        <MyFollowingPanel creators={followed} photos={photos} />
      </MyShell>
      <SiteFooter />
    </>
  );
}
