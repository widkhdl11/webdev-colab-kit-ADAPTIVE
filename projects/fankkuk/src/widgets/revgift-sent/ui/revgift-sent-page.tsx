import Link from "next/link";
import type { SentRevgift } from "@/entities/revgift/model/revgift-rows";
import { sentStateTag } from "@/entities/revgift/ui/received-status";
import { formatDateTime } from "@/shared/lib/format/datetime";
import { FaceAvatar } from "@/shared/ui/face-avatar";
import s from "./revgift-sent.module.css";

// 보낸 역조공(크리에이터). 시안: docs/design/mockups/site/v4/creator-revgift-list.html
// 한 줄에 보이는 것은 팬 아이디·닉네임·주문번호·상태 배지(셋 중 하나)뿐이다(reverse-gift INV-R8).
// 묶음은 보낸 시각이 같은 몫끼리 — 한 번에 등록한 몫은 같은 시각으로 기록된다.

type Batch = { sentAt: string; shares: SentRevgift[] };

function toBatches(rows: readonly SentRevgift[]): Batch[] {
  const map = new Map<string, SentRevgift[]>();
  for (const r of rows) {
    const list = map.get(r.sentAt);
    if (list) list.push(r);
    else map.set(r.sentAt, [r]);
  }
  return [...map.entries()].map(([sentAt, shares]) => ({ sentAt, shares })).sort((a, b) => Date.parse(b.sentAt) - Date.parse(a.sentAt));
}

function batchSummary(shares: readonly SentRevgift[]): string {
  const n = (state: SentRevgift["state"]) => shares.filter((x) => x.state === state).length;
  const parts = [
    n("accepted") ? `받은 팬 ${n("accepted")}명` : "",
    n("waiting") ? `기다리는 중 ${n("waiting")}명` : "",
    n("not_received") ? `받지 않은 팬 ${n("not_received")}명` : "",
  ].filter(Boolean);
  return n("not_received") ? `${parts.join(" · ")} (받지 않은 상자 요금은 환불돼요)` : parts.join(" · ");
}

export function RevgiftSentPage({ rows, paid }: { rows: readonly SentRevgift[]; paid: boolean }) {
  const batches = toBatches(rows);
  return (
    <main id="main">
      <div className="container">
        <div className={s["top-row"]}>
          <div className="page-title">
            <h1 className="page-h">보낸 역조공</h1>
            <p>팬에게 보낸 선물을 한 번에 보낸 묶음별로 모아 봤어요.</p>
          </div>
          <Link className="btn" href="/creator/revgifts/new">
            역조공 보내기
          </Link>
        </div>
        {paid ? (
          <p className={s.paid} role="status">
            <strong>결제가 끝났어요.</strong>
            <span>팬마다 상자를 따로 포장하고, 상자 겉에 그 팬의 주문번호를 적어 팬꾹 사무실로 보내 주세요.</span>
          </p>
        ) : null}
        <div className={s["rule-line"]}>
          <img className={`asset ${s.ico}`} src="/img/icon-address-lock.png" alt="" aria-hidden="true" width={56} height={56} />
          <p>
            <strong>팬의 주소와 실명은 보이지 않아요.</strong>
            <span>팬이 직접 입력하고, 팬꾹만 송장을 뽑을 때 열어요.</span>
          </p>
        </div>
        {batches.length === 0 ? (
          <div className={s.empty}>
            <h2>아직 보낸 역조공이 없어요</h2>
            <p className="sub">나를 팔로우한 팬의 아이디를 알면 선물을 보낼 수 있어요.</p>
          </div>
        ) : (
          batches.map((b, bi) => (
            <section key={b.sentAt} className={s.batch} aria-labelledby={`rv-batch-${bi}`}>
              <div className={s["batch-head"]}>
                <h2 id={`rv-batch-${bi}`}>{formatDateTime(b.sentAt)} 보낸 역조공</h2>
                <p className={s.facts}>팬 {b.shares.length}명</p>
              </div>
              <ul className={s.shares}>
                {b.shares.map((x, i) => {
                  const tag = sentStateTag(x.state);
                  return (
                    <li key={x.orderNo} className={s.share}>
                      <FaceAvatar index={i} />
                      <div>
                        <p className={s.nick}>{x.fanNickname}</p>
                        <p className={s.says}>
                          @{x.fanLoginId} · 주문번호 {x.orderNo}
                        </p>
                      </div>
                      <span className={`tag ${tag.brand ? "tag--brand" : ""} ${s.tag}`}>{tag.tag}</span>
                    </li>
                  );
                })}
              </ul>
              <p className={s["batch-sum"]}>{batchSummary(b.shares)}</p>
            </section>
          ))
        )}
        <div className={s["foot-note"]}>
          <strong>알아 두세요</strong>
          <ul>
            <li>「받지 않았어요」는 팬이 받지 않기를 누른 경우와 7일이 지난 경우를 구분하지 않아요.</li>
            <li>받지 않은 상자는 보낸 사무실 쪽에서 돌려보내고, 그 상자 요금만 환불돼요.</li>
            <li>한 팬이 받지 않아도 같은 묶음의 다른 팬 선물은 그대로 가요.</li>
          </ul>
        </div>
      </div>
      <div className="page-end" />
    </main>
  );
}
