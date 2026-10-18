import { redirect } from "next/navigation";
import { readTagOptions } from "@/entities/creator/api/creator-tag-reads";
import { SiteFooter } from "@/widgets/site-footer/ui/site-footer";
import { loadSession, signedInHome } from "@/widgets/site-header/api/session-header";
import { SiteHeader } from "@/widgets/site-header/ui/site-header";
import { SignupPage } from "@/widgets/signup/ui/signup-page";

export const dynamic = "force-dynamic";

// 이미 로그인한 사람은 자기 첫 화면으로 보낸다 — 손님 화면을 보여 주면 로그인이 풀린 것처럼 보인다.
export default async function Page() {
  const { supabase, viewer } = await loadSession();
  const home = signedInHome(viewer);
  if (home) redirect(home);
  // 크리에이터로 가입할 때 고르는 태그 선택지(creator-tags INV-T3) — 로그인 전에도 읽는 공개 목록
  const tagOptions = await readTagOptions(supabase);
  return (
    <>
      <SiteHeader role="guest" current="/signup" />
      <SignupPage tagOptions={tagOptions} />
      <SiteFooter />
    </>
  );
}
