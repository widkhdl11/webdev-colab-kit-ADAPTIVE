import type { Metadata } from "next";
import { readTopCategories } from "@/entities/category";
import { readUnreadNotificationCount } from "@/entities/notification";
import { readRegions } from "@/entities/region";
import { currentUser } from "@/entities/session";
import { CreateStudyForm } from "@/features/create-study";
import { Container } from "@/shared/ui/container/Container";
import { SkipLink } from "@/shared/ui/skip-link/SkipLink";
import { SiteFooter } from "@/widgets/site-footer";
import { SiteHeader } from "@/widgets/site-header";
import styles from "./page.module.css";

export const metadata: Metadata = { title: "스터디 개설 — Study Mate" };

// 로그인해야 들어올 수 있다 — 요청 프록시가 막는다 (INV-A1, PROTECTED_PATHS 의 /studies).
export const dynamic = "force-dynamic";

export default async function CreateStudyPage() {
  const user = await currentUser();
  const [categories, regions, unread] = await Promise.all([
    readTopCategories(),
    readRegions(),
    user ? readUnreadNotificationCount() : Promise.resolve(0),
  ]);

  return (
    <>
      <SkipLink />
      <SiteHeader signedIn={user !== null} unreadCount={unread} current="create" />

      <main id="main">
        <Container>
          <div className={styles.page}>
            <h1 className={`h-display ${styles.title}`}>스터디 개설</h1>
            <p className={styles.sub}>
              만들면 바로 채팅방이 생기고, 모집글을 붙이면 목록에 나옵니다.
            </p>
            <CreateStudyForm categories={categories} regions={regions} />
          </div>
        </Container>
      </main>

      <SiteFooter signedIn={user !== null} />
    </>
  );
}
