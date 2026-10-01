import Link from "next/link";
import type { FanGiftView } from "@/entities/order/model/fan-view";
import { fanBadge, fanHeadline, fanProgress } from "@/entities/order/ui/fan-stage-copy";
import { formatDateTime } from "@/shared/lib/format/datetime";
import { AppHeader } from "@/shared/ui/app-header";
import s from "@/shared/ui/screen.module.css";
import l from "./gift-list.module.css";

// 팬 — 내 선물 목록. 카드 하나를 누르면 상태 화면으로 간다.
export function GiftListPage({ gifts }: { gifts: readonly FanGiftView[] }) {
  return (
    <div className={`${s.root} ${s.page}`}>
      <AppHeader link={{ href: "/gifts/new", label: "선물 등록" }} />
      <main className={s.main}>
        <p className={s.eyebrow}>내 선물</p>
        <h1>보낸 선물이 지금 어디 있는지 확인하세요</h1>
        {gifts.length === 0 ? (
          <div className={`${s["card-tint"]} ${s.section}`}>
            <p>아직 등록한 선물이 없어요.</p>
            <Link className={`${s.button} ${l.cta}`} href="/gifts/new">
              선물 등록하기
            </Link>
          </div>
        ) : (
          <ul className={`${s.list} ${s.section}`} role="list">
            {gifts.map((g) => {
              const badge = fanBadge(g);
              const progress = fanProgress(g);
              return (
                <li key={g.orderNo}>
                  <Link className={l.item} href={`/gifts/${g.orderNo}`}>
                    <span className={l.head}>
                      <span className={badge.tone === "brand" ? s.pill : s["pill-plain"]}>{badge.text}</span>
                      <span className={s.muted}>{g.orderNo}</span>
                    </span>
                    <span className={l.title}>
                      {g.creatorName}에게 · {g.itemKind}
                    </span>
                    <span className={s.muted}>{fanHeadline(g)}</span>
                    {g.outcome === "in_progress" ? (
                      <span className={l.dots} aria-label={`${progress.total}단계 중 ${progress.done}단계 완료`} role="img">
                        {g.steps.map((st) => (
                          <span key={st.key} className={l[`dot-${st.state}`]} />
                        ))}
                      </span>
                    ) : null}
                    <span className={l.date}>{formatDateTime(g.registeredAt)} 등록</span>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </main>
    </div>
  );
}
