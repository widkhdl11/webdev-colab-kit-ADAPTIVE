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

/**
 * 모집 마감일 한 줄.
 *
 * **마감일이 지나도 모집이 닫히는 것은 아니다** — 모집을 닫는 것은 호스트이고(`closed_at`),
 * 마감일은 호스트가 적어 둔 목표다(2026-09-05 결정 · INV-P6 은 마감일을 보지 않는다).
 *
 * 그래서 이 줄은 **모집 상태를 받아야 한다.** 날짜만 보면 화면이 스스로와 부딪힌다 —
 * 옛 문구 "(지났습니다)" 는 「모집중」 배지·눌리는 신청 버튼과 부딪혔고, 그것을 "아직
 * 신청받는다"로만 바꾸면 이번엔 모집이 끝난 스터디에서 「마감」 배지와 부딪힌다.
 *
 * **네 사분면을 다 짝지어야 한다.** 마감일(지났다/안 지났다) × 모집 상태(연다/닫혔다)이고,
 * 「마감인데 마감일은 미래」가 실제로 흔한 쪽이다 — `recruiting` 은 호스트가 닫았을 때만
 * 거짓이 되는 것이 아니라 **정원이 찼을 때도** 거짓이 된다(INV-P6: 닫지 않았다 + 안 지워졌다
 * + 수락 인원 < 정원). 그때 마감일은 대개 아직 남아 있다.
 *
 * 판단은 `recruiting` 이 하고 여기서는 값을 문구로 옮기기만 한다. 왜 신청을 받는지의
 * **설명**은 여기 없다 — 우측 패널의 안내 문장이 그 자리다.
 */
function deadlineLine(recruitUntil: string | null, recruiting: boolean): string {
  const left = daysUntil(recruitUntil);
  if (left === null) return "기한 없음";
  const date = formatDate(recruitUntil);
  if (!recruiting) return left < 0 ? `${date} (지난 날짜)` : `${date} (모집은 이미 끝났습니다)`;
  if (left < 0) return `${date} (지났지만 아직 모집 중)`;
  if (left === 0) return `${date} (오늘까지)`;
  return `${date} (${left}일 남음)`;
}

/**
 * 신청 버튼 아래의 안내 문장.
 *
 * **버튼이 가르는 만큼 여기서도 가른다.** 버튼은 여덟 상태를 다 가르는데 이 문장이
 * 모집 여부 하나로만 갈리던 때는, 호스트가 자기 스터디에서 "신청하면 승인을 기다립니다"를
 * 읽고 참여 중인 사람이 같은 문장을 다시 읽었다.
 *
 * 「마감일이 지났어도…」는 **지났을 때만** 붙인다. 마감일이 87일 남은 스터디에서 그 문장을
 * 읽으면 읽는 사람이 자기 화면의 날짜를 되짚게 된다. 그리고 그 설명이 가장 필요한 사람은
 * 로그인하지 않은 방문자다 — 모집글 상세는 로그인 없이 읽는 화면이라, 이 문장이 없으면
 * 「지났지만 아직 모집 중」의 이유가 그 사람에게만 없다.
 */
function noteFor(state: ApplyState, recruiting: boolean, deadlinePassed: boolean, left: number): string {
  const stillOpen = recruiting && deadlinePassed ? " 마감일이 지났어도 호스트가 모집을 닫기 전까지는 신청을 받습니다." : "";
  if (state === "signed-out") {
    return `신청하려면 로그인이 필요합니다. 모집글을 읽는 데는 로그인이 필요 없습니다.${stillOpen}`;
  }
  if (state === "host") return "내가 연 스터디입니다. 대기 중인 신청은 스터디 화면에서 승인합니다.";
  if (state === "joined") return "이미 참여 중입니다. 대화는 스터디 화면에서 이어집니다.";
  if (state === "pending") return "호스트의 승인을 기다리는 중입니다. 결과는 알림으로 옵니다.";
  if (!recruiting) return "이 스터디는 더 이상 신청을 받지 않습니다.";
  return `신청하면 호스트의 승인을 기다립니다.${stillOpen} 지금 어떤 상태인지는 알림과 내 프로필에서 언제든 확인할 수 있습니다. 남은 자리 ${left}개.`;
}

export function PostDetailView({
  post,
  state,
  applyAction,
  authorAction,
}: {
  post: PostDetail;
  state: ApplyState;
  /** 신청 버튼 자리. 무엇을 보여줄지는 화면이 정하고 여기서는 자리만 낸다 */
  applyAction: ReactNode;
  /**
   * 작성자에게만 보이는 자리(모집글 수정). **여기서 판정하지 않는다** — 「내가 쓴 글인가」는
   * 세션을 보는 판단이라 화면이 하고, 위젯은 자리만 낸다. `applyAction` 과 같은 규약이다.
   */
  authorAction?: ReactNode;
}) {
  const { study } = post;
  const color = categoryColor(study.categoryId);
  const left = Math.max(0, study.capacity - study.filled);
  // 마감일 판단은 **한 번만** 한다. 메타 줄과 안내 문장이 각자 계산하면 둘이 어긋난다.
  const deadlinePassed = (daysUntil(study.recruitUntil) ?? 0) < 0;

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
              <dd className="num">{deadlineLine(study.recruitUntil, study.recruiting)}</dd>
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
              숫자 둘을 한 덩어리로 묶는다. 전에는 `space-between` 이 좋아요와 조회를 양
              끝으로 밀고 있었는데, 작성자에게만 나오는 「수정」이 붙으면 그 배치가 사람에
              따라 달라진다 — 남이 볼 때와 내가 볼 때 같은 숫자가 다른 자리에 앉는다.
            */}
            <div className={styles.statGroup}>
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
            {authorAction}
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

            <p className={styles.note}>{noteFor(state, study.recruiting, deadlinePassed, left)}</p>
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
