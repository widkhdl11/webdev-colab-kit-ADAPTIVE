import { statusTagClass } from "@/shared/ui/status-tone";
import Link from "next/link";
import type { ReactNode } from "react";
import { canReportNotMine, isMissing, isWaybillEditable, type ShareBox } from "@/entities/parcel/model/box-rows";
import type { SentRevgift } from "@/entities/revgift/model/revgift-rows";
import { countBatchStates, summarizeSent, toSentBatches, type SentSummary } from "@/entities/revgift/model/sent-batches";
import { sentStateTag } from "@/entities/revgift/ui/received-status";
import { shareAddressCode, shareFinderBoxes } from "@/features/box-waybill/model/box-targets";
import { FindMyBox } from "@/features/box-waybill/ui/find-my-box";
import { NotMineButton } from "@/features/box-waybill/ui/not-mine-button";
import { ReceivingAddress } from "@/features/box-waybill/ui/receiving-address";
import { WaybillEditor } from "@/features/box-waybill/ui/waybill-editor";
import { formatDateTime } from "@/shared/lib/format/datetime";
import { FaceAvatar } from "@/shared/ui/face-avatar";
import s from "./revgift-sent.module.css";

// 보낸 역조공(크리에이터). 시안: docs/design/mockups/site/v21-addendum3/cre-revgift-sent.html(design-rules 12절 「진행 상태」) —
// 묶음마다 팬별 「지금 상태」 한 줄 목록(위아래, 0000절). 한 줄에 보이는 것은 팬 닉네임·주문번호·상태 배지(셋 중 하나)뿐이다 —
// 팬 로그인 아이디도 싣지 않는다(reverse-gift INV-R8). 팬마다 따로 보는 화면이 없어 줄은 링크가 아니다.
// 송장번호는 묶음 아래 「송장번호 적기(선택)」 접힌 칸에 팬마다 한 줄(시안 .fold·.inv-row). 배송 조회를 보고 싶을 때만 넣는 선택 칸이다
// (inbound-address-code INV-C7). 입고 전엔 넣고 고치고, 입고되면 「입고됨」으로 잠긴다(design-rules 8-1).
// 받는 주소·「제가 보낸 게 아니에요」는 그 팬 줄 바로 아래 — 보낼 상자가 남았을 때·입고 뒤 출고 전에만 생긴다(필요할 때만, 0000절).
// 묶음 나누기와 상태 세기는 entities/revgift/model/sent-batches.ts — 여기서는 문구만 조립한다.
// 받는 주소(INV-R14, inbound-address-code INV-C2·C3): 팬(몫)마다 사무실 주소 + 그 몫의 6자리. 묶음에 officeAddress 가 있을 때
// (결제가 끝났고 보낼 상자가 남은 묶음) + my_share_boxes 가 그 몫의 6자리를 줄 때(보낸 크리에이터 본인 · 유효할 때)만 그린다.
// 6자리 빠진 기본 사무실 주소는 그리지 않는다. 팬의 받기를 기다리지 않는다 — 받기는 출고 전에만 있으면 된다.
// 받는 주소 없이 보낸 상자는 「받는 주소 없이 보냈어요」(INV-C4 ②), 입고 뒤 출고 전에는 「제가 보낸 게 아니에요」(INV-C8).
// 두 단(design-rules 00절 「본문 틀」, 시안 v22-width/cre-revgift-sent-ab.html): 주 내용 880 + 오른쪽 요약 칸 288, 간격 32.
// 본문 영역 1000 이상에서 두 단·칸은 스크롤을 따라오고, 좁으면 한 단에 칸이 위. 칸에는 이 화면에 이미 있는 값만 —
// 몫 목록을 센 숫자(summarizeSent), 머리에서 옮긴 「역조공 보내기」, 아래 「알아 두세요」에 있던 송장번호 안내 한 줄.

function Check() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true">
      <path d="m5 12.5 4.5 4.5L19 7" fill="none" stroke="currentColor" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

