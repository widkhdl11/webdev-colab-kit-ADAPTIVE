import type { Notice } from "@/features/verdict-review";
import styles from "./verdict-review.module.css";

/**
 * 「눈여겨볼 것」 (verdict-review INV-VR8). 해당하는 것이 없으면 절을 그리지 않는다 —
 * 「없음」이라고 적힌 절은 자리만 차지한다.
 */
export function ReviewNotices({ notices }: { notices: readonly Notice[] }) {
  if (notices.length === 0) return null;
  return (
    <section className={styles.notices} aria-label="눈여겨볼 것">
      <h2 className={styles.noticesTitle}>눈여겨볼 것</h2>
      <ul>
        {notices.map((n) => (
          <li key={n.text} className={n.tone === "warn" ? styles.noticeWarn : styles.noticeInfo}>
            <span className={styles.noticeTag}>{n.tone === "warn" ? "확인 필요" : "참고"}</span>
            {n.text}
          </li>
        ))}
      </ul>
    </section>
  );
}
