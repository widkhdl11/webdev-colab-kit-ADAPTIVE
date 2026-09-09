import type { Metadata } from "next";
import Link from "next/link";
import { readMyChats } from "@/entities/chat";
import { readUnreadNotificationCount } from "@/entities/notification";
import { currentUser } from "@/entities/session";
import { Container } from "@/shared/ui/container/Container";
import { CardBody, CardLink } from "@/shared/ui/card/Card";
import { CardGrid } from "@/shared/ui/section/Section";
import { SkipLink } from "@/shared/ui/skip-link/SkipLink";
import { relativeDay } from "@/shared/lib/schedule";
import { SiteFooter } from "@/widgets/site-footer";
import { SiteHeader } from "@/widgets/site-header";
import { StudyChip } from "./StudyChip";
import styles from "./page.module.css";

export const metadata: Metadata = { title: "채팅방 — Study Mate" };

// 로그인해야 들어올 수 있다 (INV-A1, PROTECTED_PATHS 의 /chats).
export const dynamic = "force-dynamic";

export default async function ChatsPage() {
  const user = await currentUser();
  // 여기 오려면 세션이 있어야 한다(요청 프록시가 막는다). 그래도 없으면 빈 목록이다 —
  // 남의 방이 보이는 것보다 아무것도 안 보이는 쪽이 안전한 방향이다.
  const [rooms, unread] = user
    ? await Promise.all([readMyChats(user.id), readUnreadNotificationCount()])
    : [[], 0];

  return (
    <>
      <SkipLink />
      <SiteHeader signedIn={user !== null} unreadCount={unread} />

      <main id="main">
        <Container>
          <div className={styles.head}>
            <h1 className={`h-display ${styles.title}`}>채팅방</h1>
            <p className={styles.sub}>참여 중인 스터디의 대화가 여기 모입니다.</p>
          </div>

          {rooms.length === 0 ? (
            <p className={styles.empty}>
              아직 참여 중인 스터디가 없습니다. <Link href="/posts">모집글을 둘러보세요.</Link>
            </p>
          ) : (
            <CardGrid columns={2}>
              {rooms.map((room) => (
                <CardLink key={room.id} href={`/chats/${room.id}`}>
                  <CardBody>
                    <div className={styles.cardTop}>
                      {/* 스터디가 안 보이면 이름도 색도 없다 — 대체 색을 꾸며 내지 않는다.
                          모양까지 갈리는 자리라 컴포넌트가 갖는다(StudyChip) */}
                      <StudyChip study={room.study} />
                      {room.unread > 0 ? (
                        <span className={`${styles.unread} num`}>
                          <span className="sr-only">안 읽음 </span>
                          {room.unread > 99 ? "99+" : room.unread}
                        </span>
                      ) : null}
                    </div>
                    <p className={styles.last}>
                      {room.lastMessage ?? "아직 대화가 없습니다."}
                    </p>
                    {/* 스터디가 안 보이면 인원을 셀 수 없다. 0명이라고 적으면 거짓말이고,
                        「지워진 스터디」는 위 이름표가 이미 말하므로 여기서 되풀이하지 않는다.
                        **둘 다 없으면 줄을 안 그린다** — 빈 `p` 만 남으면 위 여백만 남는다 */}
                    {room.study.available || room.lastMessageAt ? (
                      <p className={styles.meta}>
                        {room.study.available ? (
                          <>
                            멤버 <span className="num">{room.study.memberCount}</span>명
                            {room.lastMessageAt ? " · " : ""}
                          </>
                        ) : null}
                        {room.lastMessageAt ? relativeDay(room.lastMessageAt) : ""}
                      </p>
                    ) : null}
                  </CardBody>
                </CardLink>
              ))}
            </CardGrid>
          )}
        </Container>
      </main>

      <SiteFooter signedIn={user !== null} />
    </>
  );
}
