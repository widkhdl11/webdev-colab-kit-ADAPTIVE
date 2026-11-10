import { redirect } from "next/navigation";
import { readApiCheckPlatforms, readMyVerifications, readMyVerificationState } from "@/entities/creator/api/creator-verification-reads";
import { SiteFooter } from "@/widgets/site-footer/ui/site-footer";
import { loadSession, readSiteHeader, signedInHome } from "@/widgets/site-header/api/session-header";
import { SiteHeader } from "@/widgets/site-header/ui/site-header";
import { SignupCreatorSteps } from "@/widgets/signup/ui/signup-creator-steps";

export const dynamic = "force-dynamic";

// 크리에이터 가입 4단계(채널 확인) — signup 스펙 머리말, UX 명세 signup.md 「2026-11-10 크리에이터 3단계 카카오톡 인증」(가입은 네 단계, 5단계 없음).
// 3단계에서 계정이 만들어지고 로그인된 크리에이터만 온다. 로그인 전이면 로그인으로, 팬이면 자기 첫 화면으로 보낸다.
// 채널 본인 확인 상태(creator-verification INV-V11)를 읽는다. 옛 주소 ?step=5 는 없어졌다 — 붙어 와도 4단계를 보인다.
export default async function Page() {
  const { supabase, viewer } = await loadSession();
  if (!viewer) redirect("/login?next=/signup/creator");
  if (viewer.role !== "creator") redirect(signedInHome(viewer) ?? "/");
  const header = await readSiteHeader(supabase, viewer, "/signup");
  const [state, rows, apiPlatforms] = await Promise.all([readMyVerificationState(supabase), readMyVerifications(supabase), readApiCheckPlatforms(supabase)]);
  if (!state) throw new Error("크리에이터 줄을 찾지 못했다");
  return (
    <>
      <SiteHeader {...header} />
      <SignupCreatorSteps verification={{ state, rows, apiPlatforms: [...apiPlatforms], loginId: viewer.loginId ?? null }} />
      <SiteFooter />
    </>
  );
}
