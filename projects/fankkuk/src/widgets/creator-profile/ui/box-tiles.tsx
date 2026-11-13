"use client";

import Link from "next/link";
import { useState } from "react";
import { BottomSheet } from "@/shared/ui/bottom-sheet";
import s from "./creator-profile.module.css";

// 진행 중인 선물함 — 작은 타일(그림 칸 + 이름 + 내 신청 뱃지) 줄. 누르면 상세 창(휴대폰은 아래에서 올라오는 시트 — 사이트 공용 BottomSheet).
// 창 = 그림·이름 → 내 상태 → 설명(있을 때) → 버튼 하나. 닫기 ✕·Esc·바깥 누르기. 신청 입력과 판정은 신청 화면(/gift-boxes/[id])과 서버가 한다.
// 뱃지·버튼은 서버 쪽에서 entities 의 boxEntryOf 로 정해 넘긴다 — 여기서는 그리기만 한다.

export type BoxTileView = { id: string; name: string; description: string | null; badge: string | null; actionLabel: string; href: string };

const BOX_PICTURE = "/images/home/gift-box-small-clear.png";

export function BoxTiles({ boxes }: { boxes: readonly BoxTileView[] }) {
  const [openId, setOpenId] = useState<string | null>(null);
  const current = boxes.find((b) => b.id === openId) ?? null;
  return (
    <>
      <ul className={s.gtiles}>
        {boxes.map((b) => (
          <li key={b.id}>
            <button type="button" className={s.gtile} aria-haspopup="dialog" onClick={() => setOpenId(b.id)}>
              <span className={s.gtpic}>
                <img src={BOX_PICTURE} alt="" width={428} height={339} />
              </span>
              <span className={s.gtname}>{b.name}</span>
              {b.badge ? <span className={s.gstate}>{b.badge}</span> : null}
            </button>
          </li>
        ))}
      </ul>
      <BottomSheet
        open={current !== null}
        onClose={() => setOpenId(null)}
        title={
          <span className={s.dlgTitle}>
            <span className={s.dpic} aria-hidden="true">
              <img src={BOX_PICTURE} alt="" width={428} height={339} />
            </span>
            <span className={s.dname}>{current?.name}</span>
          </span>
        }
        meta={current?.badge ? <span className={s.gstate}>{current.badge}</span> : undefined}
      >
        {current ? (
          <div className={s.dlgBody}>
            {current.description ? <p className={s.ddesc}>{current.description}</p> : null}
            <Link className={`btn ${s.dlgAct}`} href={current.href} aria-label={`${current.name} ${current.actionLabel}`}>
              {current.actionLabel}
            </Link>
          </div>
        ) : null}
      </BottomSheet>
    </>
  );
}
