import type { Metadata } from "next";
import Link from "next/link";
import { unstable_rethrow } from "next/navigation";
import { SiteFooter } from "@/widgets/site-footer/ui/site-footer";
import { loadSession, readSiteHeader } from "@/widgets/site-header/api/session-header";
import { SiteHeader, type SiteHeaderProps } from "@/widgets/site-header/ui/site-header";
import { StatusPage } from "@/widgets/status-page/ui/status-page";

export const metadata: Metadata = { title: "페이지를 찾을 수 없습니다 — 팬꾹" };

// 없는 주소 — Next 기본 화면(영어) 대신 팬꾹 틀 안에서 안내한다(용어집 13절, DECISIONS 2026-10-18 재진단)
// 상단 바 읽기(세션·내 선물·처리할 일)가 실패해도 이 화면은 떠야 한다 — 그때는 로그인 전 상단 바로 그린다
async function headerOrGuest(): Promise<SiteHeaderProps> {
  try {
    const { supabase, viewer } = await loadSession();
    return await readSiteHeader(supabase, viewer, "/");
  } catch (err) {
    unstable_rethrow(err); // Next 내부 신호(쿠키 읽기 등)는 삼키지 않는다 — 삼키면 이 화면이 로그인 전 모양으로 굳을 수 있다
    console.error("[not-found] 상단 바 읽기 실패 — 로그인 전 상단 바로 그린다", err);
    return { role: "guest", current: "/" };
  }
}

export default async function NotFound() {
  const header = await headerOrGuest();
  return (
    <>
      <SiteHeader {...header} />
      <StatusPage
        title="페이지를 찾을 수 없습니다"
        description="입력한 주소를 확인해 주세요. 페이지가 이동되거나 삭제되었을 수 있습니다."
        actions={
          <>
            <Link className="btn" href="/">
              홈으로
            </Link>
            <Link className="btn btn--line" href="/support">
              고객센터
            </Link>
          </>
        }
      />
      <SiteFooter />
    </>
  );
}
