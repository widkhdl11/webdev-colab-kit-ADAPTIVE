import { categoryColor } from "@/entities/category";
import type { ChatStudy } from "@/entities/chat";
import { Tag } from "@/shared/ui/tag/Tag";
import { DELETED_STUDY } from "./copy";
import styles from "./study-chip.module.css";

/**
 * 채팅 화면에서 방이 딸린 스터디를 가리키는 이름표.
 *
 * **이 자리를 컴포넌트로 뽑은 이유**는 두 화면이 쓰기 때문이 아니라, 여기서 갈리는 것이
 * 글자가 아니라 **모양**이기 때문이다. 시각 기준 「이름 칸에 제품이 들어가면 이름의 모양을
 * 벗는다」— 스터디 이름은 형광펜 칩이고, 스터디가 안 보일 때 제품이 대신 쓰는 말은 칩이
 * 아니다. 두 갈래를 한 자리에 두지 않으면 한쪽만 고쳐지는 날 다시 같은 모양이 된다.
 *
 * 전에는 둘 다 `Tag` 였고 안 보이는 쪽 색이 `categoryColor(null)` → 노랑이었다. 그래서
 * 호스트가 스터디 이름을 「지워진 스터디」로 지으면 목록에서 진짜 지워진 방과 글자도 색도
 * 모양도 같았다.
 */
export function StudyChip({ study }: { study: ChatStudy }) {
  if (!study.available) return <span className={styles.gone}>{DELETED_STUDY}</span>;
  return <Tag color={categoryColor(study.categoryId)}>{study.title}</Tag>;
}
