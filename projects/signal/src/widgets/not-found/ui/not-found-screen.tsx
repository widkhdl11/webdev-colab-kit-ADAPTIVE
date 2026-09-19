import Link from "next/link";
import styles from "./not-found-screen.module.css";

// 상세 페이지가 notFound() 를 부르는데 이 화면이 없으면 Next 기본 404(순백 배경·시스템 폰트)로
// 떨어진다. design-rules 42행 "순백 배경은 쓰지 않는다" 밖으로 새는 구멍이었다.

export function NotFoundScreen() {
  return (
    <main className={styles.wrap}>
      <h1 className={styles.message}>찾는 소식이 없습니다.</h1>
      <Link className={styles.back} href="/">
        <span aria-hidden="true">←</span> 피드로 돌아가기
      </Link>
    </main>
  );
}
