import Link from "next/link";
import { categoryColor } from "@/entities/category";
import type { MyPost } from "@/entities/post";
import type { ProfileCard } from "@/entities/profile";
import { canOpenPost, type MyParticipation, type MyStudy } from "@/entities/study";
import { relativeDay } from "@/shared/lib/schedule";
import { Avatar } from "@/shared/ui/avatar/Avatar";
import { CardBody, CardLink } from "@/shared/ui/card/Card";
import { CardGrid } from "@/shared/ui/section/Section";
import { SeatBar } from "@/shared/ui/seat-bar/SeatBar";
import { StatusBadge } from "@/shared/ui/status-badge/StatusBadge";
import { Tag } from "@/shared/ui/tag/Tag";
import styles from "./profile-overview.module.css";

/** 스터디가 안 보일 때 그 자리에 적는 말. 화면이 정하는 문구다 */
const DELETED_STUDY = "지워진 스터디";

const STATUS_LABEL: Readonly<Record<MyParticipation["status"], string>> = {
  pending: "대기 중",
  accepted: "참여 중",
  rejected: "거절됨",
};

/**
 * 신청 상태의 겉모습. 승인된 「신청 상태 3종」이 정한 것을 그대로 옮긴다 —
 * 참여 중=민트 채움, 대기 중=점선 테두리(아직 확정 아님). 버튼이 아니라 표시라서
 * 버튼 컴포넌트를 쓰지 않고 같은 값만 가져온다.
 *
 * **거절됨은 승인된 표현이 없다.** 색도 형태도 주지 않고 글자로만 적는다 — 지금 지어내면
 * 승인 안 된 넷째 표현이 화면에 굳는다. 보류로 올려 둔 자리다.
 */
const STATUS_CLASS: Readonly<Record<MyParticipation["status"], string | undefined>> = {
  pending: styles.waiting,
  accepted: styles.joined,
  rejected: undefined,
};

export function ProfileOverview({
  profile,
  studies,
  participations,
  posts,
}: {
  profile: ProfileCard;
  studies: readonly MyStudy[];
  participations: readonly MyParticipation[];
  posts: readonly MyPost[];
}) {
  const meta = [profile.regionName, profile.interestCategoryName].filter(Boolean);

  return (
    <>
      <header className={styles.head}>
        <Avatar name={profile.username} src={profile.avatarUrl} size="lg" />
        <div>
          <h1 className={`h-display ${styles.name}`}>{profile.username}</h1>
          {meta.length > 0 ? <p className={styles.meta}>{meta.join(" · ")}</p> : null}
        </div>
      </header>

      {profile.bio ? <p className={styles.bio}>{profile.bio}</p> : null}

      {/* 링크 둘을 그냥 나란히 두면 읽어 주는 기계가 「프로필 수정 비밀번호 변경」을
          한 덩어리로 읽는다 */}
      <nav className={styles.actions} aria-label="내 계정">
        <ul>
          <li>
            <Link href="/profile/edit">프로필 수정</Link>
          </li>
          <li>
            <Link href="/profile/password">비밀번호 변경</Link>
          </li>
        </ul>
      </nav>

      <section className={styles.block}>
        <h2 className={styles.blockTitle}>내가 만든 스터디</h2>
        {studies.length === 0 ? (
          // 「아직 만든 적이 없다」로 적으면 만들었다가 전부 지운 사람에게 거짓말이 된다
          <p className={styles.empty}>
            보여 줄 스터디가 없습니다. <Link href="/studies/create">스터디를 열어 보세요.</Link>
          </p>
        ) : (
          <CardGrid columns={2}>
            {studies.map((study) => (
              <CardLink key={study.id} href={`/studies/${study.id}`}>
                <CardBody>
                  <div className={styles.cardTop}>
                    <Tag color={categoryColor(study.categoryId)}>{study.categoryName}</Tag>
                    <StatusBadge on={study.recruiting}>
                      {study.recruiting ? "모집중" : "마감"}
                    </StatusBadge>
                  </div>
                  <h3 className={styles.cardTitle}>{study.title}</h3>
                  <SeatBar filled={study.filled} capacity={study.capacity} open={study.recruiting} />
                </CardBody>
              </CardLink>
            ))}
          </CardGrid>
        )}
      </section>

      <section className={styles.block}>
        <h2 className={styles.blockTitle}>내 신청 현황</h2>
        {participations.length === 0 ? (
          // 신청이 전부 취소·종료된 사람도 있다. 그 사람에게 「아직 신청한 적 없다」는 거짓이다
          <p className={styles.empty}>
            보여 줄 신청이 없습니다. <Link href="/posts">모집글을 둘러보세요.</Link>
          </p>
        ) : (
          <ul className={styles.rows}>
            {participations.map((p) => (
              <li key={p.id} className={styles.row}>
                {/* 스터디가 안 보이면 갈 곳도 없다 — 링크를 걸면 404 로 보낸다 */}
                {p.study.available ? (
                  <Link href={`/studies/${p.study.id}`} className={styles.rowTitle}>
                    {p.study.title}
                  </Link>
                ) : (
                  <span className={`${styles.rowTitle} ${styles.gone}`}>{DELETED_STUDY}</span>
                )}
                <span className={styles.rowMeta}>
                  <span className={STATUS_CLASS[p.status]}>{STATUS_LABEL[p.status]}</span>
                  <span>· {relativeDay(p.createdAt)} 신청</span>
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className={styles.block}>
        <h2 className={styles.blockTitle}>내가 쓴 모집글</h2>
        {posts.length === 0 ? (
          <p className={styles.empty}>
            보여 줄 모집글이 없습니다.{" "}
            {/* 「쓸 수 있나」의 판정은 entities 가 한다 — 조건은 「내 스터디가 있다」가
                아니라 「모집 중인 내 스터디가 있다」다(INV-Z14) */}
            {canOpenPost(studies) ? <Link href="/posts/create">모집글을 써 보세요.</Link> : null}
          </p>
        ) : (
          <ul className={styles.rows}>
            {posts.map((post) => (
              <li key={post.id} className={styles.row}>
                <Link href={`/posts/${post.id}`} className={styles.rowTitle}>
                  {post.title}
                </Link>
                <span className={styles.rowMeta}>
                  {/* 사각 형광펜 라벨이 뜻하는 것은 「카테고리」다. 스터디 이름을 여기
                      넣으면 같은 기호가 두 가지를 뜻하게 된다 — `/chats` 에서 실제로
                      그렇게 됐고 ui-reviewer 가 지적해 뒀다. 이름은 글자로 적는다 */}
                  <Tag color={categoryColor(post.categoryId)}>{post.categoryName}</Tag>
                  {/* 가운뎃점으로 잇는 글자는 한 덩어리다. 조각으로 나눠 두면 그 사이마다
                      간격이 한 번씩 더 벌어진다 */}
                  <span>
                    {post.studyTitle} · {relativeDay(post.createdAt)} · 조회{" "}
                    <span className="num">{post.viewsCount}</span> · 좋아요{" "}
                    <span className="num">{post.likesCount}</span>
                  </span>
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  );
}
