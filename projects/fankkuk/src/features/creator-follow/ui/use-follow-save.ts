"use client";

import { useRouter } from "next/navigation";
import { useCallback, useRef, useState } from "react";
import { saveFollow } from "../api/save-follow";
import { FOLLOW_SAVE_FAILED, UNFOLLOW_SAVE_FAILED } from "../model/follow-notice";

// 팔로우 저장 한 번 — 크리에이터 상세의 버튼 묶음(ProfileFollowActions)과 「팔로우하고 선물 보내기」(FollowThenSend)가 같이 쓴다.
// 저장 중에는 다시 보내지 않는다(요청 순서가 뒤바뀌어 화면과 저장 값이 어긋나지 않게). 세션이 끝났으면 로그인 화면으로,
// 그 밖의 실패는 알림 문구를 채운다. 성공했을 때 무엇을 할지(화면 전환·이동)는 부르는 쪽이 정한다 — save 가 true 를 돌려준다.

export function useFollowSave(creatorId: string) {
  const router = useRouter();
  const savingRef = useRef(false);
  const [saving, setSaving] = useState(false);
  const [failText, setFailText] = useState("");

  const save = useCallback(
    async (next: boolean): Promise<boolean> => {
      if (savingRef.current) return false;
      savingRef.current = true;
      setSaving(true);
      setFailText("");
      const outcome = await saveFollow(creatorId, next);
      savingRef.current = false;
      setSaving(false);
      if (outcome === "ok") return true;
      if (outcome === "login") router.push("/login");
      else setFailText(next ? FOLLOW_SAVE_FAILED : UNFOLLOW_SAVE_FAILED);
      return false;
    },
    [creatorId, router],
  );

  /** 지금 저장 중인지 — 렌더 사이에도 바로 맞는 값(같은 틱의 두 번째 누름을 막을 때) */
  const isSaving = useCallback(() => savingRef.current, []);

  return { save, saving, isSaving, failText };
}
