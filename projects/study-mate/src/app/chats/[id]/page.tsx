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
            <Link href={`/studies/${room.studyId}`}>{room.studyTitle}</Link>
          </nav>

          <div className={styles.head}>
            <h1 className={`h-display ${styles.title}`}>{room.studyTitle}</h1>
            <p className={styles.sub}>
              멤버 <span className="num">{room.memberCount}</span>명 ·{" "}
              <Link href={`/studies/${room.studyId}`}>스터디 보기</Link>
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
  return { title: room ? `${room.studyTitle} 채팅 — Study Mate` : "채팅방 — Study Mate" };
}
