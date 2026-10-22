import { statusTagClass } from "@/shared/ui/status-tone";
import type { ReactNode } from "react";
import { isMissing, isWaybillEditable, type ShareBox } from "@/entities/parcel/model/box-rows";
import type { SentRevgift } from "@/entities/revgift/model/revgift-rows";
import { countBatchStates, summarizeSent, toSentBatches, type SentBatch, type SentSummary } from "@/entities/revgift/model/sent-batches";
import { sentStateTag } from "@/entities/revgift/ui/received-status";
import { shareAddressCode } from "@/features/box-waybill/model/box-targets";
import { ReceivingAddress } from "@/features/box-waybill/ui/receiving-address";
import { WaybillEditor } from "@/features/box-waybill/ui/waybill-editor";
import { formatDateTime } from "@/shared/lib/format/datetime";
import { FaceAvatar } from "@/shared/ui/face-avatar";
import s from "./revgift-sent.module.css";

// 보낸 역조공(크리에이터). 시안: docs/design/mockups/site/v39-part3/revgifts-sent.html · v39.css (design-rules 25절, 22·23절).
// 880 한 단. 맨 위 보낸 선물 수(48)와 상태 띠 — 팬 한 명(몫 하나)이 한 칸, 칸 모양은 그 몫의 상태(sentStateTag 와 같은 판정 결과 x.state).
// 아래 묶음 카드는 모두 같은 모양 — 가장 최근 묶음만 펼치고 나머지는 접힌 한 줄(details).
// 묶음 안: 받는 주소 안내(묶음마다 한 번) · 팬별 「지금 상태」 한 줄 목록 · 「송장번호 적기(선택)」 접힌 칸.
// 한 줄에 보이는 것은 팬 닉네임·주문번호·상태 배지(셋 중 하나)뿐이다 — 팬 로그인 아이디도 싣지 않는다(reverse-gift INV-R8). 줄은 링크가 아니다.
// 송장번호는 배송 조회를 보고 싶을 때만 넣는 선택 칸이다(inbound-address-code INV-C7). 입고 전엔 넣고 고치고, 도착하면 「도착 완료」로 잠긴다(design-rules 8-1).
// 받는 주소(INV-R14, inbound-address-code INV-C2·C3): 팬(몫)마다 사무실 주소 + 그 몫의 6자리. 묶음에 officeAddress 가 있을 때
// (결제가 끝났고 보낼 상자가 남은 묶음) + my_share_boxes 가 그 몫의 6자리를 줄 때(보낸 크리에이터 본인 · 유효할 때)만 그린다.
// 6자리 빠진 기본 사무실 주소는 그리지 않는다. 팬의 받기를 기다리지 않는다 — 받기는 출고 전에만 있으면 된다.
// 받는 주소 없이 보낸 상자의 「내 상자 찾기」는 선물 현황 「보내는 선물」의 입고 전 줄에 있다(action-center INV-J10).
// 묶음 나누기와 상태 세기는 entities/revgift/model/sent-batches.ts — 여기서는 문구와 칸만 조립한다.
// v39 에서 뺀 것(25절): 페이지 설명 문장, 오른쪽 요약 칸(숫자는 상태 띠가 맡는다), 「역조공 보내기」 버튼(사이드바에 있다), 송장 안내 한 줄.

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
        도착 완료
      </span>
      <span className="t-meta">사무실에 도착해 확인했어요</span>
    </p>
  );
}

/** 묶음 아래 「송장번호 적기(선택)」 — 평소엔 접혀 있다(시안 .invfold). 칸에 넣을 팬이 없으면 그리지 않는다 */
function WaybillFold({ views }: { views: readonly ShareView[] }) {
  const items = views.flatMap(({ x, waybillBox }) => (waybillBox ? [{ x, box: waybillBox }] : []));
  if (items.length === 0) return null;
  return (
    <details className={`${s.fold} ${s.invFold}`}>
      <summary>송장번호 적기 (선택)</summary>
      <div className={s.in}>
        <p className={s.hint}>상자가 사무실에 도착하기 전까지만 고칠 수 있고, 도착하면 「도착 완료」로 바뀌고 잠겨요.</p>
        {items.map(({ x, box }) => (
          <div key={x.orderNo} className={s.invRow}>
            <p className={s.invName} title={`${x.fanNickname}님`}>
              {x.fanNickname}님
            </p>
            <ShareWaybill box={box} fanNickname={x.fanNickname} />
          </div>
        ))}
      </div>
    </details>
  );
}

