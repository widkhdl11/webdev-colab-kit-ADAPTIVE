import Link from "next/link";
import { isWaybillEditable, type ShareBox } from "@/entities/parcel/model/box-rows";
import type { SentRevgift } from "@/entities/revgift/model/revgift-rows";
import { countBatchStates, toSentBatches } from "@/entities/revgift/model/sent-batches";
import { sentStateTag } from "@/entities/revgift/ui/received-status";
import { WaybillEditor } from "@/features/box-waybill/ui/waybill-editor";
import { formatDateTime } from "@/shared/lib/format/datetime";
import { CopyButton } from "@/shared/ui/copy-button";
import { FaceAvatar } from "@/shared/ui/face-avatar";
import s from "./revgift-sent.module.css";

// 보낸 역조공(크리에이터). 시안: docs/design/mockups/site/v4/creator-revgift-list.html
// 한 줄에 보이는 것은 팬 아이디·닉네임·주문번호·상태 배지(셋 중 하나)뿐이다(reverse-gift INV-R8).
// 몫마다 원 송장번호 줄이 붙는다(시안 creator-revgift-boxes.html). 입고 전엔 넣고 고치고, 입고되면 「입고됨」으로 잠긴다.
// 택배사 고르는 칸은 DB 에 그 칸이 없어 뺐다.
// 묶음 나누기와 상태 세기는 entities/revgift/model/sent-batches.ts — 여기서는 문구만 조립한다.
// 사무실 주소는 묶음에 officeAddress 가 있을 때(결제가 끝났고 보낼 상자가 남은 묶음)만 그린다(INV-R14).
// 팬의 받기를 기다리지 않는다 — 받기는 출고 전에만 있으면 된다. 모양은 팬 선물의 「보내실 주소」와 같다.

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
        hint="팬 한 명마다 상자가 따로예요. 이 팬에게 보내는 상자의 송장번호를 넣어 주세요."
      />
    );
  }
  return (
    <div className={s["share-inv"]}>
      <span className={s.lab}>송장번호</span>
      <span className="tag tag--brand">
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

function OfficeAddress({ address, headId }: { address: string; headId: string }) {
  return (
    <div className={s.addr} role="group" aria-labelledby={headId}>
      <p className={s["addr-title"]} id={headId}>
        이 주소로 보내 주세요
      </p>
      <dl>
        <div>
          <dt>받는 곳</dt>
          <dd>{address}</dd>
        </div>
        <div>
          <dt>받는 사람</dt>
          <dd>팬꾹 + 그 상자 팬의 주문번호 (상자마다 따로 적어 주세요)</dd>
        </div>
      </dl>
      <p className={s["addr-note"]}>팬이 받기를 누를 때까지 기다리지 않고 보내셔도 돼요. 받지 않은 팬의 상자는 돌려보내고 그 상자 요금은 환불돼요.</p>
      <div className={s["addr-copy"]}>
        <CopyButton className="btn btn--soft btn--sm" text={`${address}\n팬꾹`} label="주소 복사하기" copiedMessage="주소를 복사했어요." failedMessage="복사하지 못했어요. 위 주소를 직접 옮겨 적어 주세요." />
      </div>
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
          <span>팬마다 상자를 따로 포장하고, 상자 겉에 그 팬의 주문번호를 적어 아래 팬꾹 사무실 주소로 보내 주세요.</span>
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
          <p className="sub">나를 팔로우한 팬의 아이디를 알면 선물을 보낼 수 있어요.</p>
        </div>
      ) : (
        batches.map((b, bi) => (
          <section key={b.sentAt} className={s.batch} aria-labelledby={`rv-batch-${bi}`}>
            <div className={s["batch-head"]}>
              <h3 id={`rv-batch-${bi}`}>{formatDateTime(b.sentAt)} 보낸 역조공</h3>
              <p className={s.facts}>팬 {b.shares.length}명</p>
            </div>
            {b.officeAddress ? <OfficeAddress address={b.officeAddress} headId={`rv-addr-${bi}`} /> : null}
            <ul className={s.shares}>
              {b.shares.map((x, i) => {
                const tag = sentStateTag(x.state);
                const box = boxByOrder.get(x.orderNo);
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
                    {box ? <ShareWaybill box={box} fanNickname={x.fanNickname} shareState={x.state} /> : null}
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
          <li>송장번호는 상자가 사무실에 도착하기 전까지만 고칠 수 있어요. 도착해서 입고되면 「입고됨」으로 바뀌고 잠겨요.</li>
        </ul>
      </div>
    </div>
  );
}
