"use client";

import { useActionState } from "react";
import { HeartIcon } from "@/shared/ui/icon/Icon";
import type { ActionResult } from "@/shared/lib/action-result";
import { toggleLikeAction } from "../api/like";
import type { LikeToggled } from "../api/toggle-like";
import styles from "./like-button.module.css";

/**
 * 좋아요 단추.
 *
 * **비로그인은 누를 수 없는 숫자로 둔다.** 누를 수 없는 것을 단추처럼 그리면 눌러 보고
 * 나서야 알게 된다 — 이 자리에 원래 있던 주석이 같은 이유로 숫자를 그려 두고 있었다.
 * 로그인으로 보내는 링크로 만들지 않은 것은, 읽으러 온 사람을 로그인 화면으로 끌고 가는
 * 자리가 이미 신청 단추라서다(한 화면에 두 개는 재촉으로 읽힌다).
 *
 * **개수는 서버가 준 값을 그대로 쓴다.** 눌린 직후의 숫자를 화면에서 더하고 빼지 않는다 —
 * 그러면 두 사람이 동시에 누른 순간 화면의 숫자가 서버와 갈라지고, 그 상태는 새로고침
 * 전까지 아무도 모른다. 액션이 성공하면 `revalidate` 가 이 화면을 다시 그린다.
 */
export function LikeButton({
  postId,
  count,
  likedByMe,
  signedIn,
}: {
  postId: string;
  count: number;
  likedByMe: boolean;
  signedIn: boolean;
}) {
  const [result, submit, pending] = useActionState<ActionResult<LikeToggled> | null, FormData>(
    toggleLikeAction,
    null,
  );

  if (!signedIn) {
    return (
      <p className={styles.plain}>
        <HeartIcon size={16} />
        좋아요 {count}
      </p>
    );
  }

  // 서버가 방금 돌려준 상태가 있으면 그것이 최신이다. 없으면 이 화면을 그릴 때의 값.
  const liked = result?.ok ? result.value.liked : likedByMe;

  return (
    <form action={submit} className={styles.form}>
      <input type="hidden" name="postId" value={postId} />
      <button
        type="submit"
        className={styles.button}
        aria-pressed={liked}
        disabled={pending}
        data-liked={liked ? "on" : undefined}
      >
        <HeartIcon size={16} />
        좋아요 {count}
      </button>
      {result && !result.ok ? (
        <span role="status" className={styles.error}>
          {result.message}
        </span>
      ) : null}
    </form>
  );
}
