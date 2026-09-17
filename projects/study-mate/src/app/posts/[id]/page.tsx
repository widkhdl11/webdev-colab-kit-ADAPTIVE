import { notFound } from "next/navigation";
import { readUnreadNotificationCount } from "@/entities/notification";
import { applyState, canEditPost, readPostDetail } from "@/entities/post";
import { currentUser } from "@/entities/session";
import { ViewCounter } from "@/features/count-post-view";
import { ApplyButton } from "@/features/apply-to-study";
import { LikeButton } from "@/features/like-post";
import { ButtonLink } from "@/shared/ui/button/Button";
import { SkipLink } from "@/shared/ui/skip-link/SkipLink";
import { PostDetailView } from "@/widgets/post-detail";
import { SiteFooter } from "@/widgets/site-footer";
import { SiteHeader } from "@/widgets/site-header";

// 신청 상태가 "지금 누구인가"에 따라 다르므로 요청마다 새로 그린다.
export const dynamic = "force-dynamic";

export default async function PostDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const user = await currentUser();
  const post = await readPostDetail(id, user?.id ?? null);

  // 없는 글과 지워진 스터디의 글이 화면에서 같아야 한다 — 지워졌다는 사실 자체가
  // 정보이기 때문이다(INV-Z10 은 그 글을 조회에서 감춘다).
  if (!post) notFound();

  const unread = user ? await readUnreadNotificationCount() : 0;

  // **조회 집계는 여기서 안 한다.** 본문에서 부르면 화면을 다시 그릴 때마다 또 세어진다 —
  // 좋아요를 누를 때마다 조회수가 1 오르던 것이 그 때문이었다. 세는 자리는 아래
  // `<ViewCounter />` 이고, 같은 방문의 두 번째 호출은 그쪽 가드가 흡수한다 (INV-V1).

  const state = applyState(post, user?.id ?? null);
  // **이 링크가 인가는 아니다.** 링크를 지워도 주소를 치면 그 화면이 열리고, 거기서
  // 판정하는 것은 수정 화면의 판독기와 갱신 정책이다 (INV-Z3).
  const iCanEdit = canEditPost(post, user?.id ?? null);

  return (
    <>
      <SkipLink />
      <ViewCounter postId={id} />
      <SiteHeader signedIn={user !== null} unreadCount={unread} current="posts" />

      <main id="main">
        <PostDetailView
          post={post}
          state={state}
          applyAction={
            <ApplyButton state={state} studyId={post.study.id} postId={post.id} />
          }
          likeAction={
            <LikeButton
              postId={post.id}
              count={post.likesCount}
              likedByMe={post.likedByMe}
              signedIn={user !== null}
            />
          }
          authorAction={
            iCanEdit ? (
              <ButtonLink href={`/posts/${post.id}/edit`} size="sm">
                모집글 수정
              </ButtonLink>
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
  const post = await readPostDetail(id, null).catch(() => null);
  if (!post) return { title: "모집글을 찾을 수 없습니다 — Study Mate" };
  return {
    title: `${post.title} — Study Mate`,
    description: post.summary ?? undefined,
  };
}
