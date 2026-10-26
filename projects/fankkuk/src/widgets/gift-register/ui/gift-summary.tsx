import { PARCEL_TIER_GUIDE } from "@/entities/parcel/model/size-tier";
import { tierCountText } from "@/entities/parcel/model/box-rows";
import { formatWon } from "@/shared/lib/format/won";
import { MAX_BOX_COUNT } from "@/features/gift-register/model/register-input";
import type { RegisterDraft } from "@/features/gift-register/ui/register-form";
import s from "./gift-summary.module.css";

// 선물 보내기 「보낼 선물」 칸(PC)과 휴대폰 3단계 아래 합계 줄 — design-rules 33절, 시안 docs/design/mockups/site/v41-user-fixes/s/new-after.html (.sumcard · .sumbar).
// 금액은 폼이 넘긴 summarizeBoxes 결과를 그리기만 한다(새 계산 없음 — 결제 금액은 서버가 등록 때 다시 계산한다, payment INV-M1).

const DASH = "—";

/** 합계 칸의 글자 — 3단계 전이면 0원, 상한을 넘으면 금액 대신 「10개 초과」(UX 명세 gifts-new 요소 목록) */
function totalView(draft: RegisterDraft | null): { krw: number | null; over: boolean } {
  if (!draft?.boxesChosen) return { krw: 0, over: false };
  if (draft.summary.overLimit) return { krw: null, over: true };
  return { krw: draft.summary.totalKrw ?? 0, over: false };
}

function TotalNumber({ draft }: { draft: RegisterDraft | null }) {
  const t = totalView(draft);
  if (t.over) return <>{`${MAX_BOX_COUNT}개 초과`}</>;
  return (
    <>
      {(t.krw ?? 0).toLocaleString("ko-KR")}
      <small>원</small>
    </>
  );
}

/** PC 오른쪽 칸 — 받는 크리에이터 · 선물 종류 · 크기별 줄(0개 크기는 없음) · 합계 · 검수 포함. 휴대폰에서는 CSS 로 숨긴다 */
export function GiftSummaryCard({ draft }: { draft: RegisterDraft | null }) {
  const lines = draft?.boxesChosen ? draft.summary.lines : [];
  return (
    <aside className={s.card} aria-labelledby="gift-sum-h" data-gift-summary="">
      <h2 className={s.h} id="gift-sum-h">
        보낼 선물
      </h2>
      <dl className={s.kv}>
        <div>
          <dt>받는 크리에이터</dt>
          <dd>{draft?.creatorName ? `${draft.creatorName}님` : DASH}</dd>
        </div>
        <div>
          <dt>선물 종류</dt>
          <dd>{draft?.itemText ?? DASH}</dd>
        </div>
      </dl>
      <hr className={s.rule} />
      {lines.length > 0 ? (
        <ul className={s.lines}>
          {lines.map((l) => (
            <li key={l.tier} className={s.ln} data-tier={l.tier}>
              <span className={s["ln-name"]}>
                {PARCEL_TIER_GUIDE[l.tier].name} 상자 {l.count}개
                <small>
                  {formatWon(l.unitKrw)} × {l.count}
                </small>
              </span>
              <span className={s["ln-krw"]}>{formatWon(l.subtotalKrw)}</span>
            </li>
          ))}
        </ul>
      ) : null}
      {/* 합계가 바뀔 때 화면 낭독기는 이 한 줄만 읽는다 */}
      <div className={`${s.tot} ${lines.length === 0 ? s["tot-only"] : ""}`} aria-live="polite" aria-atomic="true" data-gift-total="">
        <span className={s["tot-label"]}>합계</span>
        <b>
          <TotalNumber draft={draft} />
        </b>
      </div>
      <p className={s.tag}>
        <span className="tag tag--brand">검수 포함</span>
      </p>
    </aside>
  );
}

/** 휴대폰 3단계 아래에 붙어 따라오는 합계 줄 — 「상자 N개」 · 크기별 개수 · 합계, 버튼 없음. PC 에서는 CSS 로 숨긴다 */
export function GiftSumBar({ draft }: { draft: RegisterDraft }) {
  const { counts } = draft.summary;
  const boxCount = counts.small + counts.medium + counts.large;
  const perTier = tierCountText(counts, "");
  return (
    <div className={s.bar} role="group" aria-label="고른 상자 합계" data-gift-sumbar="">
      <div className={s["bar-l"]}>
        <b>상자 {boxCount}개</b>
        {perTier ? <span>{perTier}</span> : null}
      </div>
      <p className={s["bar-r"]} aria-live="polite" aria-atomic="true">
        <TotalNumber draft={draft} />
      </p>
    </div>
  );
}
