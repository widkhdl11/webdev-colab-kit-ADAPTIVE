"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, type MouseEvent } from "react";
import { CardButtonLabel } from "@/entities/creator/ui/creator-card-head";
import { saveFollow } from "../api/save-follow";
import type { FollowMode } from "../model/follow-mode";
import { FOLLOW_SAVE_FAILED } from "../model/follow-notice";
import s from "./follow-button.module.css";
import { useUnfollowConfirm } from "./unfollow-dialog";

// 팔로우 토글. 누르면 바로 글자를 바꾸고 서버(/api/follows)에 저장한다 — 저장에 실패하면 원래대로 돌리고 알린다.
// mode: save = 저장하는 버튼(팬·크리에이터) / login = 로그인하지 않은 사람, 누르면 로그인으로 / hidden = 운영자·자기 페이지(팔로우하지 않음).
// row = 크리에이터 찾기 목록의 작은 버튼, profile = 크리에이터 페이지의 큰 버튼(시안 creators.html · creator.html),
// card = 크리에이터 카드 아래 띠(2026-10-18 — 팔로우 안 함은 「팔로우」 하나, 팔로우 중은 「선물 보내기」+「팔로우 취소」(아이콘만), 아이콘 포함).
// 팔로우한 크리에이터 목록도 card 를 쓴다 — 취소가 저장되면 onUnfollowed 로 목록에서 뺀다(실패 처리는 여기 한 곳).
// 「팔로우 중」을 누르면 바로 끊지 않고 확인 창(useUnfollowConfirm)을 띄운다 — 「팔로우 취소」를 눌러야 끊는다(design-rules 12절).
// 상태는 바뀌는 글자(「팔로우」↔「팔로우 중」)로만 알린다 — 시안이 글자를 바꿔 보여 주므로 aria-pressed 를 같이 달지 않는다
// (둘 다 달면 화면 낭독기가 「팔로우 중, 눌림」처럼 상태를 두 번 읽는다).

export type { FollowMode };

