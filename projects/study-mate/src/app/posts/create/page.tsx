import type { Metadata } from "next";
import { readUnreadNotificationCount } from "@/entities/notification";
import { currentUser } from "@/entities/session";
import { readPostableStudies } from "@/entities/study";
import { CreatePostForm } from "@/features/create-post";
import { Container } from "@/shared/ui/container/Container";
import { SkipLink } from "@/shared/ui/skip-link/SkipLink";
import { canonicalUuid } from "@/shared/lib/uuid";
import { SiteFooter } from "@/widgets/site-footer";
import { SiteHeader } from "@/widgets/site-header";
import styles from "./page.module.css";

export const metadata: Metadata = { title: "모집글 쓰기 — Study Mate" };

// 로그인해야 들어올 수 있다 — 요청 프록시가 막는다 (INV-A1, PROTECTED_PATHS 의 /posts/create).
export const dynamic = "force-dynamic";

export default async function CreatePostPage({
  searchParams,
}: {
  searchParams: Promise<{ study?: string }>;
}) {
  // 「이 경로는 세션이 있어야 한다」는 판정은 entities/session 의 PROTECTED_PATHS 가 갖고
  // 있고 요청 프록시가 실행한다(INV-A1). 여기서 다시 판정하면 같은 규칙이 두 벌이 되고,
  // 로그인 주소가 이 파일에 리터럴로 한 벌 더 생긴다 — 다른 페이지들과 같게 간다.
  const user = await currentUser();
  const { study } = await searchParams;
  const [studies, unread] = await Promise.all([
    user ? readPostableStudies(user.id) : Promise.resolve([]),
    user ? readUnreadNotificationCount() : Promise.resolve(0),
  ]);

  return (
    <>
      <SkipLink />
      <SiteHeader signedIn={user !== null} unreadCount={unread} />

      <main id="main">
        <Container>
          <div className={styles.page}>
            <h1 className={`h-display ${styles.title}`}>모집글 쓰기</h1>
            <p className={styles.sub}>
              올리면 목록에 바로 나오고, 읽은 사람이 여기서 참가를 신청합니다.
            </p>
            <CreatePostForm
              studies={studies}
              defaultStudyId={canonicalUuid(study) ?? undefined}
            />
          </div>
        </Container>
      </main>

      <SiteFooter signedIn={user !== null} />
    </>
  );
}
