"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, type MouseEvent } from "react";
import s from "./follow-button.module.css";
import { useUnfollowConfirm } from "./unfollow-dialog";
import { useFollowSave } from "./use-follow-save";

// 크리에이터 상세 머리의 버튼 묶음 (design-rules 31절, UX 명세 handle.md 「2026-10-25 재디자인」 상태표).
// 팔로우 안 함 = 「팔로우」 하나(채움). 누르면 팔로우만 저장하고 같은 자리에서 「선물 보내기」(채움) + 「팔로우 중」(테두리)으로 바뀐다 —
// 보내기 화면으로 넘어가지 않는다. 「팔로우 중」은 바로 끊지 않고 팔로우 취소 확인 창(useUnfollowConfirm)을 거친다.
// 로그인 전은 「팔로우」가 로그인 화면으로 가는 링크다. 운영자·크리에이터 자기 페이지에는 그리지 않는다(부르는 쪽이 정한다).
// 보낼 수 있는지는 등록 때 서버·DB 가 다시 판정한다(session-login INV-L9).
// 저장이 끝나기 전에는 바꾸지 않는다 — 저장 전에 「선물 보내기」가 보이면 팔로우가 없는 채로 보내기 화면에 갈 수 있어서다.
// 저장하는 동안은 버튼 글자를 그대로 두고 흐리게(사이트 공통 aria-disabled 모양) 누를 수 없게 한다.
// 저장이 실패하면 버튼 묶음 바로 아래에 한 줄(읽기 프로그램에도 알린다). 저장·실패 처리는 useFollowSave(「팔로우하고 선물 보내기」와 같이 쓴다).

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
  const { save, saving, isSaving, failText } = useFollowSave(creatorId);
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

  const change = async (next: boolean) => {
    if (!(await save(next))) return;
    focusNextRef.current = next ? "gift" : "follow";
    setFollowing(next);
    // 받는 상태·보내기 자리는 서버가 다시 정한다(쉬는 중이 되었으면 버튼 자리가 안내 한 줄로 바뀐다)
    router.refresh();
  };

  const onFollow = () => void change(true);
  const onUnfollow = () => {
    if (isSaving()) return;
    unfollowConfirm.ask(creatorName, () => void change(false));
  };
  // 저장 중에는 보내기 화면으로 넘어가지 않는다(disabled 대신 aria-disabled — 초점을 잃지 않게)
  const blockWhileSaving = (e: MouseEvent<HTMLAnchorElement>) => {
    if (isSaving()) e.preventDefault();
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
          <button className="btn btn--line" type="button" aria-label={`${creatorName}님 팔로우 중`} aria-disabled={busy} aria-busy={busy} onClick={onUnfollow}>
            팔로우 중
          </button>
        </>
      ) : (
        <button ref={followRef} className="btn" type="button" aria-label={`${creatorName}님 팔로우`} aria-disabled={busy} aria-busy={busy} onClick={onFollow}>
          팔로우
        </button>
      )}
      {/* 저장 실패 알림 — 늘 같은 칸(읽기 프로그램이 바뀐 글자를 읽는다). 비었을 때는 자리를 차지하지 않고, 실패하면 버튼 묶음 아래 한 줄로 보인다 */}
      <span className={failText ? s.cardNotice : "sr-only"} role="status">
        {failText}
      </span>
      {unfollowConfirm.dialog}
    </>
  );
}
