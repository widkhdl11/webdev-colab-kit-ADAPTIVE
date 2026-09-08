import Link from "next/link";
import { Container } from "@/shared/ui/container/Container";
import { Button, ButtonLink } from "@/shared/ui/button/Button";
import { signOutAction } from "@/features/auth";
import { NotificationBell } from "./NotificationBell";
import styles from "./site-header.module.css";

/**
 * 모든 화면의 머리. 알림은 별도 페이지가 없고(IA.md) 종 아이콘에 패널이 달린다.
 *
 * **종 옆 숫자를 여기서 그리지 않는다.** 서버가 센 값을 패널에 넘기고, 패널이 목록을
 * 불러온 뒤로는 그 목록에서 센 값이 숫자가 된다(INV-N8) — 숫자와 화면이 따로 놀 자리를
 * 없애려는 것이다.
 */
export function SiteHeader({
  signedIn = false,
  unreadCount = 0,
  current,
}: {
  signedIn?: boolean;
  unreadCount?: number;
  current?: "posts" | "create";
}) {
  return (
    <header className={styles.header}>
      <Container className={styles.inner}>
        <Link className={styles.logo} href="/">
          Study Mate
        </Link>

        <nav className={styles.nav} aria-label="주요 메뉴">
          <Link href="/posts" aria-current={current === "posts" ? "page" : undefined}>
            모집글 찾기
          </Link>
          <Link href="/studies/create" aria-current={current === "create" ? "page" : undefined}>
            스터디 개설
          </Link>
        </nav>

        <div className={styles.actions}>
          {signedIn ? (
            <>
              <NotificationBell unreadCount={unreadCount} />
              <ButtonLink href="/profile" size="sm">
                내 프로필
              </ButtonLink>
              {/* 로그아웃은 상태를 바꾸므로 링크가 아니라 폼이다 — 미리 가져오기나
                  주소 공유로 남의 세션이 끊기지 않는다 */}
              <form action={signOutAction}>
                <Button size="sm" type="submit">
                  로그아웃
                </Button>
              </form>
            </>
          ) : (
            <ButtonLink href="/login" size="sm">
              로그인
            </ButtonLink>
          )}
        </div>
      </Container>
    </header>
  );
}
