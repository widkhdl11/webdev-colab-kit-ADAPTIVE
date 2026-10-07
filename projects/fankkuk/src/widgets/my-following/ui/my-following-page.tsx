"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import type { CreatorCard } from "@/entities/creator/model/creator-card";
import { approvalTimeText } from "@/entities/creator/ui/approval-time-text";
import { CreatorFace } from "@/entities/creator/ui/creator-face";
import { saveFollow } from "@/features/creator-follow/api/save-follow";
import s from "./my-following.module.css";

// 내 정보 — 팔로우한 크리에이터 본문. 시안: docs/design/mockups/site/v4/my-following.html
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
      <div className={s.head}>
        <h2 ref={headingRef} tabIndex={-1}>
          팔로우한 크리에이터<span className={s.cnt}>{list.length}명</span>
        </h2>
        <Link className="link-arrow" href="/creators">
          크리에이터 더 찾기
        </Link>
      </div>
      <p className="hint" role="status">
        {failedName ? `${failedName}님 팔로우를 끊지 못했어요. 잠시 뒤 다시 눌러 주세요.` : ""}
      </p>
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
                  {[...c.tags, c.channelTitle, approvalTimeText(c.approvalMinutes)].filter(Boolean).join(" · ")}
                </p>
              </div>
              <div className={s.acts}>
                <Link className="btn btn--sm" href={`/gifts/new?creator=${c.id}`} aria-label={`${c.name}님께 선물 보내기`}>
                  선물 보내기
                </Link>
                <button className="btn btn--sm btn--soft" type="button" aria-label={`${c.name} 팔로우 끊기`} onClick={() => void unfollow(c)}>
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
