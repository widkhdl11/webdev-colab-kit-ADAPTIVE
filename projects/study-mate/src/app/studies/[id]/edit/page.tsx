import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { readTopCategories } from "@/entities/category";
import { readUnreadNotificationCount } from "@/entities/notification";
import { readRegions } from "@/entities/region";
import { currentUser } from "@/entities/session";
import { readStudyForEdit } from "@/entities/study";
import { EditStudyForm } from "@/features/edit-study";
import { FormPage } from "@/shared/ui/form-page";
import { SkipLink } from "@/shared/ui/skip-link/SkipLink";
import { canonicalUuid } from "@/shared/lib/uuid";
import { SiteFooter } from "@/widgets/site-footer";
import { SiteHeader } from "@/widgets/site-header";

export const metadata: Metadata = { title: "스터디 수정 — Study Mate" };

// 로그인해야 들어올 수 있다 — 요청 프록시가 막는다 (INV-A1, PROTECTED_PATHS 의 /studies
// 접두사가 이 주소를 덮는다. 모집글 수정과 달리 패턴을 따로 둘 필요가 없다).
export const dynamic = "force-dynamic";

export default async function EditStudyPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await currentUser();
  const { id } = await params;
  const studyId = canonicalUuid(id);

  const [study, categories, regions, unread] = await Promise.all([
    user && studyId ? readStudyForEdit(studyId, user.id) : Promise.resolve(null),
    readTopCategories(),
    readRegions(),
    user ? readUnreadNotificationCount() : Promise.resolve(0),
  ]);

  // **없는 스터디와 남의 스터디를 화면에서 같게 만든다.** 「고칠 권한이 없습니다」를 따로
  // 그리면 그 화면 하나로 "이 id 의 스터디가 있다"를 확인할 수 있게 된다. 판독기가 그
  // 셋(없음 · 남의 것 · 지워진 것)을 이미 같은 null 로 합쳐 두었다.
  if (study === null) notFound();

  return (
    <>
      <SkipLink />
      <SiteHeader signedIn={user !== null} unreadCount={unread} />

      <main id="main">
        <FormPage
          title="스터디 수정"
          sub="고친 내용은 저장하는 즉시 스터디 상세와 모집글에 나옵니다."
        >
          <EditStudyForm study={study} categories={categories} regions={regions} />
        </FormPage>
      </main>

      <SiteFooter signedIn={user !== null} />
    </>
  );
}