export function FollowButton({
  creatorId,
  creatorName,
  initialFollowing,
  variant,
  mode,
  onUnfollowed,
}: {
  creatorId: string;
  creatorName: string;
  initialFollowing: boolean;
  /** row = 목록의 작은 버튼, profile = 크리에이터 페이지 큰 버튼, card = 크리에이터 카드 아래 띠(아이콘 · 팔로우 중이면 「팔로우 취소」+「선물 보내기」) */
  variant: "row" | "profile" | "card";
  mode: FollowMode;
  /** card 만 — 팔로우 취소가 저장된 뒤 부른다(팔로우한 크리에이터 목록에서 카드를 뺄 때) */
  onUnfollowed?: () => void;
}) {
  const router = useRouter();
  const [following, setFollowing] = useState(initialFollowing);
  const [failed, setFailed] = useState(false);
  const savingRef = useRef(false);
  const [saving, setSaving] = useState(false);
  const unfollowConfirm = useUnfollowConfirm();
  // 카드 띠는 상태가 바뀌면 누른 버튼이 사라진다 — 바뀐 뒤 초점을 옮길 자리(팔로우 → 「선물 보내기」, 팔로우 취소 → 「팔로우」)
  const focusNextRef = useRef<"gift" | "follow" | null>(null);
  const giftRef = useRef<HTMLAnchorElement>(null);
  const followRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    const next = focusNextRef.current;
    if (!next) return;
    focusNextRef.current = null;
    (next === "gift" ? giftRef.current : followRef.current)?.focus();
  }, [following]);

  // 상태가 바뀐 순간 글자가 0.2초 동안 1.14배까지 커졌다 돌아온다(design-rules 24절, 시안 v38-home-micro 4번) — 표시만, 처음 그릴 때는 튀지 않는다.
  // 앞 값과 비교해서 고른다(개발 모드에서 효과가 두 번 돌아도 처음 그릴 때 튀지 않게). 카드 띠는 바뀐 뒤 보이는 주 버튼(팔로우 ↔ 선물 보내기)의 글자가 튄다
  const labelRef = useRef<HTMLSpanElement>(null);
  const shownFollowing = useRef(following);
  useEffect(() => {
    if (shownFollowing.current === following) return;
    shownFollowing.current = following;
    const el = variant === "card" ? (following ? giftRef.current : followRef.current)?.querySelector("span") : labelRef.current;
    if (!el) return;
    el.classList.remove(s.pop);
    void el.offsetWidth; // 같은 효과를 이어 다시 걸 때 처음부터 다시 돌게
    el.classList.add(s.pop);
    el.addEventListener("animationend", () => el.classList.remove(s.pop), { once: true });
  }, [following, variant]);

  if (mode === "hidden") return null;
  if (mode === "login" && variant === "card") {
    return (
      <Link className="btn btn--sm btn--line" href="/login" aria-label={`${creatorName} 팔로우 — 로그인이 필요해요`} data-card-btn="main">
        <CardButtonLabel icon="heart-plus">팔로우</CardButtonLabel>
      </Link>
    );
  }
  if (mode === "login") {
    return (
      <Link
        className={
          variant === "profile" ? "btn btn--line" : "btn btn--sm btn--line"
        }
        href="/login"
        aria-label={
          variant === "row"
            ? `${creatorName} 팔로우 — 로그인이 필요해요`
            : undefined
        }
      >
        팔로우
      </Link>
    );
  }

  // 저장 중에는 버튼을 막는다 — 요청 순서가 뒤바뀌어 화면과 저장 값이 어긋나지 않게.
  // 바꿀 값(next)을 직접 받는다 — 확인 창이 열린 사이 앞 저장이 실패해 상태가 되돌아가도, 창의 「팔로우 취소」는 늘 「끊기」만 보낸다
  const save = async (next: boolean) => {
    if (savingRef.current) return;
    savingRef.current = true;
    setSaving(true);
    if (variant === "card") focusNextRef.current = next ? "gift" : "follow";
    setFollowing(next);
    setFailed(false);
    const outcome = await saveFollow(creatorId, next);
    savingRef.current = false;
    setSaving(false);
    // 팔로우가 바뀌면 화면의 「선물 보내기」 자리도 바뀐다(INV-L9 — 팔로우한 사람에게만 보낸다) — 서버가 다시 그리게 한다
    if (outcome === "ok") {
      if (!next) onUnfollowed?.();
      router.refresh();
      return;
    }
    if (variant === "card") focusNextRef.current = next ? "follow" : "gift";
    setFollowing(!next);
    if (outcome === "login") router.push("/login");
    else setFailed(true);
  };

  // 팔로우는 바로, 팔로우 끊기는 확인 창을 거쳐서
  const onPress = () => {
    if (savingRef.current) return; // 저장 중(카드 띠는 aria-disabled 라 눌림 자체는 들어온다)
    if (following) unfollowConfirm.ask(creatorName, () => void save(false));
    else void save(true);
  };

  // 저장 실패 알림 — 라이브 칸 하나. 카드 띠에서는 화면에도 보이는 한 줄(띠 아래쪽, 비었을 때는 자리를 차지하지 않는다),
  // 그 밖은 화면 낭독기에만(버튼 글자가 원래대로 돌아가는 것이 눈에 보이는 알림). 팔로우·팔로우 취소 실패 모두 같은 문구
  const notice = (
    <span className={variant === "card" ? s.cardNotice : "sr-only"} role="status" data-card-notice={variant === "card" ? "" : undefined}>
      {failed ? FOLLOW_SAVE_FAILED : ""}
    </span>
  );

  // 카드 띠 — 팔로우 안 함 = 「팔로우」 하나(주), 팔로우 중 = 「선물 보내기」(주) + 「팔로우 취소」(보조, 늘 아이콘만) — DOM 순서 = 보이는 순서.
  // 바뀌면 그 자리에서 버튼 구성이 바뀌고 초점은 위 focusNextRef 로 옮긴다. 저장하는 동안은 셋 다 누를 수 없다 — disabled 대신 aria-disabled
  // (disabled 버튼은 초점을 받지 못해 옮긴 초점이 사라진다). 버튼 누름은 save 의 savingRef 가, 링크 이동은 blockWhileSaving 이 막는다
  if (variant === "card") {
    const blockWhileSaving = (e: MouseEvent<HTMLAnchorElement>) => {
      if (saving) e.preventDefault();
    };
    return (
      <>
        {following ? (
          <>
            <Link
              ref={giftRef}
              className="btn btn--sm btn--line"
              href={`/gifts/new?creator=${encodeURIComponent(creatorId)}`}
              aria-label={`${creatorName} 선물 보내기`}
              aria-disabled={saving ? true : undefined}
              onClick={blockWhileSaving}
              data-card-btn="main"
            >
              <CardButtonLabel icon="gift">선물 보내기</CardButtonLabel>
            </Link>
            <button className="btn btn--sm btn--line" type="button" aria-label={`${creatorName} 팔로우 취소`} title="팔로우 취소" onClick={onPress} aria-disabled={saving ? true : undefined} data-card-btn="sub">
              <CardButtonLabel icon="heart-off" hideText>
                팔로우 취소
              </CardButtonLabel>
            </button>
          </>
        ) : (
          <button ref={followRef} className="btn btn--sm btn--line" type="button" aria-label={`${creatorName} 팔로우`} onClick={onPress} aria-disabled={saving ? true : undefined} data-card-btn="main">
            <CardButtonLabel icon="heart-plus">팔로우</CardButtonLabel>
          </button>
        )}
        {notice}
        {unfollowConfirm.dialog}
      </>
    );
  }

  if (variant === "profile") {
    return (
      <>
        <button className="btn btn--line" type="button" onClick={onPress} disabled={saving}>
          <span ref={labelRef} className={s.lbl}>
            {following ? "팔로우 중" : "팔로우"}
          </span>
        </button>
        {notice}
        {unfollowConfirm.dialog}
      </>
    );
  }
  return (
    <>
      {following ? (
        // 팔로우 중 = 선 버튼(시안 v11 creators.html·creator.html). 「팔로우」 버튼과 모양은 같고 글자로 상태를 읽는다
        <button
          className="btn btn--sm btn--line"
          type="button"
          aria-label={`${creatorName} 팔로우 중`}
          onClick={onPress}
          disabled={saving}
        >
          <span ref={labelRef} className={s.lbl}>
            팔로우 중
          </span>
        </button>
      ) : (
        <button
          className="btn btn--sm btn--line"
          type="button"
          aria-label={`${creatorName} 팔로우`}
          onClick={onPress}
          disabled={saving}
        >
          <span ref={labelRef} className={s.lbl}>
            팔로우
          </span>
        </button>
      )}
      {notice}
      {unfollowConfirm.dialog}
    </>
  );
}
