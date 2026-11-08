import type { BoxInvoice, LineProgress } from "@/entities/revgift-box/api/box-reads";
import type { BoxStatus } from "@/entities/revgift-box/model/box-status";
import { REGION_NAME, TIER_NAME } from "@/entities/revgift-box/model/box-tiers";
import { BoxPayButton } from "@/features/revgift-box-pay/ui/box-pay-button";
import { formatDateTime } from "@/shared/lib/format/datetime";
import s from "./revgift-box.module.css";

// 명세서·결제 (revgift-box INV-GB9·GB13·GB16·GB17·GB18·GB19 · UX 명세 「4페이지」). 팬 줄마다 구간(대형 초과는 「개인접수」)·택배비·할증(제주·도서만)·서비스료·금액,
// 착불로 받은 큰 상자 택배비, 합계. 팬 정보는 닉네임과 할증 구분뿐이다.
// - 결제 요청: 결제 기한(명세서 + 72시간) · 결제하기
// - 결제 기한 지남: 결제 기한 · 착불 반송 시각 한 줄 · 결제하기
// - 결제 「승인 중」이 있으면 결제하기 대신 확인 중 문장(두 번 결제되지 않게)
// - 발송 중·끝: 「결제했어요. 바로 발송합니다」 · 줄마다 진행 칸
// - 착불 반송·반송됨: 「결제가 없어 착불로 돌려보냈어요」

const won = (n: number) => `${n.toLocaleString("ko-KR")}원`;

const PROGRESS_NAME: Record<LineProgress, string> = {
  unpaid: "결제 전",
  paid: "출고 전",
  shipped: "출고",
  ended: "환불 대상",
  refunded: "환불 완료",
};

export type PayNotice = "paid" | "failed" | "in_progress" | null;

export function BoxInvoiceSection({
  boxId,
  boxName,
  status,
  invoice,
  clientKey,
  notice,
}: {
  boxId: string;
  boxName: string;
  status: BoxStatus;
  invoice: BoxInvoice;
  clientKey: string;
  notice: PayNotice;
}) {
  const payable = status === "invoiced" || status === "overdue";
  const paid = status === "paid" || status === "done";
  const returned = status === "returning" || status === "returned";
  return (
    <section className={s.stack} aria-labelledby="invoice-h">
      <h2 className={s.cmpH} id="invoice-h">
        명세서
      </h2>
      <div className={s.tableWrap}>
        <table className={s.invoice}>
          <thead>
            <tr>
              <th scope="col">팬</th>
              <th scope="col">구간</th>
              <th scope="col">택배비</th>
              <th scope="col">할증</th>
              <th scope="col">서비스료</th>
              <th scope="col">금액</th>
              {paid ? <th scope="col">진행</th> : null}
            </tr>
          </thead>
          <tbody>
            {invoice.lines.map((l, i) => (
              <tr key={i}>
                <th scope="row" className={s.invNick} title={l.nickname}>
                  {l.nickname}
                </th>
                <td>{TIER_NAME[l.tier]}</td>
                <td>{won(l.shippingFeeKrw)}</td>
                <td>{l.surchargeRegion === "none" ? "—" : `${REGION_NAME[l.surchargeRegion]} ${won(l.surchargeKrw)}`}</td>
                <td>{won(l.serviceFeeKrw)}</td>
                <td>{won(l.amountKrw)}</td>
                {paid ? <td>{PROGRESS_NAME[l.progress]}</td> : null}
              </tr>
            ))}
          </tbody>
          <tfoot>
            {invoice.cartonCodKrw > 0 ? (
              <tr>
                <th scope="row" colSpan={5}>
                  착불로 받은 큰 상자 택배비
                </th>
                <td>{won(invoice.cartonCodKrw)}</td>
                {paid ? <td /> : null}
              </tr>
            ) : null}
            <tr>
              <th scope="row" colSpan={5}>
                합계
              </th>
              <td>
                <strong>{won(invoice.amountKrw)}</strong>
              </td>
              {paid ? <td /> : null}
            </tr>
          </tfoot>
        </table>
      </div>
      {payable ? (
        <>
          <p className={s.note}>결제 기한: {formatDateTime(invoice.payDueAt)}</p>
          {status === "overdue" ? <p className={s.note}>{formatDateTime(invoice.returnAt)}까지 결제가 없으면 착불로 돌려보냅니다.</p> : null}
          {notice === "failed" ? (
            <p className="err" role="alert">
              결제가 완료되지 않았습니다. 다시 결제해 주세요.
            </p>
          ) : null}
          {invoice.paying || notice === "in_progress" ? (
            <p role="status">결제를 확인하고 있습니다. 잠시 뒤 새로고침해 주세요.</p>
          ) : (
            <BoxPayButton boxId={boxId} boxName={boxName} clientKey={clientKey} />
          )}
        </>
      ) : null}
      {paid ? <p role="status">결제했어요. 바로 발송합니다.</p> : null}
      {returned ? <p>결제가 없어 착불로 돌려보냈어요.</p> : null}
    </section>
  );
}
