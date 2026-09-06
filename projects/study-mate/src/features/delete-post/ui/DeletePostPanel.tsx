"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { Button } from "@/shared/ui/button/Button";
import { FormConfirm, FormError } from "@/shared/ui/field/Field";
import type { ActionResult } from "@/shared/lib/action-result";
import { deletePostAction } from "../api/delete-post";
import type { RemovedPost } from "../api/remove-post";
import styles from "./delete-post.module.css";

/**
 * 모집글을 지우는 자리. 승인된 시각 기준의 「파괴적 행동」 규칙 그대로다
 * (design-rules.md 2026-09-06 (2)):
 *
 * - **새 톤도 새 색도 없다.** 테두리 버튼이고 글자로만 말한다 — 형광펜 8색은 카테고리와
 *   모집 상태가 다 쓰고 있어서, 삭제에 색을 주면 같은 색이 두 가지를 뜻하게 된다.
 * - **한 번에 실행되지 않는다.** 실수로 지워지는 것을 막는 것은 색이 아니라 두 번 누르게
 *   하는 것이다.
 * - **브라우저 기본 확인 창을 안 쓴다.** 회색 시스템 창이 이 세계관 밖이다.
 *
 * 수정 폼과 **다른 `<form>`** 이다. 폼은 겹칠 수 없고, 겹칠 수 있다 해도 「저장」과
 * 「삭제」가 한 패널에 나란해지면 안 된다.
 */
export function DeletePostPanel({ postId }: { postId: string }) {
  const [result, submit, pending] = useActionState<ActionResult<RemovedPost> | null, FormData>(
    deletePostAction,
    null,
  );
  const [confirming, setConfirming] = useState(false);

  // **초점을 따라 옮긴다.** 버튼이 언마운트되면서 자리가 바뀌므로, 안 옮기면 초점이
  // `document.body` 로 떨어진다 — 낭독기 사용자는 `role="alert"` 로 문구를 듣지만
  // **화면을 보면서 키보드만 쓰는 사용자**는 알림도 없고 Tab 을 문서 처음부터 다시 눌러야
  // 한다. 그 갈래는 `role="alert"` 가 못 덮는다 (2026-09-06 ui-reviewer).
  const 확인버튼 = useRef<HTMLButtonElement>(null);
  const 여는버튼 = useRef<HTMLButtonElement>(null);
  // 어느 쪽으로 움직였는지를 들고 있어야 첫 렌더에서 초점을 뺏지 않는다.
  const 이동 = useRef<"none" | "toConfirm" | "toTrigger">("none");
  useEffect(() => {
    if (이동.current === "toConfirm") 확인버튼.current?.focus();
    if (이동.current === "toTrigger") 여는버튼.current?.focus();
    이동.current = "none";
  }, [confirming]);

  return (
    <section className={styles.panel} aria-labelledby="delete-post">
      <h2 className={styles.title} id="delete-post">
        모집글 지우기
      </h2>
      <p className={styles.hint}>
        지우면 되돌릴 수 없습니다. 이 모집글에 달린 좋아요도 같이 사라집니다.{" "}
        <strong>스터디와 참여자·대화는 그대로 남습니다.</strong>
      </p>

      {confirming ? (
        <form action={submit}>
          <input type="hidden" name="postId" value={postId} />
          {/*
            **오류를 확인 갈래 안에 둔다.** 밖에 두면 실패한 뒤 「취소」를 눌렀을 때
            확인 블록만 접히고 오류 문구는 접힌 버튼 위에 남는다 — `useActionState` 의
            결과는 스스로 비워지지 않는다 (2026-09-06 code-reviewer).
          */}
          {result && !result.ok ? <FormError message={result.message} /> : null}
          <FormConfirm>이 모집글을 지웁니다. 되돌릴 수 없습니다.</FormConfirm>
          <div className={styles.actions}>
            <Button type="submit" size="lg" disabled={pending} ref={확인버튼}>
              {pending ? "지우는 중…" : "지웁니다"}
            </Button>
            <Button
              type="button"
              size="lg"
              disabled={pending}
              onClick={() => {
                이동.current = "toTrigger";
                setConfirming(false);
              }}
            >
              취소
            </Button>
          </div>
        </form>
      ) : (
        <div className={styles.actions}>
          <Button
            type="button"
            size="lg"
            ref={여는버튼}
            onClick={() => {
              이동.current = "toConfirm";
              setConfirming(true);
            }}
          >
            모집글 삭제
          </Button>
        </div>
      )}
    </section>
  );
}
