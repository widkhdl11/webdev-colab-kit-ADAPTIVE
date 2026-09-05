import Link from "next/link";
import { Container } from "@/shared/ui/container/Container";
import { BellIcon } from "@/shared/ui/icon/Icon";
import { Button, ButtonLink } from "@/shared/ui/button/Button";
import { signOutAction } from "@/features/auth";
import styles from "./site-header.module.css";

/**
 * 모든 화면의 머리. 알림은 별도 페이지가 없고(IA.md) 종 아이콘에 패널이 달린다 —
 * 패널 자체는 로그인 뒤 화면을 만들 때 붙인다.
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
              <Link
                className={styles.iconBtn}
                href="/profile"
                aria-label={
                  unreadCount > 0 ? `알림, 안 읽음 ${unreadCount}개` : "알림, 안 읽은 알림 없음"
                }
              >
                <BellIcon />
                {unreadCount > 0 ? (
                  <span className={`${styles.dot} num`} aria-hidden="true">
                    {unreadCount > 99 ? "99+" : unreadCount}
                  </span>
                ) : null}
              </Link>
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
