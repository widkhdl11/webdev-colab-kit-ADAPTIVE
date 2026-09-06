import type { Metadata } from "next";
import { readTopCategories } from "@/entities/category";
import { readUnreadNotificationCount } from "@/entities/notification";
import { readProfile } from "@/entities/profile";
import { readRegions } from "@/entities/region";
import { currentUser } from "@/entities/session";
import { EditProfileForm } from "@/features/edit-profile";
import { FormPage } from "@/shared/ui/form-page";
import { SkipLink } from "@/shared/ui/skip-link/SkipLink";
import { SiteFooter } from "@/widgets/site-footer";
import { SiteHeader } from "@/widgets/site-header";

export const metadata: Metadata = { title: "프로필 수정 — Study Mate" };

// 로그인해야 들어올 수 있다 (INV-A1, PROTECTED_PATHS 의 /profile).
export const dynamic = "force-dynamic";

export default async function EditProfilePage() {
  const user = await currentUser();

  const [profile, regions, categories, unread] = user
    ? await Promise.all([
        readProfile(user.id),
        readRegions(),
        readTopCategories(),
        readUnreadNotificationCount(),
      ])
    : [null, [], [], 0];

  return (
    <>
      <SkipLink />
      <SiteHeader signedIn={user !== null} unreadCount={unread} />

      <main id="main">
        <FormPage
          title="프로필 수정"
          sub="여기서 고친 것은 모집글과 스터디 화면에도 그대로 나옵니다."
        >
          {profile === null ? (
            // INV-A7 은 계정에 프로필이 반드시 있다고 정했다. 없으면 계약이 깨진 것이고,
            // 빈 폼을 그려 덮으면 저장할 행이 없는 채로 사용자가 다 적게 된다.
            <p className="form-missing">
              프로필을 찾지 못했습니다. 다시 로그인해 보고, 그래도 같으면 알려 주세요.
            </p>
          ) : (
            <EditProfileForm profile={profile} regions={regions} categories={categories} />
          )}
        </FormPage>
      </main>

      <SiteFooter signedIn={user !== null} />
    </>
  );
}
