import styles from "./seat-bar.module.css";

/**
 * 정원 중 몇 자리가 찼는지. 색(민트/코랄)만으로 말하지 않고 숫자와 aria 라벨을 같이 낸다.
 * 채움 비율은 0~100% 로 잘라 낸다 — 정원을 넘긴 값이 들어와도 막대가 넘치지 않는다.
 */
export function SeatBar({
  filled,
  capacity,
  open,
  size = "md",
  label = "참여 인원",
}: {
  filled: number;
  capacity: number;
  open: boolean;
  size?: "md" | "lg";
  label?: string;
}) {
  const ratio = capacity > 0 ? Math.min(Math.max(filled / capacity, 0), 1) : 0;
  const text = `정원 ${capacity}명 중 ${filled}명 참여`;

  return (
    <div className={size === "lg" ? styles.lg : undefined}>
      <div className={styles.head}>
        <span className={styles.label}>{label}</span>
        <span className={styles.count}>
          {filled} / {capacity}
        </span>
      </div>
      <div
        className={styles.bar}
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={capacity}
        aria-valuenow={filled}
        aria-label={text}
      >
        <span
          className={open ? styles.fill : `${styles.fill} ${styles.closed}`}
          style={{ width: `${(ratio * 100).toFixed(1)}%` }}
        />
      </div>
    </div>
  );
}
