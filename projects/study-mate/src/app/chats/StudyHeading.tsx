import type { ChatStudy } from "@/entities/chat";
import { DELETED_STUDY } from "./copy";
import styles from "./study-heading.module.css";

/**
 * 채팅방 화면의 제목(h1).
 *
 * 이름표(`StudyChip`)와 같은 규칙이고 벗는 모양만 다르다 — 여기는 **글꼴**이다.
 * 주아체는 「보는 텍스트」인 페이지 제목에만 쓰는 글꼴이라(시각 기준 「글자」), 스터디
 * 이름이 없는 방에는 그 글꼴을 안 쓴다. 굵기·색으로만 가르면 `h-display` 가 이미 굵기
 * 400 이라 남는 차이가 색 하나뿐이다.
 *
 * **이 화면은 제목 아래 줄이 이미 두 경우를 갈라 주고 있었다**(살아 있으면 「멤버 N명 ·
 * 스터디 보기」, 안 보이면 「스터디는 지워졌지만 …」). 그래도 제목에 규칙을 거는 이유는
 * 한 규칙을 화면마다 다르게 적용하지 않기 위해서다.
 */
export function StudyHeading({ study }: { study: ChatStudy }) {
  if (!study.available) {
    return <h1 className={`${styles.title} ${styles.gone}`}>{DELETED_STUDY}</h1>;
  }
  return <h1 className={`h-display ${styles.title}`}>{study.title}</h1>;
}