// 받지 않은 몫(거절·기한 지남)은 보낼 상자가 아니라 송장번호 칸을 열지 않는다
function waybillShown(box: ShareBox | undefined, shareState: SentRevgift["state"]): box is ShareBox {
  if (!box) return false;
  return !isWaybillEditable(box.state) || shareState !== "not_received";
}

/** 몫 하나에 대해 이 화면이 쓰는 값 — 줄·안내 판·접힌 칸이 같은 값을 보도록 몫마다 한 번만 센다 */
type ShareView = {
  x: SentRevgift;
  box: ShareBox | undefined;
  /** 받는 주소 6자리(그릴 때만) */
  addressCode: string | null;
  /** 접힌 칸에 줄을 둘 상자(없으면 null) */
  waybillBox: ShareBox | null;
};

function toShareViews(shares: readonly SentRevgift[], boxByOrder: ReadonlyMap<string, ShareBox>, officeAddress: string | null): ShareView[] {
  return shares.map((x) => {
    const box = boxByOrder.get(x.orderNo);
    return { x, box, addressCode: shareAddressCode(box, officeAddress, x.state), waybillBox: waybillShown(box, x.state) ? box : null };
  });
}

function ShareWaybill({ box, fanNickname }: { box: ShareBox; fanNickname: string }) {
  if (isWaybillEditable(box.state)) {
    return (
      <WaybillEditor
        target={{ kind: "share", id: box.shareId }}
        boxName={`${fanNickname}님 상자`}
        initial={box.waybillNo}
        layout="share"
        hint="선택이에요. 넣으면 배송 조회로 팬꾹까지 오는 길을 보여 드려요."
      />
    );
  }
  if (isMissing(box.state)) {
    // 결제 + 30일이 지나도 오지 않아 닫힌 상자(office-workflow INV-W10) — 입고되지 않았다. 문구는 팬 선물 진행 화면과 같은 말
    return (
      <p className={`tags ${s["inv-tags"]}`}>
        <span className={statusTagClass("warn")}>도착하지 않음</span>
        <span className="t-meta">결제하고 30일이 지나도 도착하지 않아 이 상자는 닫혔어요</span>
      </p>
    );
  }
  // 남은 것은 입고 뒤(hasArrived) 상태뿐이다
  return (
    <p className={`tags ${s["inv-tags"]}`}>
      <span className={statusTagClass("success")}>
        <Check />
        입고됨
      </span>
      <span className="t-meta">사무실에 도착해 확인했어요</span>
    </p>
  );
}

/** 묶음 아래 「송장번호 적기(선택)」 — 평소엔 접혀 있다(design-rules 0000절·12절). 칸에 넣을 팬이 없으면 그리지 않는다 */
function WaybillFold({ views }: { views: readonly ShareView[] }) {
  const items = views.flatMap(({ x, waybillBox }) => (waybillBox ? [{ x, box: waybillBox }] : []));
  if (items.length === 0) return null;
  return (
    <details className={s.fold}>
      <summary>
        송장번호 적기 (선택)
        <svg className={s.foldChev} viewBox="0 0 24 24" aria-hidden="true" focusable="false">
          <path d="m6 9 6 6 6-6" />
        </svg>
      </summary>
      <div className={s.foldBody}>
        <p className="t-meta">상자가 사무실에 도착하기 전까지만 고칠 수 있고, 입고되면 「입고됨」으로 바뀌고 잠겨요.</p>
        {items.map(({ x, box }) => (
          <div key={x.orderNo} className={s.invRow}>
            <p className={s.invName}>{x.fanNickname}님</p>
            <ShareWaybill box={box} fanNickname={x.fanNickname} />
          </div>
        ))}
      </div>
    </details>
  );
}

function batchSummary(shares: readonly SentRevgift[]): string {
  const n = countBatchStates(shares);
  const parts = [n.accepted ? `받은 팬 ${n.accepted}명` : "", n.waiting ? `기다리는 중 ${n.waiting}명` : "", n.not_received ? `받지 않은 팬 ${n.not_received}명` : ""].filter(
    Boolean,
  );
  return n.not_received ? `${parts.join(" · ")} (받지 않은 상자 요금은 환불돼요)` : parts.join(" · ");
}

