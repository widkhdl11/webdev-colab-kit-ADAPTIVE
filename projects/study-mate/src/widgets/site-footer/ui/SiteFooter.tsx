import Link from "next/link";
import { Container } from "@/shared/ui/container/Container";
import styles from "./site-footer.module.css";

export function SiteFooter() {
  return (
    <footer className={styles.footer}>
      <Container>
        <div className={styles.inner}>
          <div>
            <p className={styles.logo}>Study Mate</p>
            <p className={styles.tagline}>함께 성장하는 스터디 문화</p>
          </div>
          <nav className={styles.nav} aria-label="푸터 메뉴">
            <Link href="/about">서비스 소개</Link>
            <Link href="/posts">모집글 찾기</Link>
            <Link href="/studies/create">스터디 개설</Link>
            <Link href="/login">로그인</Link>
          </nav>
        </div>
        {/* 제품 원칙 5「정직한 데모」— 없는 실적을 꾸며내지 않는다 */}
        <p className={styles.note}>
          개인 포트폴리오로 만든 데모입니다. 화면에 보이는 스터디·사용자·수치는 모두 예시
          데이터입니다.
        </p>
      </Container>
    </footer>
  );
}
