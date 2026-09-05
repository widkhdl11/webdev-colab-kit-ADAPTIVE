"use client";

import { useActionState } from "react";
import type { ApplyState } from "@/entities/post";
import { Button, ButtonLink } from "@/shared/ui/button/Button";
import type { ActionResult } from "@/shared/lib/action-result";
import { applyToStudyAction } from "../api/apply";
import styles from "./apply-button.module.css";

/**
 * 신청 버튼. 상태 3종의 생김새는 시각 기준이 정했다 —
 * 신청하기=잉크 채움 / 대기 중=점선 테두리(아직 확정 아님) / 참여 중=민트 채움.
 * 대기 중에 형광펜을 안 쓴 것은 형광펜 코딩 규칙을 카테고리·모집 상태 밖으로 넓히지 않기 위해서다.
 */
export function ApplyButton({
  state,
  studyId,
  postId,
}: {
  state: ApplyState;
  studyId: string;
  postId: string;
}) {
  const [result, submit, pending] = useActionState<ActionResult<null> | null, FormData>(
    applyToStudyAction,
    null,
  );

  if (state === "signed-out") {
    return (
      <ButtonLink href={`/login?next=/posts/${postId}`} tone="ink" size="lg" block>
        로그인하고 신청하기
      </ButtonLink>
    );
  }

  if (state === "host") {
    return (
      <ButtonLink href={`/studies/${studyId}`} tone="ink" size="lg" block>
        신청자 관리
      </ButtonLink>
    );
  }

  if (state === "joined") {
    return (
      <ButtonLink href={`/studies/${studyId}`} tone="joined" size="lg" block>
        참여 중 · 스터디 보기
      </ButtonLink>
    );
  }

  if (state === "pending") {
    return (
      <Button tone="wait" size="lg" block disabled>
        신청함 · 승인 대기 중
      </Button>
    );
  }

  if (state === "rejected") {
    return (
      <Button tone="wait" size="lg" block disabled>
        승인되지 않았습니다
      </Button>
    );
  }

  if (state === "left") {
    return (
      <Button tone="wait" size="lg" block disabled>
        참여가 끝난 스터디입니다
      </Button>
    );
  }

  if (state === "closed") {
    return (
      <Button tone="outline" size="lg" block disabled>
        모집이 마감되었습니다
      </Button>
    );
  }

  return (
    <form action={submit} className={styles.wrap}>
      <input type="hidden" name="studyId" value={studyId} />
      <input type="hidden" name="postId" value={postId} />
      <Button tone="ink" size="lg" block type="submit" disabled={pending}>
        {pending ? "신청하는 중…" : "참가 신청"}
      </Button>
      {result && !result.ok ? (
        <p className={styles.error} role="alert">
          신청하지 못했습니다 — {result.message}
        </p>
      ) : null}
    </form>
  );
}
