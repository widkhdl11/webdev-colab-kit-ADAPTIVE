"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { saveFollow } from "../api/save-follow";
import type { FollowMode } from "../model/follow-mode";
import s from "./follow-button.module.css";

// 팔로우 토글. 누르면 바로 글자를 바꾸고 서버(/api/follows)에 저장한다 — 저장에 실패하면 원래대로 돌리고 알린다.
// mode: save = 저장하는 버튼(팬·크리에이터) / login = 로그인하지 않은 사람, 누르면 로그인으로 / hidden = 운영자·자기 페이지(팔로우하지 않음).
// row = 크리에이터 찾기 목록의 작은 버튼, profile = 크리에이터 페이지의 큰 버튼(시안 creators.html · creator.html).
// 상태는 바뀌는 글자(「팔로우」↔「팔로우 중」)로만 알린다 — 시안이 글자를 바꿔 보여 주므로 aria-pressed 를 같이 달지 않는다
// (둘 다 달면 화면 낭독기가 「팔로우 중, 눌림」처럼 상태를 두 번 읽는다).

export type { FollowMode };

export function FollowButton({
  creatorId,
  creatorName,
  initialFollowing,
  variant,
  mode,
}: {
  creatorId: string;
  creatorName: string;
  initialFollowing: boolean;
  variant: "row" | "profile";
  mode: FollowMode;
}) {
  const router = useRouter();
  const [following, setFollowing] = useState(initialFollowing);
  const [failed, setFailed] = useState(false);
  const savingRef = useRef(false);

  if (mode === "hidden") return null;
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

  // 저장 중에 다시 누르면 무시한다 — 요청 순서가 뒤바뀌어 화면과 저장 값이 어긋나지 않게
  const toggle = async () => {
    if (savingRef.current) return;
    savingRef.current = true;
    const next = !following;
    setFollowing(next);
    setFailed(false);
    const outcome = await saveFollow(creatorId, next);
    savingRef.current = false;
    // 팔로우가 바뀌면 화면의 「선물 보내기」 자리도 바뀐다(INV-L9 — 팔로우한 사람에게만 보낸다) — 서버가 다시 그리게 한다
    if (outcome === "ok") {
      router.refresh();
      return;
    }
    setFollowing(!next);
    if (outcome === "login") router.push("/login");
    else setFailed(true);
  };

  const notice = (
    <span className={s.sr} role="status">
      {failed ? "팔로우를 저장하지 못했어요. 잠시 뒤 다시 눌러 주세요." : ""}
    </span>
  );

  if (variant === "profile") {
    return (
      <>
        <button className="btn btn--line" type="button" onClick={toggle}>
          {following ? "팔로우 중" : "팔로우"}
        </button>
        {notice}
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
          onClick={toggle}
        >
          팔로우 중
        </button>
      ) : (
        <button
          className="btn btn--sm btn--line"
          type="button"
          aria-label={`${creatorName} 팔로우`}
          onClick={toggle}
        >
          팔로우
        </button>
      )}
      {notice}
    </>
  );
}
