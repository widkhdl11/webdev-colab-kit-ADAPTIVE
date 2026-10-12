import { statusTagClass } from "@/shared/ui/status-tone";
import Link from "next/link";
import { canReportNotMine, isWaybillEditable, type ShareBox } from "@/entities/parcel/model/box-rows";
import type { SentRevgift } from "@/entities/revgift/model/revgift-rows";
import { countBatchStates, toSentBatches } from "@/entities/revgift/model/sent-batches";
import { sentStateTag } from "@/entities/revgift/ui/received-status";
import { shareAddressCode, shareFinderBoxes } from "@/features/box-waybill/model/box-targets";
import { FindMyBox } from "@/features/box-waybill/ui/find-my-box";
import { NotMineButton } from "@/features/box-waybill/ui/not-mine-button";
import { ReceivingAddress } from "@/features/box-waybill/ui/receiving-address";
import { WaybillEditor } from "@/features/box-waybill/ui/waybill-editor";
import { formatDateTime } from "@/shared/lib/format/datetime";
import { FaceAvatar } from "@/shared/ui/face-avatar";
import s from "./revgift-sent.module.css";

// 보낸 역조공(크리에이터). 시안: docs/design/mockups/site/v4/creator-revgift-list.html
// 한 줄에 보이는 것은 팬 닉네임·주문번호·상태 배지(셋 중 하나)뿐이다 — 팬 로그인 아이디도 싣지 않는다(reverse-gift INV-R8).
// 몫마다 송장번호 줄이 붙는다(시안 creator-revgift-boxes.html). 배송 조회를 보고 싶을 때만 넣는 선택 칸이다(inbound-address-code INV-C7).
// 입고 전엔 넣고 고치고, 입고되면 「입고됨」으로 잠긴다.
// 묶음 나누기와 상태 세기는 entities/revgift/model/sent-batches.ts — 여기서는 문구만 조립한다.
// 받는 주소(INV-R14, inbound-address-code INV-C2·C3): 팬(몫)마다 사무실 주소 + 그 몫의 6자리. 묶음에 officeAddress 가 있을 때
// (결제가 끝났고 보낼 상자가 남은 묶음) + my_share_boxes 가 그 몫의 6자리를 줄 때(보낸 크리에이터 본인 · 유효할 때)만 그린다.
// 6자리 빠진 기본 사무실 주소는 그리지 않는다. 팬의 받기를 기다리지 않는다 — 받기는 출고 전에만 있으면 된다.
// 받는 주소 없이 보낸 상자는 「받는 주소 없이 보냈어요」(INV-C4 ②), 입고 뒤 출고 전에는 「제가 보낸 게 아니에요」(INV-C8).

function Check() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true">
      <path d="m5 12.5 4.5 4.5L19 7" fill="none" stroke="currentColor" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

