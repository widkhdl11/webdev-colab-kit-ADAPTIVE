import type { ArticleDayGroup } from "@/entities/article";
import { dayHeading } from "@/shared/lib/datetime";
import { ArticleCard } from "./article-card";
import styles from "./feed.module.css";

interface Props {
  group: ArticleDayGroup;
  /** 오늘 날짜 키. "오늘·어제"를 부르기 위한 기준. */
  todayKey: string;
  nowIso: string;
  isRead: (id: string) => boolean;
}

/** 하루치 묶음. 제목 계층은 h1(페이지) → h2(날짜) → h3(카드). */
export function DaySection({ group, todayKey, nowIso, isRead }: Props) {
  const headingId = `day-${group.dayKey}`;

  return (
    <section className={styles.day} aria-labelledby={headingId}>
      <div className={styles.dayHead}>
        <h2 className={styles.dayTitle} id={headingId}>
          {dayHeading(group.dayKey, todayKey)}
        </h2>
        <span className={styles.dayCount}>{group.articles.length}건</span>
        <span className={styles.dayRule} aria-hidden="true" />
      </div>

      <div className={styles.grid}>
        {group.articles.map((article) => (
          <ArticleCard
            key={article.id}
            article={article}
            isRead={isRead(article.id)}
            nowIso={nowIso}
          />
        ))}
      </div>
    </section>
  );
}
