import styles from "./avatar.module.css";

/** 이름의 첫 글자. 이모지·결합 문자를 반으로 자르지 않게 코드 포인트로 센다 */
function initial(name: string): string {
  return [...name.trim()][0] ?? "?";
}

/**
 * 사람 자리. 이름이 옆에 늘 같이 나오므로 이 자체는 장식이다 —
 * 읽어 주는 기계에는 두 번 말하지 않는다.
 */
export function Avatar({ name, size = "md" }: { name: string; size?: "md" | "lg" }) {
  const classes = size === "lg" ? `${styles.avatar} ${styles.lg}` : styles.avatar;
  return (
    <span className={classes} aria-hidden="true">
      {initial(name)}
    </span>
  );
}
