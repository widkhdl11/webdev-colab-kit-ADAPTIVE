import styles from "./status-badge.module.css";

/**
 * 켜짐/꺼짐 두 상태를 색과 모양으로 같이 보여준다. 색만으로 구분하지 않는다 —
 * 점 + 글자가 항상 함께 나온다.
 */
export function StatusBadge({
  on,
  children,
  size = "md",
}: {
  on: boolean;
  children: React.ReactNode;
  size?: "md" | "lg";
}) {
  const classes = [styles.badge, on ? styles.open : styles.closed];
  if (size === "lg") classes.push(styles.lg);
  return (
    <span className={classes.join(" ")}>
      <i className={styles.dot} aria-hidden="true" />
      {children}
    </span>
  );
}
