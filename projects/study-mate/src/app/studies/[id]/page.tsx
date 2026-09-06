import { notFound } from "next/navigation";
import { readUnreadNotificationCount } from "@/entities/notification";
import { currentUser } from "@/entities/session";
import { readStudyPage } from "@/entities/study";
import { ParticipantActions } from "@/features/manage-participants";
import { FormError } from "@/shared/ui/field/Field";
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
  const study = await readStudyPage(id, user?.id ?? null);
  if (!study) notFound();

  const unread = user ? await readUnreadNotificationCount() : 0;
  const isHost = user?.id === study.hostId;
  const amMember = study.myStatus === "accepted";

  return (
    <>
      <SkipLink />
      <SiteHeader signedIn={user !== null} unreadCount={unread} />

      <main id="main">
        {slotsFailed ? (
          <FormError message="스터디는 만들어졌지만 모임 일정은 저장되지 못했습니다. 지금은 일정을 다시 넣을 수 없습니다." />
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
