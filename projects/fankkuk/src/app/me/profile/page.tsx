import { redirect } from "next/navigation";
import { readFanProfile } from "@/entities/fan/api/read-fan-profile";
import { readMyAccount } from "@/entities/fan/api/read-my-account";
import { CREATOR_MY_HOME } from "@/entities/session/model/my-menu";
import { readPublicStorageBase } from "@/shared/api/supabase/detached";
import { FanProfileEditPage } from "@/widgets/fan-profile-edit/ui/fan-profile-edit-page";
import { MyShell } from "@/widgets/my-nav/ui/my-shell";
import { SiteFooter } from "@/widgets/site-footer/ui/site-footer";
import { loadSession, readSiteHeader } from "@/widgets/site-header/api/session-header";
import { SiteHeader } from "@/widgets/site-header/ui/site-header";

export const dynamic = "force-dynamic";

// 팬 프로필 수정(my-account INV-A12~A14, design-rules 12절). 입력형 720(00절 「본문 틀」). 팬만 — 크리에이터는 크리에이터 화면으로, 로그인 안 했으면 로그인으로.
// 프로필 네 칸은 공개 읽기(fan_profile)로 읽는다. 닉네임 저장은 내 정보 저장 경로를 쓰므로 그 경로가 받는 이메일·알림 지금 값을 같이 넘긴다.
export default async function Page() {
  const { supabase, viewer } = await loadSession();
  if (viewer?.role === "creator") redirect(CREATOR_MY_HOME);
  if (viewer?.role !== "fan") redirect("/login?next=/me/profile");
  const [profile, account] = await Promise.all([readFanProfile(supabase, viewer.userId), readMyAccount(supabase)]);
  if (!profile || !account) throw new Error("팬 프로필을 읽지 못했다");
  const header = await readSiteHeader(supabase, viewer, "/me/profile");
  return (
    <>
      <SiteHeader {...header} />
      <MyShell width="form">
        <FanProfileEditPage
          nickname={profile.nickname}
          intro={profile.intro}
          photoPath={profile.photoPath}
          bgPath={profile.bgPath}
          photoBase={readPublicStorageBase()}
          account={{ email: account.email ?? account.pendingEmail, notifyKakao: account.notifyKakao, notifyEmail: account.notifyEmail }}
        />
      </MyShell>
      <SiteFooter />
    </>
  );
}
