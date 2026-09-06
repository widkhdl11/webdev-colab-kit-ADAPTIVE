import type { Metadata } from "next";
import { readUnreadNotificationCount } from "@/entities/notification";
import { readMyPosts } from "@/entities/post";
import { readProfile } from "@/entities/profile";
import { currentUser } from "@/entities/session";
import { readMyParticipations, readMyStudies } from "@/entities/study";
import { Container } from "@/shared/ui/container/Container";
import { SkipLink } from "@/shared/ui/skip-link/SkipLink";
import { SiteFooter } from "@/widgets/site-footer";
import { SiteHeader } from "@/widgets/site-header";
import { ProfileOverview } from "@/widgets/profile-overview";
import styles from "./page.module.css";

export const metadata: Metadata = { title: "내 프로필 — Study Mate" };

// 로그인해야 들어올 수 있다 (INV-A1, PROTECTED_PATHS 의 /profile).
export const dynamic = "force-dynamic";

export default async function ProfilePage() {
  const user = await currentUser();

  // 여기 오려면 세션이 있어야 한다(요청 프록시가 막는다). 그래도 없으면 아무것도 안 읽는다 —
  // 남의 것이 보이는 것보다 빈 화면이 안전한 방향이다(`/chats` 와 같은 판단).
  const [profile, studies, participations, posts, unread] = user
    ? await Promise.all([
        readProfile(user.id),
        readMyStudies(user.id),
        readMyParticipations(user.id),
        readMyPosts(user.id),
        readUnreadNotificationCount(),
      ])
    : [null, [], [], [], 0];

  return (
    <>
      <SkipLink />
      <SiteHeader signedIn={user !== null} unreadCount={unread} />

      <main id="main">
        <Container>
          {profile === null ? (
            // INV-A7 은 계정에 프로필이 반드시 있다고 정했다. 그래도 없다면 계약이 깨진
            // 것이고, 화면이 빈칸을 그려 덮으면 아무도 눈치채지 못한다.
            // 이 갈래에도 제목을 둔다 — 없으면 이 화면에 h1 이 하나도 없는 상태가 된다.
            <div className={styles.missing}>
              <h1 className={`h-display ${styles.missingTitle}`}>내 프로필</h1>
              <p>프로필을 찾지 못했습니다. 다시 로그인해 보고, 그래도 같으면 알려 주세요.</p>
            </div>
          ) : (
            <ProfileOverview
              profile={profile}
              studies={studies}
              participations={participations}
              posts={posts}
            />
          )}
        </Container>
      </main>

      <SiteFooter signedIn={user !== null} />
    </>
  );
}
