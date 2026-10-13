"use client";

import Link from "next/link";
import { creatorPagePath } from "@/entities/creator/model/creator-handle";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import type { CreatorCard } from "@/entities/creator/model/creator-card";
import { approvalTimeText } from "@/entities/creator/ui/approval-time-text";
import { CreatorFace } from "@/entities/creator/ui/creator-face";
import { CreatorTag } from "@/entities/creator/ui/creator-tag";
import { saveFollow } from "@/features/creator-follow/api/save-follow";
import { FOLLOWING_NICKNAME_NOTICE } from "@/features/creator-follow/model/follow-notice";
import s from "./my-following.module.css";

// 팔로우한 크리에이터 본문. 시안: docs/design/mockups/site/v18/my-following.html (넓은 틀 + 페이지 머리, 팔로우 카드 격자 — 최소 300, 폭에 따라 칸 수가 저절로)
// 시안은 「팔로우 끊기」를 ⋯ 메뉴 안에 두지만, 버튼 하나로 바로 끊는 지금 동작을 그대로 두고 글자 버튼으로만 바꿨다(기능·접근성 그대로).
// 「팔로우 끊기」는 줄을 바로 지우고 저장한다. 저장에 실패하면 줄을 제자리에 돌려놓고 알린다. 다 지우면 빈 화면 안내가 나온다.

export function MyFollowingPanel({ creators }: { creators: readonly CreatorCard[] }) {
  const router = useRouter();
  const [list, setList] = useState(creators);
  const [failedName, setFailedName] = useState<string | null>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);

  const unfollow = async (target: CreatorCard) => {
    setFailedName(null);
    setList((prev) => prev.filter((c) => c.id !== target.id));
    // 누른 버튼이 사라지므로 포커스를 제목으로 옮긴다 — 키보드 사용자가 페이지 맨 위로 튕기지 않게.
    headingRef.current?.focus();
    const outcome = await saveFollow(target.id, false);
    if (outcome === "ok") return;
    // 원래 순서대로 돌려놓는다(처음 받은 목록 순서 기준)
    setList((prev) => creators.filter((c) => c.id === target.id || prev.some((p) => p.id === c.id)));
    if (outcome === "login") router.push("/login");
    else setFailedName(target.name);
  };

  return (
    <div>
      <header className="page-head">
        <div className="ph-row">
          <h1 className="ph-title" ref={headingRef} tabIndex={-1}>
            팔로우한 크리에이터
            <span className="ph-count">{list.length}</span>
          </h1>
          <Link className="btn btn--sm" href="/creators">
            크리에이터 더 찾기
          </Link>
        </div>
        <p className="ph-desc">{FOLLOWING_NICKNAME_NOTICE}</p>
      </header>
      <p className={`err ${s.msg}`} role="status">
        {failedName ? `${failedName}님 팔로우를 끊지 못했어요. 잠시 뒤 다시 눌러 주세요.` : ""}
      </p>
      {list.length > 0 ? (
        <ul className={s.grid}>
          {list.map((c) => (
            <li key={c.id} className={s.fc}>
              <div className={s.top}>
                <CreatorFace tone={c.faceTone} className={s.face} />
                <div className={s.who}>
                  <p className={s.nameLine}>
                    <Link className={s.name} href={creatorPagePath(c)}>
                      {c.name}
                    </Link>
                  </p>
                  {c.tags.length > 0 ? (
                    <p className={s.tags}>
                      {c.tags.map((t) => (
                        <CreatorTag key={t} name={t} />
                      ))}
                    </p>
                  ) : null}
                </div>
              </div>
              <p className={s.info}>
                {c.channelTitle ? <span className={s.ch}>{c.channelTitle}</span> : null}
                <span className={s.time}>
                  <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
                    <circle cx="12" cy="12" r="10" />
                    <path d="M12 6v6l4 2" />
                  </svg>
                  {approvalTimeText(c.approvalMinutes)}
                </span>
              </p>
              <div className={s.acts}>
                <Link className="btn btn--sm" href={`/gifts/new?creator=${c.id}`} aria-label={`${c.name}님께 선물 보내기`}>
                  선물 보내기
                </Link>
                <button className="btn btn--sm btn--text" type="button" aria-label={`${c.name} 팔로우 끊기`} onClick={() => void unfollow(c)}>
                  팔로우 끊기
                </button>
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <div className={`card empty ${s.empty}`}>
          <img src="/img/illust-empty-follow.png" alt="" aria-hidden="true" width={96} height={96} />
          <h2 className="t-card">아직 팔로우한 크리에이터가 없어요</h2>
          <p className="t-desc">좋아하는 크리에이터를 팔로우하면 여기에 모아 두고, 바로 선물을 보낼 수 있어요.</p>
          <Link className="btn" href="/creators">
            나의 크리에이터 찾으러 가기
          </Link>
        </div>
      )}
    </div>
  );
}
