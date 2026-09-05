import { notFound } from "next/navigation";
import { readUnreadNotificationCount } from "@/entities/notification";
import { applyState, countPostView, readPostDetail } from "@/entities/post";
import { currentUser } from "@/entities/session";
import { ApplyButton } from "@/features/apply-to-study";
import { SkipLink } from "@/shared/ui/skip-link/SkipLink";
import { PostDetailView } from "@/widgets/post-detail";
import { SiteFooter } from "@/widgets/site-footer";
import { SiteHeader } from "@/widgets/site-header";

// 신청 상태가 "지금 누구인가"에 따라 다르므로 요청마다 새로 그린다.
export const dynamic = "force-dynamic";

export default async function PostDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const user = await currentUser();
  const post = await readPostDetail(id);

  // 없는 글과 지워진 스터디의 글이 화면에서 같아야 한다 — 지워졌다는 사실 자체가
  // 정보이기 때문이다(INV-Z10 은 그 글을 조회에서 감춘다).
  if (!post) notFound();

  const unread = user ? await readUnreadNotificationCount() : 0;
  await countPostView(id);

  const state = applyState(post, user?.id ?? null);

  return (
    <>
      <SkipLink />
      <SiteHeader signedIn={user !== null} unreadCount={unread} current="posts" />

      <main id="main">
        <PostDetailView
          post={post}
          state={state}
          applyAction={
            <ApplyButton state={state} studyId={post.study.id} postId={post.id} />
          }
        />
      </main>

      <SiteFooter />
    </>
  );
}

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const post = await readPostDetail(id).catch(() => null);
  if (!post) return { title: "모집글을 찾을 수 없습니다 — Study Mate" };
  return {
    title: `${post.title} — Study Mate`,
    description: post.summary ?? undefined,
  };
}
