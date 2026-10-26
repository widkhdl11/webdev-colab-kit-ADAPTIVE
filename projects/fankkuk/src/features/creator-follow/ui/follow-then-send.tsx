"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useFollowSave } from "./use-follow-save";

// 「팔로우하고 선물 보내기」 — 팔로우한 크리에이터에게만 보낼 수 있어서(session-login INV-L9) 팔로우하지 않은 사람에게 보이는 버튼.
// 누르면 팔로우를 저장하고 그 사람을 미리 고른 선물 보내기로 간다. 손님은 팔로우할 수 없으니 로그인으로 간다.
// 저장에 실패하면 이동하지 않고 알린다(저장·실패 처리는 useFollowSave). 보낼 수 있는지는 등록 때 서버·DB 가 다시 판정한다.

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
  const { save, failText } = useFollowSave(creatorId);
  const label = `${creatorName}님 팔로우하고 선물 보내기`;

  if (!signedIn) {
    return (
      <Link className={className} href="/login" aria-label={`${label} — 로그인 필요`}>
        팔로우하고 선물 보내기
      </Link>
    );
  }

  const go = async () => {
    if (await save(true)) router.push(`/gifts/new?creator=${encodeURIComponent(creatorId)}`);
  };

  return (
    <>
      <button className={className} type="button" aria-label={label} onClick={() => void go()}>
        팔로우하고 선물 보내기
      </button>
      <span className="sr-only" role="status">
        {failText}
      </span>
    </>
  );
}
