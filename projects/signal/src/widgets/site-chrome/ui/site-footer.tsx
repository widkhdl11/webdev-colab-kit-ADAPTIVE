import styles from "./site-chrome.module.css";

export function SiteFooter() {
  return (
    <footer className={styles.footer}>
      <div className={styles.footerInner}>
        signal — 개인용 소식 리더 · 수집된 원문의 저작권은 각 출처에 있습니다.
      </div>
    </footer>
  );
}
