import Link from "next/link";
import styles from "./site-chrome.module.css";

export function SiteHeader() {
  return (
    <header className={styles.top}>
      <div className={styles.topInner}>
        <Link className={styles.logo} href="/">
          signal<span className={styles.logoDot}>.</span>
        </Link>
        <span className={styles.tagline}>
          AI·IT 소식에서 신호만 골라 훑는 곳
        </span>
      </div>
    </header>
  );
}
