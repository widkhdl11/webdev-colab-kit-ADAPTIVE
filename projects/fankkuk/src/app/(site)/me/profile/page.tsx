import { redirect } from "next/navigation";
import { readFanProfile } from "@/entities/fan/api/read-fan-profile";
import { CREATOR_MY_HOME } from "@/entities/session/model/my-menu";
import { readPublicStorageBase } from "@/shared/api/supabase/detached";
import { FanProfileEditPage } from "@/widgets/fan-profile-edit/ui/fan-profile-edit-page";
import { MyShell } from "@/widgets/my-nav/ui/my-shell";
import { SiteFooter } from "@/widgets/site-footer/ui/site-footer";
import { loadSession, readSiteHeader } from "@/widgets/site-header/api/session-header";
import { SiteHeader } from "@/widgets/site-header/ui/site-header";

export const dynamic = "force-dynamic";

// 팬 프로필 수정(my-account INV-A12~A14, design-rules 27절). 계정 설정(팬)과 같은 880 묶음 틀(카드 d115). 팬만 — 크리에이터는 크리에이터 화면으로, 로그인 안 했으면 로그인으로.
// 프로필 네 칸은 공개 읽기(fan_profile)로 읽는다. 소개·닉네임은 /api/me/profile 한 경로로 저장한다.
export default async function Page() {
  const { supabase, viewer } = await loadSession();
  if (viewer?.role === "creator") redirect(CREATOR_MY_HOME);
  if (viewer?.role !== "fan") redirect("/login?next=/me/profile");
  const [profile, header] = await Promise.all([readFanProfile(supabase, viewer.userId), readSiteHeader(supabase, viewer, "/me/profile")]);
  if (!profile) throw new Error("팬 프로필을 읽지 못했다");
  return (
    <>
      <SiteHeader {...header} />
      <MyShell width="list">
        <FanProfileEditPage
          nickname={profile.nickname}
          intro={profile.intro}
          photoPath={profile.photoPath}
          bgPath={profile.bgPath}
          photoBase={readPublicStorageBase()}
        />
      </MyShell>
      <SiteFooter />
    </>
  );
}
