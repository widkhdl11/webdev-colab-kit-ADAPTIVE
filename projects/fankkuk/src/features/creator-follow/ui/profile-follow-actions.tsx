"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, type MouseEvent } from "react";
import { saveFollow } from "../api/save-follow";
import s from "./follow-button.module.css";
import { useUnfollowConfirm } from "./unfollow-dialog";

// 크리에이터 상세 머리의 버튼 묶음 (design-rules 31절, UX 명세 handle.md 「2026-10-25 재디자인」 상태표).
// 팔로우 안 함 = 「팔로우」 하나(채움). 누르면 팔로우만 저장하고 같은 자리에서 「선물 보내기」(채움) + 「팔로우 중」(테두리)으로 바뀐다 —
// 보내기 화면으로 넘어가지 않는다. 「팔로우 중」은 바로 끊지 않고 팔로우 취소 확인 창(useUnfollowConfirm)을 거친다.
// 로그인 전은 「팔로우」가 로그인 화면으로 가는 링크다. 보낼 수 있는지는 등록 때 서버·DB 가 다시 판정한다(session-login INV-L9).
// 저장이 끝나기 전에는 바꾸지 않는다 — 저장 전에 「선물 보내기」가 보이면 팔로우가 없는 채로 보내기 화면에 갈 수 있어서다.
// 다른 화면(선물 보내기·함께한 시간)의 「팔로우하고 선물 보내기」(follow-then-send)는 그대로 둔다.

const FAILED_TEXT = "팔로우를 저장하지 못했어요. 잠시 뒤 다시 눌러 주세요.";

function ArrowIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M5 12h14m-5-5 5 5-5 5" />
    </svg>
  );
}

export function ProfileFollowActions({
  creatorId,
  creatorName,
  initialFollowing,
  signedIn,
}: {
  creatorId: string;
  creatorName: string;
  /** 서버가 정한 처음 상태 — true 면 「선물 보내기」 + 「팔로우 중」 */
  initialFollowing: boolean;
  /** false = 로그인 전(「팔로우」가 로그인 링크) */
  signedIn: boolean;
}) {
  const router = useRouter();
  const [following, setFollowing] = useState(initialFollowing);
  const [saving, setSaving] = useState(false);
  const [failed, setFailed] = useState(false);
  const savingRef = useRef(false);
  const unfollowConfirm = useUnfollowConfirm();
  // 상태가 바뀌면 누른 버튼이 사라진다 — 바뀐 뒤 초점을 옮길 자리(팔로우 → 「선물 보내기」, 팔로우 취소 → 「팔로우」)
  const focusNextRef = useRef<"gift" | "follow" | null>(null);
  const giftRef = useRef<HTMLAnchorElement>(null);
  const followRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    const next = focusNextRef.current;
    if (!next) return;
    focusNextRef.current = null;
    (next === "gift" ? giftRef.current : followRef.current)?.focus();
  }, [following]);

  if (!signedIn) {
    return (
      <Link className="btn" href="/login" aria-label={`${creatorName}님 팔로우 — 로그인이 필요해요`}>
        팔로우
      </Link>
    );
  }

  const save = async (next: boolean) => {
    if (savingRef.current) return;
    savingRef.current = true;
    setSaving(true);
    setFailed(false);
    const outcome = await saveFollow(creatorId, next);
    savingRef.current = false;
    setSaving(false);
    if (outcome === "ok") {
      focusNextRef.current = next ? "gift" : "follow";
      setFollowing(next);
      // 받는 상태·보내기 자리는 서버가 다시 정한다(쉬는 중이 되었으면 버튼 자리가 안내 한 줄로 바뀐다)
      router.refresh();
      return;
    }
    if (outcome === "login") router.push("/login");
    else setFailed(true);
  };

  const onFollow = () => void save(true);
  const onUnfollow = () => {
    if (savingRef.current) return;
    unfollowConfirm.ask(creatorName, () => void save(false));
  };
  // 저장 중에는 보내기 화면으로 넘어가지 않는다(disabled 대신 aria-disabled — 초점을 잃지 않게)
  const blockWhileSaving = (e: MouseEvent<HTMLAnchorElement>) => {
    if (saving) e.preventDefault();
  };
  const busy = saving ? true : undefined;

  return (
    <>
      {following ? (
        <>
          <Link
            ref={giftRef}
            className="btn"
            href={`/gifts/new?creator=${encodeURIComponent(creatorId)}`}
            aria-label={`${creatorName}님 선물 보내기`}
            aria-disabled={busy}
            onClick={blockWhileSaving}
          >
            선물 보내기
            <ArrowIcon />
          </Link>
          <button className="btn btn--line" type="button" aria-label={`${creatorName}님 팔로우 중`} aria-disabled={busy} onClick={onUnfollow}>
            팔로우 중
          </button>
        </>
      ) : (
        <button ref={followRef} className="btn" type="button" aria-label={`${creatorName}님 팔로우`} aria-disabled={busy} onClick={onFollow}>
          팔로우
        </button>
      )}
      <span className={s.sr} role="status">
        {failed ? FAILED_TEXT : ""}
      </span>
      {unfollowConfirm.dialog}
    </>
  );
}