function batchSummary(shares: readonly SentRevgift[]): string {
  const n = countBatchStates(shares);
  const parts = [n.accepted ? `수락 ${n.accepted}명` : "", n.waiting ? `수락 대기 ${n.waiting}명` : "", n.not_received ? `받지 않음 ${n.not_received}명` : ""].filter(
    Boolean,
  );
  return n.not_received ? `${parts.join(" · ")} (받지 않은 상자 요금은 환불돼요)` : parts.join(" · ");
}

const STATE_ORDER: readonly SentRevgift["state"][] = ["accepted", "waiting", "not_received"];

/** 상태 띠 칸 모양 — 수락=채움 · 수락 대기=하늘 테두리 · 받지 않음=회색(design-rules 25절). 상태는 몫의 판정 결과(x.state) 그대로 */
const CELL: Record<SentRevgift["state"], string | undefined> = { accepted: s.cellOk, waiting: s.cellWait, not_received: s.cellNo };

/** 묶음 접힌 줄에 겹쳐 보이는 얼굴 수 — 팬이 많은 묶음에서 줄이 넘치지 않게 앞의 몇 명만(인원은 바로 옆 「팬 N명」이 알린다) */
const MAX_FACES = 5;

/** 맨 위 「보낸 선물」 수와 상태 띠(시안 .sband) — 화면에 있는 몫 목록만 센다(summarizeSent) */
function SentBand({ batches, summary }: { batches: readonly SentBatch[]; summary: SentSummary }) {
  const label = STATE_ORDER.map((st) => `${sentStateTag(st).tag} ${summary.states[st]}개`).join(", ");
  return (
    <div className={s.band}>
      <div>
        <span className={s.lab}>보낸 선물</span>
        <p className="num-big">
          {summary.shares}
          <small>개</small>
        </p>
        <p className={s.sub}>{summary.batches}묶음</p>
      </div>
      <div>
        <div className={s.strip} role="img" aria-label={label}>
          {batches.flatMap((b) => b.shares.map((x) => <i key={x.orderNo} className={CELL[x.state]} />))}
        </div>
        <p className={s.legend}>
          {STATE_ORDER.map((st) => (
            <span key={st}>
              <i className={CELL[st]} />
              {sentStateTag(st).tag} <b>{summary.states[st]}개</b>
            </span>
          ))}
        </p>
      </div>
    </div>
  );
}

function AddressGuide({ headId }: { headId: string }) {
  return (
    <div className={s.guide} role="group" aria-labelledby={headId}>
      <p className={s.guideT} id={headId}>
        팬마다 받는 주소가 달라요
      </p>
      <p>
        팬 한 명마다 상자를 따로 포장하고, 아래 팬마다 나온 받는 주소를 끝 6자리까지 그대로 써서 보내 주세요. 팬이 받기를 누를 때까지 기다리지 않고 보내셔도 돼요. 받지 않은 팬의
        상자는 돌려보내고 그 상자 요금은 환불돼요.
      </p>
    </div>
  );
}

