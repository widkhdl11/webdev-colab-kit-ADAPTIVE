import type { CSSProperties } from "react";
import styles from "./avatar.module.css";

/** 이름의 첫 글자. 이모지·결합 문자를 반으로 자르지 않게 코드 포인트로 센다 */
function initial(name: string): string {
  return [...name.trim()][0] ?? "?";
}

/** 크기별 실제 픽셀. 이미지의 내재 치수와 CSS 가 **같은 값 하나**를 본다 */
const PX = { md: 44, lg: 72 } as const;

/**
 * 사람 자리. 이름이 옆에 늘 같이 나오므로 이 자체는 장식이다 —
 * 읽어 주는 기계에는 두 번 말하지 않는다.
 *
 * **사진은 이니셜 위에 겹친다.** 사진이 있을 때 이니셜을 안 그리면, 그 사진이 로드에
 * 실패했을 때 남는 것이 괘선으로 찬 빈 원이다 — 승인된 시각 기준이 정한 아바타
 * (괘선 채움 + 2px 잉크 테두리 + **이니셜**)가 그 순간 사라진다. 서버 컴포넌트라
 * `onError` 를 달 수 없으므로, 겹쳐 두는 것이 실패를 덮는 유일한 방법이다.
 */
export function Avatar({
  name,
  src,
  size = "md",
}: {
  name: string;
  src?: string | null;
  size?: "md" | "lg";
}) {
  const px = PX[size];
  const style = { "--avatar-size": `${px}px` } as CSSProperties;

  return (
    <span className={styles.avatar} style={style} aria-hidden="true">
      {initial(name)}
      {src ? (
        // eslint-disable-next-line @next/next/no-img-element -- 주소가 런타임에 정해지는
        // 외부 저장소 파일이라 빌드 시점 최적화 대상이 아니다. 내재 치수를 박아 두어
        // 로드 전후로 줄이 흔들리지 않게 한다.
        <img className={styles.photo} src={src} alt="" width={px} height={px} />
      ) : null}
    </span>
  );
}
