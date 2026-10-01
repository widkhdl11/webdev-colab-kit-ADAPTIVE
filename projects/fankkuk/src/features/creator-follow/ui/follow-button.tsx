"use client";

import { useState } from "react";
import s from "./follow-button.module.css";

// 팔로우 토글. 아직 저장하지 않는다 — 화면 안에서만 바뀐다(팔로우 저장은 DB 가 붙을 때).
// row = 크리에이터 찾기 목록의 작은 버튼, profile = 크리에이터 페이지의 큰 버튼(시안 creators.html · creator.html).
// 상태는 바뀌는 글자(「팔로우」↔「팔로우 중」)로만 알린다 — 시안이 글자를 바꿔 보여 주므로 aria-pressed 를 같이 달지 않는다
// (둘 다 달면 화면 낭독기가 「팔로우 중, 눌림」처럼 상태를 두 번 읽는다).

function Check() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true">
      <path d="m5 12.5 4.5 4.5L19 7" fill="none" stroke="currentColor" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function FollowButton({
  creatorName,
  initialFollowing,
  variant,
}: {
  creatorName: string;
  initialFollowing: boolean;
  variant: "row" | "profile";
}) {
  const [following, setFollowing] = useState(initialFollowing);
  const toggle = () => setFollowing((v) => !v);

  if (variant === "profile") {
    return (
      <button className="btn btn--line" type="button" onClick={toggle}>
        {following ? "팔로우 중" : "팔로우"}
      </button>
    );
  }
  return following ? (
    <button className={`btn btn--sm ${s.on}`} type="button" aria-label={`${creatorName} 팔로우 중`} onClick={toggle}>
      <Check />
      팔로우 중
    </button>
  ) : (
    <button className="btn btn--sm btn--line" type="button" aria-label={`${creatorName} 팔로우`} onClick={toggle}>
      팔로우
    </button>
  );
}
