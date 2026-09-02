import Link from "next/link";

import styles from "./not-found.module.css";

/* 빈 상태와 같은 언어를 쓴다 — 문장 한 줄 + 돌아가는 링크.
 * 일러스트·아이콘·재시도 버튼을 두지 않는다. 화면이 사건처럼 보이면 과하다. */
export default function NotFound() {
  return (
    <div className={styles.box}>
      <p className={styles.line}>찾는 소식이 없습니다</p>
      <Link className={styles.back} href="/">
        피드로 돌아가기
      </Link>
    </div>
  );
}
