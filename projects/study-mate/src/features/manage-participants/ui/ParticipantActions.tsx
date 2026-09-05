"use client";

import { useActionState } from "react";
import { Button } from "@/shared/ui/button/Button";
import type { ActionResult } from "@/shared/lib/action-result";
import { changeParticipationAction } from "../api/manage";
import styles from "./participant-actions.module.css";

type Transition = "accepted" | "rejected" | "kicked" | "withdrawn";

const LABEL: Readonly<Record<Transition, string>> = {
  accepted: "수락",
  rejected: "거절",
  kicked: "내보내기",
  withdrawn: "탈퇴하기",
};

/**
 * 한 사람에 대해 할 수 있는 일 한두 개. 각 버튼이 자기 폼을 갖는다 —
 * 하나의 폼에 버튼 여럿을 두면 어느 것을 눌렀는지가 브라우저마다 달라진다.
 */
export function ParticipantActions({
  studyId,
  targetUserId,
  targetName,
  actions,
}: {
  studyId: string;
  targetUserId: string;
  /** 확인 문구에 쓰는 이름. "누구를" 내보내는지가 버튼 이름에 들어가야 한다 */
  targetName: string;
  actions: readonly Transition[];
}) {
  const [result, submit, pending] = useActionState<ActionResult<null> | null, FormData>(
    changeParticipationAction,
    null,
  );

  return (
    <div className={styles.wrap}>
      <div className={styles.row}>
        {actions.map((next) => (
          <form action={submit} key={next}>
            <input type="hidden" name="studyId" value={studyId} />
            <input type="hidden" name="targetUserId" value={targetUserId} />
            <input type="hidden" name="next" value={next} />
            <Button
              size="sm"
              tone={next === "accepted" ? "ink" : "outline"}
              type="submit"
              disabled={pending}
              aria-label={
                next === "withdrawn" ? "이 스터디에서 탈퇴하기" : `${targetName} ${LABEL[next]}`
              }
            >
              {LABEL[next]}
            </Button>
          </form>
        ))}
      </div>
      {result && !result.ok ? (
        <p className={styles.error} role="alert">
          {result.message}
        </p>
      ) : null}
    </div>
  );
}
