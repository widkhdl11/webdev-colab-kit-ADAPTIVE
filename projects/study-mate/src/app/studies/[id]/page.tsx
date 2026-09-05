import { notFound } from "next/navigation";
import { readUnreadNotificationCount } from "@/entities/notification";
import { currentUser } from "@/entities/session";
import { readStudyPage } from "@/entities/study";
import { ParticipantActions } from "@/features/manage-participants";
import { SkipLink } from "@/shared/ui/skip-link/SkipLink";
import { StudyDetailView } from "@/widgets/study-detail";
import { SiteFooter } from "@/widgets/site-footer";
import { SiteHeader } from "@/widgets/site-header";

// 로그인해야 들어올 수 있다 (INV-A1, PROTECTED_PATHS 의 /studies).
export const dynamic = "force-dynamic";

export default async function StudyPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const user = await currentUser();
  const study = await readStudyPage(id);
  if (!study) notFound();

  const unread = user ? await readUnreadNotificationCount() : 0;
  const isHost = user?.id === study.hostId;
  const amMember = study.myStatus === "accepted";

  return (
    <>
      <SkipLink />
      <SiteHeader signedIn={user !== null} unreadCount={unread} />

      <main id="main">
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
  const study = await readStudyPage(id).catch(() => null);
  return { title: study ? `${study.title} — Study Mate` : "스터디를 찾을 수 없습니다 — Study Mate" };
}