function Batch({ b, bi, boxByOrder }: { b: SentBatch; bi: number; boxByOrder: ReadonlyMap<string, ShareBox> }) {
  const views = toShareViews(b.shares, boxByOrder, b.officeAddress);
  const when = formatDateTime(b.sentAt);
  return (
    // 최근 묶음(맨 앞)만 펼친다 — 나머지는 접힌 한 줄
    <details className={s.batch} open={bi === 0}>
      <summary>
        <div className={s.bHead}>
          <h2 className={s.bTitle} id={`rv-batch-${bi}`}>
            {when} 보낸 역조공
          </h2>
          <p className={s.facts}>
            {/* 한 번 보낸 것 안에서는 같은 팬이 두 번 없다(DB 유일 send_id·fan_id) — 묶음 줄은 「팬 N명」이 맞다 */}
            팬 {b.shares.length}명 · {batchSummary(b.shares)}
          </p>
        </div>
        <span className={s.faces} aria-hidden="true">
          {b.shares.slice(0, MAX_FACES).map((x, i) => (
            <FaceAvatar key={x.orderNo} index={i} className={s.face} />
          ))}
        </span>
        <svg className={s.chev} viewBox="0 0 24 24" aria-hidden="true" focusable="false">
          <path d="m6 9 6 6 6-6" />
        </svg>
      </summary>
      <div className={s.bbody}>
        {b.officeAddress && views.some((v) => v.addressCode) ? <AddressGuide headId={`rv-addr-${bi}`} /> : null}
        <ul className={s.rows} aria-label={`${when} 묶음 팬별 지금 상태`}>
          {views.map(({ x, addressCode }, i) => {
            const tag = sentStateTag(x.state);
            return (
              <li key={x.orderNo} className={s.srow}>
                <div className={s.line}>
                  <FaceAvatar index={i} className={s.av} />
                  <div className={s.nm}>
                    <p className={s.name} title={`${x.fanNickname}님`}>
                      {x.fanNickname}님
                    </p>
                    <p className={s.orderNo}>주문번호 {x.orderNo}</p>
                  </div>
                  <span className={statusTagClass(tag.tone)}>
                    {tag.tone === "success" ? <Check /> : null}
                    {tag.tag}
                  </span>
                </div>
                {b.officeAddress && addressCode ? (
                  <div className={s.addr}>
                    <ReceivingAddress officeAddress={b.officeAddress} code={addressCode} boxName={`${x.fanNickname}님 상자`} multiple={b.shares.length > 1} />
                  </div>
                ) : null}
              </li>
            );
          })}
        </ul>
        <WaybillFold views={views} />
      </div>
    </details>
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
  return (
    <div className={s.page}>
      <header className="page-head">
        <div className="ph-row">
          <h1 className="ph-title">
            보낸 역조공<span className="ph-count">{batches.length}</span>
          </h1>
        </div>
      </header>
      {tabs}
      {paid ? (
        <div className={s.paid} role="status">
          <img className={s.peek} src="/images/home/icon-truck.webp" alt="" aria-hidden="true" width={80} height={80} />
          <p>
            <strong>결제가 끝났어요.</strong> 팬마다 상자를 따로 포장하고, 아래 팬마다 나온 받는 주소로 보내 주세요.
          </p>
        </div>
      ) : null}
      {batches.length > 0 ? <SentBand batches={batches} summary={summarizeSent(rows)} /> : null}
      <div className={s.privacy}>
        <img src="/img/icon-address-lock.png" alt="" aria-hidden="true" width={40} height={40} />
        <p>
          <strong>팬의 주소와 실명은 보이지 않아요.</strong>
          <span>팬이 직접 입력하고, 팬꾹만 송장을 뽑을 때 열어요.</span>
        </p>
      </div>
      {batches.length === 0 ? (
        <section className={s.sempty}>
          <img src="/images/home/icon-gift.webp" alt="" aria-hidden="true" width={96} height={96} />
          <h2 className={s.semptyT}>아직 보낸 역조공이 없어요</h2>
          <p>나를 팔로우한 팬을 골라 선물을 보낼 수 있어요.</p>
        </section>
      ) : (
        batches.map((b, bi) => <Batch key={b.sentAt} b={b} bi={bi} boxByOrder={boxByOrder} />)
      )}
      <details className={`${s.fold} ${s.knows}`}>
        <summary>알아 두세요</summary>
        <div className={s.in}>
          <ul>
            <li>「받지 않음」은 팬이 받지 않기를 누른 경우와 7일이 지난 경우를 구분하지 않아요.</li>
            <li>받지 않은 상자는 보낸 사무실 쪽에서 돌려보내고, 그 상자 요금만 환불돼요.</li>
            <li>한 팬이 받지 않아도 같은 묶음의 다른 팬 선물은 그대로 가요.</li>
            <li>상자를 더 보내려면 새로 보내기를 해 주세요. 상자마다 받는 주소가 달라요.</li>
          </ul>
        </div>
      </details>
    </div>
  );
}
