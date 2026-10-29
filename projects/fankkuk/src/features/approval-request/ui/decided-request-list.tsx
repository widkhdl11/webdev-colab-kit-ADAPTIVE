import Link from "next/link";
import { APPROVAL_DEADLINE_DAYS } from "@/entities/order/config/approval-deadline";
import type { DecidedOutcome, DecidedRequestView } from "@/entities/order/model/decided-request";
import { formatDate, formatMonthDayKo, monthHeadKo, seoulYearMonth } from "@/shared/lib/format/datetime";
import { FaceAvatar } from "@/shared/ui/face-avatar";
import { statusTagClass, type StatusTone } from "@/shared/ui/status-tone";
import a from "./approval-request.module.css";
import q from "./decided-request-list.module.css";

// 승인 내역 — 승인·받지 않기를 마친 요청(design-rules 23-3절, 시안 v37-part2/requests.html). 대기 중인 요청은 크리에이터 처리할 일에서
// 승인 창으로 처리한다(action-center INV-J5·J6 — 승인 대기만 따로 세는 숫자·목록은 없다). 사이드바 「승인 내역」이 #done 으로 온다.
// 맨 위 처리 수 + 결과별 숫자 칸 넷(이 목록을 센 수), 아래 달마다 촘촘한 줄(결과 태그는 줄 오른쪽). 결과 설명은 맨 아래 접기로.

const DECIDED_TAG: Record<DecidedOutcome, { text: string; tone: StatusTone }> = {
  approved: { text: "승인", tone: "success" },
  declined: { text: "거절", tone: "danger" },
  blocked: { text: "차단", tone: "danger" },
  expired: { text: "기한 만료", tone: "warn" },
};
/** 결과별 숫자 칸 순서(시안 .qgrid) */
const OUTCOME_ORDER: readonly DecidedOutcome[] = ["approved", "declined", "expired", "blocked"];

type Month = { key: string; rows: DecidedRequestView[] };

function byMonth(decided: readonly DecidedRequestView[]): Month[] {
  const out: Month[] = [];
  for (const d of decided) {
    const key = seoulYearMonth(d.decidedAt);
    const last = out[out.length - 1];
    if (last && last.key === key) last.rows.push(d);
    else out.push({ key, rows: [d] });
  }
  return out;
}

export function DecidedRequestList({ decided }: { decided: readonly DecidedRequestView[] }) {
  const counts = Object.fromEntries(OUTCOME_ORDER.map((o) => [o, decided.filter((d) => d.outcome === o).length])) as Record<DecidedOutcome, number>;
  const latest = decided.reduce<string | null>((m, d) => (m === null || d.decidedAt > m ? d.decidedAt : m), null);
  const months = byMonth(decided);
  const base = months[0]?.key ?? "";
  let n = 0;
  return (
    <section id="done" className={`v34 ${a.sec} ${q.root}`} aria-labelledby="done-h">
      <div className={q.top}>
        <div className={`card ${q.tot}`}>
          <img className={q.peek} src="/images/home/icon-inspect.webp" alt="" width={96} height={96} />
          <h2 className={q.lab} id="done-h">
            처리한 요청
          </h2>
          <p className="num-big">
            {decided.length}
            <small>건</small>
          </p>
          {latest ? <p className={q.line}>최근 처리일 {formatDate(latest)}</p> : null}
        </div>
        <dl className={q.grid} aria-label="결과별 건수">
          {OUTCOME_ORDER.map((o) => (
            <div key={o}>
              <dt>{DECIDED_TAG[o].text}</dt>
              <dd>{counts[o]}</dd>
            </div>
          ))}
        </dl>
      </div>

      {decided.length === 0 ? <p className={`empty ${q.empty}`}>처리한 요청이 없습니다.</p> : null}

      {months.map((m) => (
        <div key={m.key} className={q.month} data-month="">
          <div className={q.mhead}>
            <h3>{monthHeadKo(m.key, base)}</h3>
            <small>{m.rows.length}건</small>
          </div>
          <ul className={`lrows ${q.rows}`}>
            {m.rows.map((d) => {
              const tag = DECIDED_TAG[d.outcome];
              return (
                <li key={d.orderNo} className={`lrow ${q.row}`} data-row="">
                  <FaceAvatar index={n++} className="face face--sm" />
                  <p className="lrow-txt">
                    <strong>{d.fanNickname}님의 선물</strong>
                    <span className="meta">
                      {d.itemKind} · 상자 {d.boxCount}개 · {d.orderNo}
                    </span>
                  </p>
                  <div className={`lrow-side ${q.side}`}>
                    <span className={statusTagClass(tag.tone)}>{tag.text}</span>
                    <time dateTime={d.decidedAt}>{formatMonthDayKo(d.decidedAt)}</time>
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
      ))}

      {counts.expired > 0 ? (
        <details className={q.fold}>
          <summary>승인 기한 만료</summary>
          <p>{APPROVAL_DEADLINE_DAYS}일 이내에 승인 여부를 선택하지 않아 자동으로 거절 처리되었습니다.</p>
        </details>
      ) : null}
      {counts.blocked > 0 ? (
        <details className={q.fold}>
          <summary>팬 차단</summary>
          <p>
            차단한 팬은 새 선물을 등록할 수 없습니다. 차단 해제는{" "}
            <Link className={a["link-in"]} href="/creator/settings#blocked">
              상세 설정 &gt; 주소와 설정 &gt; 차단한 팬
            </Link>
            에서 할 수 있습니다.
          </p>
        </details>
      ) : null}
    </section>
  );
}

