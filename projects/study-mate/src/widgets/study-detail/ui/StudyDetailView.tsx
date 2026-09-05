import Link from "next/link";
import type { ReactNode } from "react";
import { categoryColor } from "@/entities/category";
import { MEETING_MODE_LABEL } from "@/entities/post";
import type { Member, StudyPage } from "@/entities/study";
import { Avatar } from "@/shared/ui/avatar/Avatar";
import { ButtonLink } from "@/shared/ui/button/Button";
import { Card, CardDivider } from "@/shared/ui/card/Card";
import { Container } from "@/shared/ui/container/Container";
import { SeatBar } from "@/shared/ui/seat-bar/SeatBar";
import { StatusBadge } from "@/shared/ui/status-badge/StatusBadge";
import { Tag } from "@/shared/ui/tag/Tag";
import { formatPeriod, formatSlotsLong, relativeDay } from "@/shared/lib/schedule";
import styles from "./study-detail.module.css";

function place(study: StudyPage): string {
  const parts = [study.regionName];
  if (study.locationDetail) parts.push(`(${study.locationDetail})`);
  if (study.meetingMode !== "offline") parts.push(`· ${MEETING_MODE_LABEL[study.meetingMode]}`);
  return parts.join(" ");
}

function PersonRow({
  member,
  suffix,
  actions,
}: {
  member: Member;
  suffix?: string;
  actions?: ReactNode;
}) {
  return (
    <li className={styles.person}>
      <Avatar name={member.person.username} />
      <div className={styles.personText}>
        <p className={styles.personName}>
          {member.person.username}
          {member.isHost ? <span className={styles.hostMark}>호스트</span> : null}
        </p>
        <p className={styles.personSub}>{suffix ?? `${relativeDay(member.since)} 참여`}</p>
      </div>
      {actions ? <div className={styles.personActions}>{actions}</div> : null}
    </li>
  );
}

/**
 * 스터디 상세 — 멤버 목록, 신청자 승인·거절, 채팅방 입구 (docs/IA.md).
 *
 * 신청자 칸은 **호스트에게만 채워진다.** 여기서 거르는 것이 아니라 접근 정책이 애초에
 * 안 보여준다(INV-Z11) — 화면이 거르는 방식이면 화면을 안 거치는 요청에 그대로 샌다.
 */
export function StudyDetailView({
  study,
  isHost,
  memberActionsFor,
  applicantActionsFor,
  leaveAction,
}: {
  study: StudyPage;
  isHost: boolean;
  memberActionsFor?: (member: Member) => ReactNode;
  applicantActionsFor?: (member: Member) => ReactNode;
  leaveAction?: ReactNode;
}) {
  return (
    <Container>
      <nav className={styles.crumb} aria-label="현재 위치">
        <Link href="/">홈</Link>
        <span aria-hidden="true">/</span>
        <Link href="/posts">모집글 찾기</Link>
        <span aria-hidden="true">/</span>
        <span>{study.title}</span>
      </nav>

      <div className={styles.grid}>
        <article>
          <div className={styles.head}>
            <Tag color={categoryColor(study.categoryId)}>{study.categoryName}</Tag>
            <StatusBadge on={study.recruiting}>{study.recruiting ? "모집중" : "마감"}</StatusBadge>
          </div>

          <h1 className={`h-display ${styles.title}`}>{study.title}</h1>
          {study.summary ? <p className={styles.summary}>{study.summary}</p> : null}

          <dl className={styles.metaList}>
            <div className={styles.metaRow}>
              <dt>지역</dt>
              <dd>{place(study)}</dd>
            </div>
            <div className={styles.metaRow}>
              <dt>기간</dt>
              <dd className="num">{formatPeriod(study.startsOn, study.endsOn)}</dd>
            </div>
            <div className={styles.metaRow}>
              <dt>요일·시간</dt>
              <dd>{formatSlotsLong(study.slots)}</dd>
            </div>
          </dl>

          <div className={styles.prose}>
            {study.description.split(/\n{2,}/).map((para, i) => (
              <p key={i}>{para}</p>
            ))}
          </div>

          {isHost ? (
            <section className={styles.block}>
              <h2 className={styles.blockTitle}>
                신청자 <span className="num">{study.applicants.length}</span>
              </h2>
              {study.applicants.length === 0 ? (
                <p className={styles.empty}>아직 새 신청이 없습니다.</p>
              ) : (
                <ul className={styles.people}>
                  {study.applicants.map((a) => (
                    <PersonRow
                      key={a.participantId}
                      member={a}
                      suffix={`${relativeDay(a.since)} 신청`}
                      actions={applicantActionsFor?.(a)}
                    />
                  ))}
                </ul>
              )}
            </section>
          ) : null}

          <section className={styles.block}>
            <h2 className={styles.blockTitle}>
              멤버 <span className="num">{study.members.length}</span>
            </h2>
            {study.members.length === 0 ? (
              <p className={styles.empty}>
                멤버 목록은 이 스터디에 참여한 사람에게만 보입니다.
              </p>
            ) : (
              <ul className={styles.people}>
                {study.members.map((m) => (
                  <PersonRow
                    key={m.participantId}
                    member={m}
                    actions={memberActionsFor?.(m)}
                  />
                ))}
              </ul>
            )}
          </section>
        </article>

        <aside className={styles.side} aria-label="스터디 상태">
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

            {study.chatId ? (
              <ButtonLink href={`/chats/${study.chatId}`} tone="ink" size="lg" block>
                채팅방 들어가기
              </ButtonLink>
            ) : (
              <p className={styles.note}>
                채팅방은 이 스터디의 멤버에게만 열립니다.
              </p>
            )}

            {leaveAction ? <div className={styles.leave}>{leaveAction}</div> : null}
          </Card>
        </aside>
      </div>
    </Container>
  );
}
