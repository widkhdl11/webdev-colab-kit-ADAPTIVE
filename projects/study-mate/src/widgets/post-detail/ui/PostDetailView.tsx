import Link from "next/link";
import type { ReactNode } from "react";
import { categoryColor } from "@/entities/category";
import {
  MEETING_MODE_LABEL,
  type ApplyState,
  type PostDetail,
} from "@/entities/post";
import { Avatar } from "@/shared/ui/avatar/Avatar";
import { Card, CardDivider } from "@/shared/ui/card/Card";
import { Container } from "@/shared/ui/container/Container";
import { EyeIcon, HeartIcon } from "@/shared/ui/icon/Icon";
import { SeatBar } from "@/shared/ui/seat-bar/SeatBar";
import { StatusBadge } from "@/shared/ui/status-badge/StatusBadge";
import { Tag } from "@/shared/ui/tag/Tag";
import {
  daysUntil,
  formatDate,
  formatMonthDay,
  formatPeriod,
  formatSlotsLong,
} from "@/shared/lib/schedule";
import styles from "./post-detail.module.css";

/** 자리 표기 — 지역 · 상세 위치 · 진행 방식이 각각 다른 칸에 있다 (docs/IA.md) */
function placeLine(study: PostDetail["study"]): string {
  const parts = [study.regionName];
  if (study.locationDetail) parts.push(`(${study.locationDetail})`);
  if (study.meetingMode !== "offline") parts.push(`· ${MEETING_MODE_LABEL[study.meetingMode]}`);
  return parts.join(" ");
}

function deadlineLine(recruitUntil: string | null): string {
  const left = daysUntil(recruitUntil);
  if (left === null) return "기한 없음";
  const date = formatDate(recruitUntil);
  if (left < 0) return `${date} (지났습니다)`;
  if (left === 0) return `${date} (오늘까지)`;
  return `${date} (${left}일 남음)`;
}

export function PostDetailView({
  post,
  state,
  applyAction,
}: {
  post: PostDetail;
  state: ApplyState;
  /** 신청 버튼 자리. 무엇을 보여줄지는 화면이 정하고 여기서는 자리만 낸다 */
  applyAction: ReactNode;
}) {
  const { study } = post;
  const color = categoryColor(study.categoryId);
  const left = Math.max(0, study.capacity - study.filled);

  return (
    <Container>
      <nav className={styles.crumb} aria-label="현재 위치">
        <Link href="/">홈</Link>
        <span aria-hidden="true">/</span>
        <Link href="/posts">모집글 찾기</Link>
        <span aria-hidden="true">/</span>
        <Link href={`/posts?category=${study.categoryId}`}>{study.categoryName}</Link>
      </nav>

      <div className={styles.grid}>
        <article>
          <div className={styles.head}>
            <Tag color={color}>{study.categoryName}</Tag>
            <StatusBadge on={study.recruiting}>{study.recruiting ? "모집중" : "마감"}</StatusBadge>
          </div>

          <h1 className={`h-display ${styles.title}`}>{post.title}</h1>

          {post.author ? (
            <div className={styles.author}>
              <Avatar name={post.author.username} />
              <div>
                <p className={styles.name}>{post.author.username}</p>
                <p className={styles.sub}>
                  {post.author.id === study.hostId ? "호스트" : "작성자"} ·{" "}
                  {formatMonthDay(post.createdAt)}에 올림
                </p>
              </div>
            </div>
          ) : null}

          <dl className={styles.metaList}>
            <div className={styles.metaRow}>
              <dt>지역</dt>
              <dd>{placeLine(study)}</dd>
            </div>
            <div className={styles.metaRow}>
              <dt>기간</dt>
              <dd className="num">{formatPeriod(study.startsOn, study.endsOn)}</dd>
            </div>
            <div className={styles.metaRow}>
              <dt>요일·시간</dt>
              <dd>{formatSlotsLong(study.slots)}</dd>
            </div>
            <div className={styles.metaRow}>
              <dt>모집 마감</dt>
              <dd className="num">{deadlineLine(study.recruitUntil)}</dd>
            </div>
            <div className={styles.metaRow}>
              <dt>정원</dt>
              <dd>
                <span className="num">{study.capacity}</span>명 (호스트 포함, 현재{" "}
                <span className="num">{study.filled}</span>명)
              </dd>
            </div>
          </dl>

          <div className={styles.prose}>
            {post.content.split(/\n{2,}/).map((para, i) => (
              <p key={i}>{para}</p>
            ))}
          </div>

          <div className={styles.foot}>
            {/*
              시안은 여기를 누를 수 있는 버튼으로 그렸는데 좋아요 기능이 아직 없다.
              누를 수 없는 것을 버튼처럼 그리면 눌러 보고 나서야 알게 되므로,
              기능이 붙기 전까지는 조회수와 같은 모양의 숫자로 둔다.
            */}
            <p className={styles.stats}>
              <HeartIcon size={16} />
              좋아요 {post.likesCount}
            </p>
            <p className={styles.stats}>
              <EyeIcon size={16} />
              조회 {post.viewsCount}
            </p>
          </div>
        </article>

        <aside className={styles.side} aria-label="참가 신청">
          <Card className={styles.panel}>
            <StatusBadge on={study.recruiting} size="lg">
              {study.recruiting ? "모집중" : "마감"}
            </StatusBadge>

            <div className={styles.panelSeat}>
              <SeatBar
                filled={study.filled}
                capacity={study.capacity}
                open={study.recruiting}
                size="lg"
              />
            </div>

            <CardDivider />

            {applyAction}

            <p className={styles.note}>
              {state === "signed-out"
                ? "신청하려면 로그인이 필요합니다. 모집글을 읽는 데는 로그인이 필요 없습니다."
                : study.recruiting
                  ? `신청하면 호스트의 승인을 기다립니다. 지금 어떤 상태인지는 알림과 내 프로필에서 언제든 확인할 수 있습니다. 남은 자리 ${left}개.`
                  : "이 스터디는 더 이상 신청을 받지 않습니다."}
            </p>
          </Card>

          {study.host ? (
            <Card className={styles.hostCard}>
              <p className={styles.hostLabel}>호스트</p>
              <div className={styles.hostRow}>
                <Avatar name={study.host.username} />
                <div>
                  <p className={styles.name}>{study.host.username}</p>
                  <p className={styles.sub}>
                    {study.regionName} · {study.categoryName}
                  </p>
                </div>
              </div>
              {study.host.bio ? <p className={styles.hostDesc}>{study.host.bio}</p> : null}
            </Card>
          ) : null}
        </aside>
      </div>
    </Container>
  );
}
