"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { saveFollow } from "../api/save-follow";

// 「팔로우하고 선물 보내기」 — 팔로우한 크리에이터에게만 보낼 수 있어서(session-login INV-L9) 팔로우하지 않은 사람에게 보이는 버튼.
// 누르면 팔로우를 저장하고 그 사람을 미리 고른 선물 보내기로 간다. 손님은 팔로우할 수 없으니 로그인으로 간다.
// 저장에 실패하면 이동하지 않고 알린다. 보낼 수 있는지는 등록 때 서버·DB 가 다시 판정한다.

export function FollowThenSend({
  creatorId,
  creatorName,
  signedIn,
  className = "btn",
}: {
  creatorId: string;
  creatorName: string;
  signedIn: boolean;
  className?: string;
}) {
  const router = useRouter();
  const [failed, setFailed] = useState(false);
  const savingRef = useRef(false);
  const label = `${creatorName}님 팔로우하고 선물 보내기`;

  if (!signedIn) {
    return (
      <Link className={className} href="/login" aria-label={`${label} — 로그인이 필요해요`}>
        팔로우하고 선물 보내기
      </Link>
    );
  }

  const go = async () => {
    if (savingRef.current) return;
    savingRef.current = true;
    setFailed(false);
    const outcome = await saveFollow(creatorId, true);
    savingRef.current = false;
    if (outcome === "ok") router.push(`/gifts/new?creator=${encodeURIComponent(creatorId)}`);
    else if (outcome === "login") router.push("/login");
    else setFailed(true);
  };

  return (
    <>
      <button className={className} type="button" aria-label={label} onClick={() => void go()}>
        팔로우하고 선물 보내기
      </button>
      <span className="sr-only" role="status">
        {failed ? "팔로우를 저장하지 못했어요. 잠시 뒤 다시 눌러 주세요." : ""}
      </span>
    </>
  );
}
