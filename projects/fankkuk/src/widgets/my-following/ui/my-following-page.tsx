"use client";

import Link from "next/link";
import { useRef, useState } from "react";
import type { CreatorCard } from "@/entities/creator/model/creator-card";
import { approvalTimeText } from "@/entities/creator/ui/approval-time-text";
import { CreatorFace } from "@/entities/creator/ui/creator-face";
import s from "./my-following.module.css";

// 내 정보 — 팔로우한 크리에이터 본문. 시안: docs/design/mockups/site/v4/my-following.html
// 「팔로우 끊기」는 화면 안에서만 줄을 지운다(저장은 DB 가 붙을 때). 다 지우면 빈 화면 안내가 나온다.

export function MyFollowingPanel({ creators }: { creators: readonly CreatorCard[] }) {
  const [list, setList] = useState(creators);
  const headingRef = useRef<HTMLHeadingElement>(null);

  const unfollow = (id: string) => {
    setList((prev) => prev.filter((c) => c.id !== id));
    // 누른 버튼이 사라지므로 포커스를 제목으로 옮긴다 — 키보드 사용자가 페이지 맨 위로 튕기지 않게.
    headingRef.current?.focus();
  };

  return (
    <div>
      <div className={s.head}>
        <h2 ref={headingRef} tabIndex={-1}>
          팔로우한 크리에이터<span className={s.cnt}>{list.length}명</span>
        </h2>
        <Link className="link-arrow" href="/creators">
          크리에이터 더 찾기
        </Link>
      </div>
      {list.length > 0 ? (
        <ul className={s.list}>
          {list.map((c) => (
            <li key={c.id} className={s.row}>
              <CreatorFace tone={c.faceTone} />
              <div>
                <p className={s.who}>
                  <Link href={`/creators/${c.id}`}>{c.name}</Link>
                </p>
                <p className={s.says}>
                  {c.category} · {c.channelTitle} · {approvalTimeText(c.approvalMinutes)}
                </p>
              </div>
              <div className={s.acts}>
                <Link className="btn btn--sm" href={`/gifts/new?creator=${c.id}`} aria-label={`${c.name}님께 선물 보내기`}>
                  선물 보내기
                </Link>
                <button className="btn btn--sm btn--soft" type="button" aria-label={`${c.name} 팔로우 끊기`} onClick={() => unfollow(c.id)}>
                  팔로우 끊기
                </button>
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <div className={s.empty}>
          <span className={s["empty-ico"]} aria-hidden="true">
            <img className="asset" src="/img/illust-empty-follow.png" alt="" width={64} height={64} />
          </span>
          <h3>아직 팔로우한 크리에이터가 없어요</h3>
          <p className="sub">좋아하는 크리에이터를 팔로우하면 여기에 모아 두고, 바로 선물을 보낼 수 있어요.</p>
          <Link className={`btn ${s["empty-cta"]}`} href="/creators">
            나의 크리에이터 찾으러 가기
          </Link>
        </div>
      )}
    </div>
  );
}
