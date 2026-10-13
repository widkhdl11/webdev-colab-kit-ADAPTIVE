import Link from "next/link";
import s from "./home.module.css";

// 홈 아래 공지 세 줄 — 팬 홈과 크리에이터 홈이 같이 쓴다. 시안: v18 home-fan.html · home-creator.html (.nlist — 제목 왼쪽 · 날짜 오른쪽)

export type HomeNotice = { id: string; title: string; date: string };

/** "2026-09-28" → "09.28" */
const shortDate = (date: string) => date.slice(5).replace("-", ".");

export function HomeNotices({ notices }: { notices: readonly HomeNotice[] }) {
  return (
    <section className={s.notices} aria-labelledby="notice-title">
      <div className={s.secHead}>
        <h2 id="notice-title">공지사항</h2>
      </div>
      {notices.length === 0 ? (
        <p className="empty">아직 공지가 없어요.</p>
      ) : (
        <ul className="nlist">
          {notices.map((n) => (
            <li key={n.id}>
              <Link href="/notices">
                <b>{n.title}</b>
                <span className="t-meta">{shortDate(n.date)}</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
      <div className={s.foot}>
        <Link className="btn btn--line" href="/notices">
          전체 보기
        </Link>
      </div>
    </section>
  );
}
