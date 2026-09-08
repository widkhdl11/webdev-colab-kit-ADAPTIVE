import Link from "next/link";
import { notFound } from "next/navigation";
import { readUnreadNotificationCount } from "@/entities/notification";
import { currentUser } from "@/entities/session";
import { readStudyPage } from "@/entities/study";
import { ParticipantActions } from "@/features/manage-participants";
import { Container } from "@/shared/ui/container/Container";
import { FormError } from "@/shared/ui/field/Field";
import { canonicalUuid } from "@/shared/lib/uuid";
import { SkipLink } from "@/shared/ui/skip-link/SkipLink";
import { StudyDetailView } from "@/widgets/study-detail";
import { SiteFooter } from "@/widgets/site-footer";
import { SiteHeader } from "@/widgets/site-header";

// 로그인해야 들어올 수 있다 (INV-A1, PROTECTED_PATHS 의 /studies).
export const dynamic = "force-dynamic";

export default async function StudyPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ slots?: string }>;
}) {
  const { id } = await params;
  // 개설은 됐는데 모임 일정만 저장이 실패했을 때 개설 액션이 붙여 보내는 표시다.
  // 그 액션은 실패해도 이 화면으로 보낸다 — 폼에 남겨 두면 사용자가 다시 제출해
  // 같은 스터디를 하나 더 만든다 (2026-09-06 code-reviewer).
  const slotsFailed = (await searchParams).slots === "failed";

  const user = await currentUser();
  // **id 를 정규화해 지난다** — 안 하면 uuid 가 아닌 주소가 Postgres 까지 가서 22P02 가
  // 나고 화면이 404 가 아니라 500 이 된다. 수정 화면이 하는 것과 같은 처리다.
  const studyId = canonicalUuid(id);
  const study = studyId ? await readStudyPage(studyId, user?.id ?? null) : null;
  if (!study) notFound();

  const unread = user ? await readUnreadNotificationCount() : 0;
  const isHost = user?.id === study.hostId;
  const amMember = study.myStatus === "accepted";

  return (
    <>
      <SkipLink />
      <SiteHeader signedIn={user !== null} unreadCount={unread} />

      <main id="main">
        {/* **컨테이너 안에 둔다.** 밖에 두면 이 띠만 화면 좌우 끝까지 뻗어서 바로 아래
            제목과 왼쪽 선이 안 맞는다(2026-09-07 ui-reviewer).
            문구에서 방향어를 뺐다 — 960px 이상에서 「스터디 수정」은 아래가 아니라
            오른쪽 패널에 있다. 대신 갈 곳을 링크로 직접 준다 */}
        {slotsFailed ? (
          <Container>
            <FormError
              message={
                <>
                  스터디는 만들어졌지만 모임 일정은 저장되지 못했습니다.{" "}
                  <Link href={`/studies/${study.id}/edit`}>스터디 수정</Link>에서 다시 넣어 주세요.
                </>
              }
            />
          </Container>
        ) : null}
        <StudyDetailView
          study={study}
          isHost={isHost}
          applicantActionsFor={
            isHost
              ? (a) => (
                  <ParticipantActions
                    studyId={study.id}
                    targetUserId={a.person.id}
                    targetName={a.person.username}
                    actions={["accepted", "rejected"]}
                  />
                )
              : undefined
          }
          memberActionsFor={
            isHost
              ? (m) =>
                  m.isHost ? null : (
                    <ParticipantActions
                      studyId={study.id}
                      targetUserId={m.person.id}
                      targetName={m.person.username}
                      actions={["kicked"]}
                    />
                  )
              : undefined
          }
          leaveAction={
            amMember && !isHost ? (
              <ParticipantActions
                studyId={study.id}
                targetUserId={user!.id}
                targetName="나"
                actions={["withdrawn"]}
              />
            ) : null
          }
        />
      </main>

      <SiteFooter signedIn={user !== null} />
    </>
  );
}

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const study = await readStudyPage(id, null).catch(() => null);
  return { title: study ? `${study.title} — Study Mate` : "스터디를 찾을 수 없습니다 — Study Mate" };
}
