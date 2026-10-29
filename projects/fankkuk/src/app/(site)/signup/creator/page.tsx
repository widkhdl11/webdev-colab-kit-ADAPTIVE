import { redirect } from "next/navigation";
import { readOwnCreatorId } from "@/entities/creator/api/creator-reads";
import { readApiCheckPlatforms, readMyVerifications, readMyVerificationState } from "@/entities/creator/api/creator-verification-reads";
import { readMyPendingSignatureLink, readMySignatureLink } from "@/entities/creator/api/signature-link-reads";
import { readSealingPublicKeyPem } from "@/shared/lib/envelope/sealing-key-config";
import { SiteFooter } from "@/widgets/site-footer/ui/site-footer";
import { loadSession, readSiteHeader, signedInHome } from "@/widgets/site-header/api/session-header";
import { SiteHeader } from "@/widgets/site-header/ui/site-header";
import { SignupCreatorSteps } from "@/widgets/signup/ui/signup-creator-steps";

export const dynamic = "force-dynamic";

// 크리에이터 가입 4단계(채널 확인)·5단계(승인 서명 연결하기) — signup 스펙 머리말, UX 명세 signup.md 「2026-10-29 단계 화면」.
// 3단계에서 계정이 만들어지고 로그인된 크리에이터만 온다. 로그인 전이면 로그인으로, 팬이면 자기 첫 화면으로 보낸다.
// 4단계는 채널 본인 확인 상태(creator-verification INV-V11)를, 5단계는 본인 크리에이터 ID 와 연결 여부(INV-S16 — 참/거짓과 연결한 때만)를 읽는다.
export default async function Page({ searchParams }: { searchParams: Promise<{ step?: string | string[] }> }) {
  const { supabase, viewer } = await loadSession();
  if (!viewer) redirect("/login?next=/signup/creator");
  if (viewer.role !== "creator") redirect(signedInHome(viewer) ?? "/");
  const step = (await searchParams).step === "5" ? 5 : 4;
  const header = await readSiteHeader(supabase, viewer, "/signup");

  if (step === 4) {
    const [state, rows, apiPlatforms] = await Promise.all([readMyVerificationState(supabase), readMyVerifications(supabase), readApiCheckPlatforms(supabase)]);
    if (!state) throw new Error("크리에이터 줄을 찾지 못했다");
    return (
      <>
        <SiteHeader {...header} />
        <SignupCreatorSteps step={4} verification={{ state, rows, apiPlatforms: [...apiPlatforms] }} />
        <SiteFooter />
      </>
    );
  }

  // 기다리는 중에 화면을 떠났다 돌아오면 그 요청을 이어 묻는다(요청 ID 는 DB 가 본인 것만 돌려준다)
  const [creatorId, link, pending] = await Promise.all([readOwnCreatorId(supabase), readMySignatureLink(supabase), readMyPendingSignatureLink(supabase)]);
  if (!creatorId) throw new Error("크리에이터 줄을 찾지 못했다");
  return (
    <>
      <SiteHeader {...header} />
      <SignupCreatorSteps step={5} creatorId={creatorId} sealingKeyPem={readSealingPublicKeyPem(process.env)} linked={link.linked} pending={pending} />
      <SiteFooter />
    </>
  );
}