const STATE_ORDER: readonly SentRevgift["state"][] = ["accepted", "waiting", "not_received"];

function SummarySide({ summary }: { summary: SentSummary }) {
  return (
    <aside className={s.side} aria-label="보낸 역조공 요약">
      <div className={`card ${s.sideCard}`}>
        <h2 className="t-card">요약</h2>
        {/* 보낸 것이 없으면 0 줄을 늘어놓지 않는다 — 빈 상태는 본문이 알린다 */}
        {summary.shares === 0 ? null : (
          <dl className={s.sum}>
            <div>
              <dt>보낸 묶음</dt>
              <dd>{summary.batches}묶음</dd>
            </div>
            <div>
              <dt>보낸 선물</dt>
              <dd>{summary.shares}개</dd>
            </div>
            {STATE_ORDER.map((st) => (
              <div key={st}>
                <dt>{sentStateTag(st).tag}</dt>
                <dd>{summary.states[st]}개</dd>
              </div>
            ))}
          </dl>
        )}
        <Link className="btn" href="/creator/revgifts/new">
          역조공 보내기
        </Link>
      </div>
      <p className={`t-meta ${s.sideNote}`}>송장번호는 배송 조회를 보고 싶을 때만 넣어요.</p>
    </aside>
  );
}

function AddressGuide({ headId }: { headId: string }) {
  return (
    <div className={`card card--soft ${s.guide}`} role="group" aria-labelledby={headId}>
      <p className="t-card" id={headId}>
        팬마다 받는 주소가 달라요
      </p>
      <p className={s["body-gap"]}>
        팬 한 명마다 상자를 따로 포장하고, 아래 팬마다 나온 받는 주소를 끝 6자리까지 그대로 써서 보내 주세요. 팬이 받기를 누를 때까지 기다리지 않고 보내셔도 돼요. 받지 않은 팬의
        상자는 돌려보내고 그 상자 요금은 환불돼요.
      </p>
    </div>
  );
}

