import type { Metadata } from "next";
import { readUnreadNotificationCount } from "@/entities/notification";
import { currentUser } from "@/entities/session";
import { ChangePasswordForm } from "@/features/change-password";
import { FormPage } from "@/shared/ui/form-page";
import { SkipLink } from "@/shared/ui/skip-link/SkipLink";
import { SiteFooter } from "@/widgets/site-footer";
import { SiteHeader } from "@/widgets/site-header";

export const metadata: Metadata = { title: "비밀번호 변경 — Study Mate" };

// 로그인해야 들어올 수 있다 (INV-A1, PROTECTED_PATHS 의 /profile).
export const dynamic = "force-dynamic";

export default async function ChangePasswordPage() {
  const user = await currentUser();
  const unread = user ? await readUnreadNotificationCount() : 0;

  return (
    <>
      <SkipLink />
      <SiteHeader signedIn={user !== null} unreadCount={unread} />

      <main id="main">
        <FormPage
          title="비밀번호 변경"
          sub="지금 비밀번호를 한 번 더 확인합니다. 바꾸면 다른 기기의 로그인은 끊깁니다."
        >
          <ChangePasswordForm />
        </FormPage>
      </main>

      <SiteFooter signedIn={user !== null} />
    </>
  );
}