// 받지 않은 몫(거절·기한 지남)은 보낼 상자가 아니라 송장번호 칸을 열지 않는다
function ShareWaybill({ box, fanNickname, shareState }: { box: ShareBox; fanNickname: string; shareState: SentRevgift["state"] }) {
  if (isWaybillEditable(box.state)) {
    if (shareState === "not_received") return null;
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
  return (
    <div className={s["share-inv"]}>
      <span className={s.lab}>송장번호</span>
      <span className={statusTagClass("success")}>
        <Check />
        입고됨
      </span>
      <span className={s.lab}>사무실에 도착해 확인했어요</span>
    </div>
  );
}

function batchSummary(shares: readonly SentRevgift[]): string {
  const n = countBatchStates(shares);
  const parts = [
    n.accepted ? `받은 팬 ${n.accepted}명` : "",
    n.waiting ? `기다리는 중 ${n.waiting}명` : "",
    n.not_received ? `받지 않은 팬 ${n.not_received}명` : "",
  ].filter(Boolean);
  return n.not_received ? `${parts.join(" · ")} (받지 않은 상자 요금은 환불돼요)` : parts.join(" · ");
}

function AddressGuide({ headId }: { headId: string }) {
  return (
    <div className={s.addr} role="group" aria-labelledby={headId}>
      <p className={s["addr-title"]} id={headId}>
        팬마다 받는 주소가 달라요
      </p>
      <p className={s["addr-note"]}>
        팬 한 명마다 상자를 따로 포장하고, 아래 팬마다 나온 받는 주소를 끝 6자리까지 그대로 써서 보내 주세요. 팬이 받기를 누를 때까지 기다리지 않고 보내셔도 돼요. 받지 않은 팬의 상자는 돌려보내고 그 상자 요금은 환불돼요.
      </p>
    </div>
  );
}

export function RevgiftSentPage({
  rows,
  boxes,
  paid,
  officeAddress,
}: {
  rows: readonly SentRevgift[];
  boxes: readonly ShareBox[];
  paid: boolean;
  officeAddress: string;
}) {
  const batches = toSentBatches(rows, officeAddress);
  const boxByOrder = new Map(boxes.map((b) => [b.orderNo, b]));
  // 받는 주소 없이 보냈어요(INV-C4 ②) — 고를 수 있는 몫의 판정은 features/box-waybill/model/box-targets.ts
  const finderBoxes = shareFinderBoxes(rows, boxes);
  return (
    <div>
      <div className="panel-head">
        <div>
          <h2 className="panel-h">보낸 역조공</h2>
          <p>팬에게 보낸 선물을 한 번에 보낸 묶음별로 모아 봤어요.</p>
        </div>
        <Link className="btn btn--sm" href="/creator/revgifts/new">
          역조공 보내기
        </Link>
      </div>
      {paid ? (
        <p className={s.paid} role="status">
          <strong>결제가 끝났어요.</strong>
          <span>팬마다 상자를 따로 포장하고, 아래 팬마다 나온 받는 주소로 보내 주세요.</span>
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
          <h3>아직 보낸 역조공이 없어요</h3>
          <p className="sub">나를 팔로우한 팬을 골라 선물을 보낼 수 있어요.</p>
        </div>
      ) : (
        batches.map((b, bi) => (
          <section key={b.sentAt} className={s.batch} aria-labelledby={`rv-batch-${bi}`}>
            <div className={s["batch-head"]}>
              <h3 id={`rv-batch-${bi}`}>{formatDateTime(b.sentAt)} 보낸 역조공</h3>
              <p className={s.facts}>팬 {b.shares.length}명</p>
            </div>
            {b.officeAddress && b.shares.some((x) => shareAddressCode(boxByOrder.get(x.orderNo), b.officeAddress, x.state)) ? <AddressGuide headId={`rv-addr-${bi}`} /> : null}
            <ul className={s.shares}>
              {b.shares.map((x, i) => {
                const tag = sentStateTag(x.state);
                const box = boxByOrder.get(x.orderNo);
                const addressCode = shareAddressCode(box, b.officeAddress, x.state);
                return (
                  <li key={x.orderNo} className={s.share}>
                    <FaceAvatar index={i} />
                    <div>
                      <p className={s.nick}>{x.fanNickname}</p>
                      <p className={s.says}>
                        주문번호 {x.orderNo}
                      </p>
                    </div>
                    <span className={statusTagClass(tag.tone, s.tag)}>{tag.tag}</span>
                    {b.officeAddress && addressCode ? (
                      <div className={s["share-extra"]}>
                        <ReceivingAddress officeAddress={b.officeAddress} code={addressCode} boxName={`${x.fanNickname}님 상자`} multiple={b.shares.length > 1} />
                      </div>
                    ) : null}
                    {box ? <ShareWaybill box={box} fanNickname={x.fanNickname} shareState={x.state} /> : null}
                    {box && canReportNotMine(box.state) ? (
                      <div className={s["share-extra"]}>
                        <NotMineButton target={{ kind: "share", id: box.shareId }} boxName={`${x.fanNickname}님 상자`} reported={box.reportedNotMine} />
                      </div>
                    ) : null}
                  </li>
                );
              })}
            </ul>
            <p className={s["batch-sum"]}>{batchSummary(b.shares)}</p>
          </section>
        ))
      )}
      {finderBoxes.length > 0 ? (
        <section className={s.batch} aria-labelledby="rv-find">
          <div className={s["batch-head"]}>
            <h3 id="rv-find">받는 주소 없이 보냈어요</h3>
          </div>
          <p className="sub">받는 주소 끝 6자리를 빼고 보낸 상자는 사무실에서 바로 찾지 못해요. 송장번호·택배사·보낸 사람 이름 첫 글자가 모두 맞으면 그 팬의 상자로 이어져요. 하루에 다섯 번까지 찾을 수 있어요.</p>
          <FindMyBox boxes={finderBoxes} />
        </section>
      ) : null}
      <div className={s["foot-note"]}>
        <strong>알아 두세요</strong>
        <ul>
          <li>「받지 않았어요」는 팬이 받지 않기를 누른 경우와 7일이 지난 경우를 구분하지 않아요.</li>
          <li>받지 않은 상자는 보낸 사무실 쪽에서 돌려보내고, 그 상자 요금만 환불돼요.</li>
          <li>한 팬이 받지 않아도 같은 묶음의 다른 팬 선물은 그대로 가요.</li>
          <li>송장번호는 배송 조회를 보고 싶을 때만 넣어요. 상자가 사무실에 도착하기 전까지만 고칠 수 있고, 입고되면 「입고됨」으로 바뀌고 잠겨요.</li>
          <li>상자를 더 보내려면 새로 보내기를 해 주세요. 상자마다 받는 주소가 달라요.</li>
        </ul>
      </div>
    </div>
  );
}
