import { redirect } from "next/navigation";
import { readApiCheckPlatforms, readMyVerifications, readMyVerificationState } from "@/entities/creator/api/creator-verification-reads";
import { readTagOptions } from "@/entities/creator/api/creator-tag-reads";
import { readMyCreatorSettings } from "@/entities/creator/api/my-creator-settings";
import { SiteFooter } from "@/widgets/site-footer/ui/site-footer";
import { loadSession, readSiteHeader, signedInHome } from "@/widgets/site-header/api/session-header";
import { SiteHeader } from "@/widgets/site-header/ui/site-header";
import { SignupCreatorSteps, type ChannelInfo } from "@/widgets/signup/ui/signup-creator-steps";

export const dynamic = "force-dynamic";

// 크리에이터 가입 4단계(채널 만들기, 2026-11-11 signup INV-U21) — signup 스펙 머리말, UX 명세 signup.md 「2026-11-10 크리에이터 3단계 카카오톡 인증」(가입은 네 단계, 5단계 없음).
// 3단계에서 계정이 만들어지고 로그인된 크리에이터만 온다. 로그인 전이면 로그인으로, 팬이면 자기 첫 화면으로 보낸다.
// 채널 본인 확인 상태(creator-verification INV-V11)를 읽는다. 옛 주소 ?step=5 는 없어졌다 — 붙어 와도 4단계를 보인다.
// ?step=3 은 3단계 서명 완료 화면(UX 명세 kakao_done) — 「다음」이 4단계(이 주소)로 간다.
export default async function Page({ searchParams }: { searchParams: Promise<{ step?: string | string[] }> }) {
  const { supabase, viewer } = await loadSession();
  if (!viewer) redirect("/login?next=/signup/creator");
  if (viewer.role !== "creator") redirect(signedInHome(viewer) ?? "/");
  const header = await readSiteHeader(supabase, viewer, "/signup");
  // 3단계 서명 완료(kakao_done) — 가입 화면이 계정을 만든 직후 여기로 보낸다. 머리글은 로그인 상태로 그려진다
  if ((await searchParams).step === "3") {
    return (
      <>
        <SiteHeader {...header} />
        <SignupCreatorSteps view="kakao-done" />
        <SiteFooter />
      </>
    );
  }
  const [state, rows, apiPlatforms] = await Promise.all([readMyVerificationState(supabase), readMyVerifications(supabase), readApiCheckPlatforms(supabase)]);
  if (!state) throw new Error("크리에이터 줄을 찾지 못했다");
  // 채널 없음(닉네임 비어 있음)이면 만들기 칸에 쓸 태그 선택지(creator-tags INV-T3), 있으면 요약 줄의 닉네임 · 팬덤 이름
  const channel: ChannelInfo = viewer.nickname
    ? { kind: "made", nickname: viewer.nickname, fanName: (await readMyCreatorSettings(supabase))?.fanName || null }
    : { kind: "none", tagOptions: await readTagOptions(supabase) };
  return (
    <>
      <SiteHeader {...header} />
      <SignupCreatorSteps verification={{ state, rows, apiPlatforms: [...apiPlatforms], loginId: viewer.loginId ?? null }} channel={channel} />
      <SiteFooter />
    </>
  );
}
