import Link from "next/link";
import type { BoxCard, MyBox } from "@/entities/revgift-box/api/box-reads";
import { OFFICE_ADDRESS } from "@/entities/order/config/office-address";
import { ReceivingAddress } from "@/features/box-waybill/ui/receiving-address";
import { BoxCards } from "@/features/revgift-box-manage/ui/box-cards";
import { BoxCartonCount } from "@/features/revgift-box-manage/ui/box-carton-count";
import s from "./revgift-box.module.css";

// 3페이지 — 다음 작업 안내 (revgift-box INV-GB10·GB11 · UX 명세 creator-revgifts-new.md 「3페이지」 awaiting_box, 상태 전이표 arrived·held).
// 팬꾹 주소(6자리는 가려 두고 눌러야 보임, 전체 주소 복사는 6자리 포함 — inbound-address-code INV-C2) · 번호 라벨 · 보낸 상자 수 · 결제 안내 · 방문수거 팁.
// 6자리는 읽기 함수가 주인에게, 유효할 때만 준다 — 없으면 주소 칸을 그리지 않는다. 미리 결제 버튼은 없다.

export function BoxSendSection({ box, cards }: { box: MyBox; cards: readonly BoxCard[] }) {
  const waiting = box.status === "awaiting_box";
  return (
    <div className={s.stack}>
      {box.status === "arrived" ? <p className={s.callout}>팬꾹에 도착했어요. 실측 중이에요.</p> : null}
      {box.status === "held" ? (
        <section className={s.stack} aria-labelledby="box-held">
          <p className={s.callout} id="box-held">
            닉네임이 맞지 않는 선물이 있어요. 팬을 골라 주세요.
          </p>
          <BoxCards cards={cards.filter((c) => c.boxId === box.id)} />
        </section>
      ) : null}

      <section className={s.prep} aria-labelledby="send-how">
        <h2 className={s.cmpH} id="send-how">
          큰 상자에 닉네임을 적은(또는 라벨을 붙인) 선물을 담아 팬꾹으로 보내 주세요
        </h2>
        <img className={s.packImg} src="/images/home/revgift-pack.png" alt="" aria-hidden="true" width={160} height={160} />
        <ul>
          <li>
            <Link href={`/creator/revgift-boxes/${box.id}/labels`}>번호 라벨 인쇄</Link> — 손글씨 닉네임도 됩니다.
          </li>
          <li>닉네임이 맞지 않는 선물은 보류하고 확인을 요청드려요.</li>
          <li>팬꾹에서 실측 후 명세서와 함께 결제 요청을 드립니다. 결제 후 바로 발송됩니다.</li>
          <li>결제 기한은 3일이고, 결제가 없으면 7일째 착불로 돌려보냅니다.</li>
        </ul>
      </section>

      {box.inboundCode ? <ReceivingAddress officeAddress={OFFICE_ADDRESS} code={box.inboundCode} boxName={box.name} /> : null}

      <BoxCartonCount boxId={box.id} count={box.cartonCount ?? 1} editable={waiting && box.cartonsReceived === 0} />
      {!waiting ? (
        <p className={s.note}>
          도착한 상자 {box.cartonsReceived}개 / 보낸 상자 {box.cartonCount ?? 1}개
        </p>
      ) : null}

      {waiting ? (
        <section className={s.cmp} aria-labelledby="send-pickup">
          <h2 className={s.cmpH} id="send-pickup">
            방문수거 신청하기
          </h2>
          <p>택배사 앱의 방문접수 메뉴에서 신청할 수 있어요. 받는 곳은 위 팬꾹 주소 그대로, 결제는 착불로 골라 주세요.</p>
          <p>착불 택배비는 팬꾹이 받을 때 내고 명세서에 함께 청구됩니다.</p>
        </section>
      ) : null}
    </div>
  );
}
