import Link from "next/link";
import { notFound } from "next/navigation";
import { readChatRoom } from "@/entities/chat";
import { readUnreadNotificationCount } from "@/entities/notification";
import { currentUser } from "@/entities/session";
import { ChatRoomView, markChatRead } from "@/features/chat";
import { Container } from "@/shared/ui/container/Container";
import { SkipLink } from "@/shared/ui/skip-link/SkipLink";
import { SiteFooter } from "@/widgets/site-footer";
import { SiteHeader } from "@/widgets/site-header";
import { DELETED_STUDY } from "../copy";
import styles from "./page.module.css";

// 대화는 요청마다 새로 그린다. 캐시하면 남의 방 내용이 보인다.
export const dynamic = "force-dynamic";

export default async function ChatRoomPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const user = await currentUser();
  const room = await readChatRoom(id);

  // 멤버가 아니면 방 자체가 안 보인다(접근 정책). "없다"와 "못 들어간다"가 화면에서
  // 같아야 한다 — 방이 있다는 사실 자체가 정보다.
  if (!room || !user) notFound();

  const unread = await readUnreadNotificationCount();
  await markChatRead(id);

  return (
    <>
      <SkipLink />
      <SiteHeader signedIn unreadCount={unread} />

      <main id="main">
        <Container>
          <nav className={styles.crumb} aria-label="현재 위치">
            <Link href="/chats">채팅방</Link>
            <span aria-hidden="true">/</span>
            {/* 안 보이는 스터디의 상세는 열리지 않는다 — 404 로 가는 링크를 주지 않는다 */}
            {room.study.available ? (
              <Link href={`/studies/${room.study.id}`}>{room.study.title}</Link>
            ) : (
              <span>{DELETED_STUDY}</span>
            )}
          </nav>

          <div className={styles.head}>
            <h1 className={`h-display ${styles.title}`}>
              {room.study.available ? room.study.title : DELETED_STUDY}
            </h1>
            <p className={styles.sub}>
              {room.study.available ? (
                <>
                  멤버 <span className="num">{room.study.memberCount}</span>명 ·{" "}
                  <Link href={`/studies/${room.study.id}`}>스터디 보기</Link>
                </>
              ) : (
                "스터디는 지워졌지만 대화는 그대로 남습니다."
              )}
            </p>
          </div>

          <ChatRoomView chatId={room.id} myId={user.id} initialMessages={room.messages} />
        </Container>
      </main>

      <SiteFooter signedIn />
    </>
  );
}

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const room = await readChatRoom(id, 1).catch(() => null);
  const name = room && room.study.available ? room.study.title : room ? DELETED_STUDY : null;
  return { title: name ? `${name} 채팅 — Study Mate` : "채팅방 — Study Mate" };
}
