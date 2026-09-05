import type { Metadata } from "next";
import { AuthForm, safeNextPath } from "@/features/auth";
import { Container } from "@/shared/ui/container/Container";
import { SkipLink } from "@/shared/ui/skip-link/SkipLink";
import { SiteFooter } from "@/widgets/site-footer";
import { SiteHeader } from "@/widgets/site-header";

export const metadata: Metadata = { title: "로그인 — Study Mate" };

// 이미 로그인한 사람이 오면 요청 프록시가 홈으로 보낸다 (INV-A2).
export const dynamic = "force-dynamic";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string | string[] }>;
}) {
  const { next } = await searchParams;
  const target = safeNextPath(Array.isArray(next) ? next[0] : next);

  return (
    <>
      <SkipLink />
      <SiteHeader />
      <main id="main">
        <Container>
          <AuthForm mode="login" next={target} />
        </Container>
      </main>
      <SiteFooter />
    </>
  );
}
