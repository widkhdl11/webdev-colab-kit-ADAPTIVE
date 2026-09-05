import { CardBody, CardDivider, CardLink } from "@/shared/ui/card/Card";
import { ClockIcon, EyeIcon, HeartIcon, PinIcon } from "@/shared/ui/icon/Icon";
import { SeatBar } from "@/shared/ui/seat-bar/SeatBar";
import { StatusBadge } from "@/shared/ui/status-badge/StatusBadge";
import { Tag } from "@/shared/ui/tag/Tag";
import type { Highlight } from "@/shared/ui/highlight";
import { formatSlots, relativeDay } from "@/shared/lib/schedule";
import { placeLabel, type PostSummary } from "@/entities/post";
import styles from "./post-card.module.css";

/**
 * 목록·홈이 함께 쓰는 모집글 카드. 카테고리 색은 받아서 쓴다 —
 * 어느 카테고리가 무슨 색인지는 분류 쪽 지식이라 여기서 정하지 않는다.
 */
export function PostCard({ post, color }: { post: PostSummary; color: Highlight }) {
  const { study } = post;

  return (
    <CardLink href={`/posts/${post.id}`}>
      <CardBody>
        <div className={styles.top}>
          <Tag color={color}>{study.categoryName}</Tag>
          <StatusBadge on={study.recruiting}>{study.recruiting ? "모집중" : "마감"}</StatusBadge>
        </div>

        <h3 className={styles.title}>{post.title}</h3>
        {post.summary ? <p className={styles.desc}>{post.summary}</p> : null}

        <p className={styles.meta}>
          <span>
            <PinIcon />
            {placeLabel(study)}
          </span>
          <span>
            <ClockIcon />
            {formatSlots(study.slots)}
          </span>
        </p>

        <CardDivider />

        <SeatBar filled={study.filled} capacity={study.capacity} open={study.recruiting} />

        <CardDivider />

        <div className={styles.foot}>
          <p className={styles.stats}>
            {/* 아이콘은 장식이라 뜻을 못 낸다 — 숫자가 무엇의 수인지는 글자로 붙인다 */}
            <span className={styles.stat}>
              <HeartIcon />
              <span className="sr-only">좋아요</span>
              {post.likesCount}
            </span>
            <span className={styles.stat}>
              <EyeIcon />
              <span className="sr-only">조회</span>
              {post.viewsCount}
            </span>
          </p>
          <p className={styles.stats}>
            <span>{relativeDay(post.createdAt)}</span>
          </p>
        </div>
      </CardBody>
    </CardLink>
  );
}