export function RevgiftSentPage({
  rows,
  boxes,
  paid,
  officeAddress,
  tabs,
}: {
  rows: readonly SentRevgift[];
  boxes: readonly ShareBox[];
  paid: boolean;
  officeAddress: string;
  /** 페이지 머리 바로 아래에 둘 화면 간 탭(design-rules 11절). 머리는 늘 본문 맨 앞이다(00절) */
  tabs?: ReactNode;
}) {
  const batches = toSentBatches(rows, officeAddress);
  const boxByOrder = new Map(boxes.map((b) => [b.orderNo, b]));
  // 받는 주소 없이 보냈어요(INV-C4 ②) — 고를 수 있는 몫의 판정은 features/box-waybill/model/box-targets.ts
  const finderBoxes = shareFinderBoxes(rows, boxes);
  return (
    <div className={s.split}>
      <div className={s.mainc}>
        <header className="page-head">
          <div className="ph-row">
            <h1 className="ph-title">
              보낸 역조공<span className="ph-count">{batches.length}</span>
            </h1>
          </div>
          <p className="ph-desc">팬에게 보낸 선물을 한 번에 보낸 묶음별로 모아 봤어요.</p>
        </header>
        {tabs}
        {paid ? (
          <p className={s.paid} role="status">
            <strong>결제가 끝났어요.</strong> 팬마다 상자를 따로 포장하고, 아래 팬마다 나온 받는 주소로 보내 주세요.
          </p>
        ) : null}
        {/* 이름 없는 section — 화면 읽기 랜드마크가 되지 않고, 구간 사이 간격(64·휴대폰 48)만 공통 규칙을 따른다 */}
        <section className="card card--soft">
          <img className={`asset ${s.lock}`} src="/img/icon-address-lock.png" alt="" aria-hidden="true" width={56} height={56} />
          <p>
            <strong className={`t-card ${s["privacy-t"]}`}>팬의 주소와 실명은 보이지 않아요.</strong>
            <span className={`${s["privacy-t"]} ${s["body-gap"]}`}>팬이 직접 입력하고, 팬꾹만 송장을 뽑을 때 열어요.</span>
          </p>
        </section>
        {batches.length === 0 ? (
          <section className="empty">
            <h2 className="t-card">아직 보낸 역조공이 없어요</h2>
            <p className="t-meta">나를 팔로우한 팬을 골라 선물을 보낼 수 있어요.</p>
          </section>
        ) : (
          batches.map((b, bi) => {
            const views = toShareViews(b.shares, boxByOrder, b.officeAddress);
            return (
            <section key={b.sentAt} aria-labelledby={`rv-batch-${bi}`}>
              <h2 className={`t-card ${s["batch-h"]}`} id={`rv-batch-${bi}`}>
                {formatDateTime(b.sentAt)} 보낸 역조공
              </h2>
              <p className={`t-meta ${s.facts}`}>
                {/* 한 번 보낸 것 안에서는 같은 팬이 두 번 없다(DB 유일 send_id·fan_id) — 묶음 줄은 「팬 N명」이 맞다 */}
                팬 {b.shares.length}명 · {batchSummary(b.shares)}
              </p>
              {b.officeAddress && views.some((v) => v.addressCode) ? <AddressGuide headId={`rv-addr-${bi}`} /> : null}
              <ul className={s.rows} aria-label={`${formatDateTime(b.sentAt)} 묶음 팬별 지금 상태`}>
                {views.map(({ x, box, addressCode }, i) => {
                  const tag = sentStateTag(x.state);
                  return (
                    <li key={x.orderNo}>
                      <div className={s.row}>
                        <FaceAvatar index={i} className={s.av} />
                        <div className={s.rt}>
                          <p className={s.name}>{x.fanNickname}님</p>
                          <p className={`t-meta ${s["order-no"]}`}>주문번호 {x.orderNo}</p>
                        </div>
                        <span className={statusTagClass(tag.tone)}>{tag.tag}</span>
                      </div>
                      {b.officeAddress && addressCode ? (
                        <div className={s.rowMore}>
                          <ReceivingAddress officeAddress={b.officeAddress} code={addressCode} boxName={`${x.fanNickname}님 상자`} multiple={b.shares.length > 1} />
                        </div>
                      ) : null}
                      {box && canReportNotMine(box.state) ? (
                        <div className={s.rowMore}>
                          <NotMineButton target={{ kind: "share", id: box.shareId }} boxName={`${x.fanNickname}님 상자`} reported={box.reportedNotMine} />
                        </div>
                      ) : null}
                    </li>
                  );
                })}
              </ul>
              <WaybillFold views={views} />
            </section>
            );
          })
        )}
        {finderBoxes.length > 0 ? (
          <section className="card" aria-labelledby="rv-find">
            <h2 className="t-card" id="rv-find">
              받는 주소 없이 보냈어요
            </h2>
            <p className={s["find-text"]}>
              받는 주소 끝 6자리를 빼고 보낸 상자는 사무실에서 바로 찾지 못해요. 송장번호·택배사·보낸 사람 이름 첫 글자가 모두 맞으면 그 팬의 상자로 이어져요. 하루에 다섯 번까지 찾을
              수 있어요.
            </p>
            <div className={s["find-box"]}>
              <FindMyBox boxes={finderBoxes} />
            </div>
          </section>
        ) : null}
        <section className="card">
          <strong className="t-card">알아 두세요</strong>
          <ul className={s.notes}>
            <li>「받지 않았어요」는 팬이 받지 않기를 누른 경우와 7일이 지난 경우를 구분하지 않아요.</li>
            <li>받지 않은 상자는 보낸 사무실 쪽에서 돌려보내고, 그 상자 요금만 환불돼요.</li>
            <li>한 팬이 받지 않아도 같은 묶음의 다른 팬 선물은 그대로 가요.</li>
            <li>상자를 더 보내려면 새로 보내기를 해 주세요. 상자마다 받는 주소가 달라요.</li>
          </ul>
        </section>
      </div>
      {/* 칸은 글 순서상 주 내용 뒤(제목이 먼저 읽히게), 보이는 자리는 CSS grid-area 가 정한다 */}
      <SummarySide summary={summarizeSent(rows)} />
    </div>
  );
}
