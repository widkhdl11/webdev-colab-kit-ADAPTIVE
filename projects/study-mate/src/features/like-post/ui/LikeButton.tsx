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
type Props = {
  postId: string;
  count: number;
  likedByMe: boolean;
  signedIn: boolean;
};

export function LikeButton(props: Props) {
  if (!props.signedIn) {
    return (
      <p className={styles.plain}>
        <HeartIcon size={16} />
        좋아요 {props.count}
      </p>
    );
  }

  // **서버가 새 값을 내려주면 옛 액션 결과를 버린다.** `useActionState` 의 결과는 다음
  // 제출 전까지 남는다. 그냥 두면 다른 탭에서 취소한 뒤 이 화면이 다시 그려져도 하트는
  // 켜진 채 개수만 0 으로 내려오고, 그 어긋남이 하드 새로고침 전까지 유지된다.
  // `key` 가 서버 값이 바뀌는 순간 아래 컴포넌트를 새로 만들어 훅 상태를 리셋한다 —
  // 그래서 훅이 이 바깥이 아니라 `LikeForm` 안에 있어야 한다.
  return <LikeForm key={`${props.postId}:${props.likedByMe}:${props.count}`} {...props} />;
}

function LikeForm({ postId, count, likedByMe }: Props) {
  const [result, submit, pending] = useActionState<ActionResult<LikeToggled> | null, FormData>(
    toggleLikeAction,
    null,
  );

  // 이 컴포넌트가 사는 동안의 최신값은 액션 결과다. 서버 값이 바뀌면 위의 `key` 가
  // 이 컴포넌트째로 갈아 치우므로 여기서 둘을 비교할 필요가 없다.
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
      {/*
        실패 문구는 **자리를 항상 지킨다.** 실패한 순간에 이 요소를 만들어 넣으면 낭독기가
        새로 생긴 라이브 영역을 안 읽는 경우가 있다(같은 이유가 NotificationBell 에 적혀
        있다). 사용자가 한 행동이 실패한 것이므로 `status` 가 아니라 `alert` 다.
      */}
      <span role="alert" className={styles.error}>
        {result && !result.ok ? result.message : ""}
      </span>
    </form>
  );
}
