import styles from "./skip-link.module.css";

export function SkipLink({ href = "#main", label = "본문으로 건너뛰기" }: { href?: string; label?: string }) {
  return (
    <a className={styles.skip} href={href}>
      {label}
    </a>
  );
}
