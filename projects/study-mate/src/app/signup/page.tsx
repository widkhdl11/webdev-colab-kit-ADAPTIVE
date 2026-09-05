import type { Metadata } from "next";
import { AuthForm, safeNextPath } from "@/features/auth";
import { Container } from "@/shared/ui/container/Container";
import { SkipLink } from "@/shared/ui/skip-link/SkipLink";
import { SiteFooter } from "@/widgets/site-footer";
import { SiteHeader } from "@/widgets/site-header";

export const metadata: Metadata = { title: "회원가입 — Study Mate" };

export const dynamic = "force-dynamic";

export default async function SignupPage({
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
          <AuthForm mode="signup" next={target} />
        </Container>
      </main>
      <SiteFooter />
    </>
  );
}
