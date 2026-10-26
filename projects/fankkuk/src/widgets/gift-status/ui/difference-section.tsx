import { statusTagClass } from "@/shared/ui/status-tone";
import type { GiftDifference } from "@/entities/payment/model/difference-rows";
import { PARCEL_TIER_GUIDE } from "@/entities/parcel/model/size-tier";
import s from "./gift-status.module.css";

// 차액 결제 기록 (payment INV-M11·M12·M13). 도착한 상자를 재어 보니 구간이 더 크면 상자마다 차액을 따로 낸다.
// 2026-10-21(action-center INV-J13 — 처리는 맨 위 「지금 할 일」 칸에서만): 결제 버튼은 칸(widgets/action-center 의 차액 결제 버튼)에만 있다.
// 이 구간은 결제 확인 중·결제 완료·기한 지남 줄과, 결제창에서 돌아왔을 때의 안내(?difference=…)만 보인다 — 줄은 라우트가 거른다(differencesBelowTodo).

export type DifferenceNotice = "paid" | "failed" | "in_progress" | "closed" | null;

const won = (n: number) => `${n.toLocaleString("ko-KR")}원`;

function tierName(t: string): string {
  return t in PARCEL_TIER_GUIDE ? PARCEL_TIER_GUIDE[t as keyof typeof PARCEL_TIER_GUIDE].name : t;
}

const NOTICE_TEXT: Record<Exclude<DifferenceNotice, null>, string> = {
  paid: "차액 결제가 완료되었습니다. 나머지 출고 조건이 충족되면 배송됩니다.",
  failed: "차액 결제가 완료되지 않았습니다. 다시 결제해 주세요.",
  in_progress: "결제 확인 중입니다. 잠시 후 새로고침해 주세요.",
  closed: "기한이 지났거나 반송이 결정되어 차액 결제를 진행할 수 없습니다. 차액은 결제되지 않았습니다.",
};

const STATE_TAG = {
  due: { text: "결제 필요", className: statusTagClass("warn") },
  paying: { text: "결제 확인 중", className: statusTagClass("warn") },
  paid: { text: "결제 완료", className: statusTagClass("success") },
  closed: { text: "기한 만료", className: statusTagClass("danger") },
} as const;

type Props = { differences: readonly GiftDifference[]; notice: DifferenceNotice };

export function DifferenceSection({ differences, notice }: Props) {
  return (
    <div className={s.sec} data-sec="">
      <h2 className={s.secTitle}>차액 결제</h2>
      <p className={s.desc}>
        {/* 차액 결제만으로 출고를 약속하지 않는다 · 미납 반송의 배송비는 반송에 쓰여 환불되지 않는다(payment INV-M8·M12·M13) */}
        실측 결과가 선택한 요금 구간을 초과해 추가 결제가 필요합니다. 결제 후 승인·검수 등 출고 조건이 충족되면 배송됩니다.
        <br />
        기한 내 미결제 시 돌려보낼 상자가 됩니다. 배송비는 반송에 사용되며 환불되지 않습니다.
      </p>
      {notice ? (
        <p className={s.more} role={notice === "failed" || notice === "closed" ? "alert" : "status"}>
          <strong>{NOTICE_TEXT[notice]}</strong>
        </p>
      ) : null}
      <div className={s.boxes}>
        {differences.map((d) => {
          const tag = STATE_TAG[d.state];
          return (
            <div key={d.boxId} className={s.box}>
              <div className={s.boxline}>
                <h3 className={s.boxName}>
                  상자 {d.boxSeq} · {won(d.amountKrw)}
                </h3>
                <span className={tag.className}>{tag.text}</span>
              </div>
              <p className={s.note}>
                선택한 크기 {tierName(d.declaredTier)} → 실측 크기 {tierName(d.measuredTier)}
              </p>
              {d.state === "closed" ? <p className="hint">차액 결제 기한이 지나 반송 예정입니다.</p> : null}
            </div>
          );
        })}
      </div>
    </div>
  );
}
