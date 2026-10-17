"use client";

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import {
  allowedOutcomes,
  inspectionResultOf,
  outcomeRestriction,
  trackerReacted,
  type CheckMark,
  type InspectionChecks,
  type InspectionOutcome,
  type TrackerVerdict,
  withoutStaleVerdict,
} from "@/entities/parcel/model/inspection";
import { CREATOR_CHECK_DAYS } from "@/entities/parcel/model/creator-check";
import { needsReload } from "@/entities/parcel/model/office-error";
import { KIND_LABEL, NEXT_STEP_TEXT, STATE_LABEL, TIER_LABEL } from "@/entities/parcel/model/office-labels";
import { parcelFromLookupBody, type ParcelDetail } from "@/entities/parcel/model/office-parcel";
import { readScan } from "@/entities/parcel/model/scan-code";
import { formatStamp } from "@/shared/lib/format/datetime";
import a from "@/shared/ui/admin.module.css";
import { ScanInput, type ScanInputHandle } from "@/shared/ui/scan-input";
import w from "@/shared/ui/work.module.css";
import { postInspect } from "../api/post-inspect-client";
import { initialMeasuredTier, MEASURED_TIERS, measurementFromBody, type MeasuredTier, type Measurement } from "../model/measurement";

// 검수 작업 화면 (office-workflow INV-W1·W4, design-rules 8-1, 시안 admin/work-inspect.html).
// 라벨 QR 로 상자를 불러와 검수 기록을 저장하고, 같은 QR 을 한 번 더 스캔하면 DB 가 다음 상태(검수 완료·반송 대기)를 정한다.
// 블루투스·RF 반응이 나오면 직원이 위치 추적기인지 판정한다 — 추적기면 「추적기 보관」만(사무실에 두고 크리에이터가 신고 여부를 고른다, INV-W14),
// 추적기가 아니면 「크리에이터 확인」(크리에이터에게 받을지 묻는다, 7일 안에 답이 없으면 반송)·반송(2026-10-12 (2) 문제집 D3 ②).
// 역조공에서 걸리면 반송만. 저장한 기록은 고칠 수 없다.
// 실측 구간은 팬이 신고한 구간을 미리 골라 둔다 — 다를 때만 바꾼다(INV-W4 S4h, 문제집 D5).
// 개봉 대상(보낸 팬에게 추적기 판정 이력, INV-W16)이면 개봉 결과(장치 없음·장치 나옴)를 꼭 고른다 — 장치 나옴이면 반응과 같이 추적기 판정을 한다.

type Phase = "form" | "saved" | "finished";
type Finished = { state: "inspected" | "return_waiting" | "held" | "tracker_held" };

const OUTCOME_LABEL: Record<InspectionOutcome, string> = { pass: "통과", return: "반송", hold: "추적기 보관", confirm: "크리에이터 확인" };
const SAVED_TEXT: Record<InspectionOutcome, string> = {
  pass: "통과 — 출고 단계로 넘어갈 수 있어요.",
  return: "반송 — 반송 대기로 넘어가요.",
  hold: "추적기 보관 — 사무실에 두고 크리에이터의 신고 선택을 기다려요.",
  confirm: "크리에이터 확인 — 크리에이터에게 받을지 물어요.",
};
const VERDICT_LABEL: Record<TrackerVerdict, string> = { tracker: "위치 추적기예요", not_tracker: "추적기가 아니에요" };
const FINISHED: Record<Finished["state"], { title: string; text: string }> = {
  inspected: { title: "검수 완료", text: "출고 단계에서 이 상자를 스캔할 수 있어요." },
  return_waiting: { title: "반송 대기로 넘어갔어요", text: "출고 화면에서 반송 송장을 출력해요." },
  held: {
    title: "크리에이터 확인을 기다려요",
    text: `크리에이터가 받기·거절을 고르면 「들어온 상자」 맨 위 목록에서 처리해요 — 받기는 검수 완료로, 거절은 반송 대기로 넘어가요. ${CREATOR_CHECK_DAYS}일이 지나면 고른 쪽대로, 고르지 않았으면 반송 대기로 넘어가요.`,
  },
  tracker_held: {
    title: "추적기 보관으로 넘어갔어요",
    text: `크리에이터가 신고하기·신고하지 않기를 고르면 「들어온 상자」 맨 위 목록에서 처리해요 — 신고하기는 신고 보관으로, 신고하지 않기는 반송 대기로 넘어가요. ${CREATOR_CHECK_DAYS}일이 지나면 고른 쪽대로, 고르지 않았으면 반송 대기로 넘어가요.`,
  },
};
const OPENED_LABEL = { none: "장치 없음", device: "장치 나옴" } as const;

function InfoIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true">
      <circle cx="12" cy="12" r="9" />
      <path d="M12 11v5M12 7.5v.01" />
    </svg>
  );
}

type MarkProps = { name: string; legend: string; foundLabel: string; clearLabel: string; value: CheckMark; disabled: boolean; onChange: (v: CheckMark) => void };

function MarkChoice({ name, legend, foundLabel, clearLabel, value, disabled, onChange }: MarkProps) {
  return (
    <fieldset className={w.choice} disabled={disabled}>
      <legend>{legend}</legend>
      <div className={w.opts}>
        <label className={w.opt}>
          <input type="radio" name={name} value="clear" checked={value === "clear"} onChange={() => onChange("clear")} />
          {clearLabel}
        </label>
        <label className={w.opt}>
          <input type="radio" name={name} value="found" checked={value === "found"} onChange={() => onChange("found")} />
          {foundLabel}
        </label>
      </div>
    </fieldset>
  );
}

// 실측 결과 문구(payment INV-M11·M12). 금액은 서버가 요금표로 정한 값이다.
function measurementText(m: Measurement): string {
  if (m.result === "difference") return `차액 ${m.amountKrw.toLocaleString("ko-KR")}원 결제를 팬에게 요청했어요. 팬이 내기 전에는 송장이 나가지 않아요.`;
  if (m.result === "none") return "신고한 구간 이하라 차액이 없어요.";
  return "대형을 넘어 검수 불합격이에요. 검수 결과와 상관없이 QR 을 다시 스캔하면 반송 대기로 가요.";
}

/** 판정 칸의 첫 선택지 — 판정 없이 저장하면 여기로 커서를 옮긴다 */
const VERDICT_FIRST_ID = "tracker-verdict-tracker";
/** 개봉 결과 칸의 첫 선택지(INV-W16) */
const OPENED_FIRST_ID = "opened-none";

const CLEAR_GIFT: InspectionChecks = { kind: "gift", bluetooth: "clear", rf: "clear", metal: "clear", trackerVerdict: null };
const CLEAR_REVGIFT: InspectionChecks = { kind: "revgift", surface: "clear", prohibited: "clear" };

export function InspectWorkbench({ operatorNickname }: { operatorNickname: string }) {
  const router = useRouter();
  const scan = useRef<ScanInputHandle>(null);
  const [busy, setBusy] = useState(false);
  const [parcel, setParcel] = useState<ParcelDetail | null>(null);
  const [checks, setChecks] = useState<InspectionChecks>(CLEAR_GIFT);
  const [outcome, setOutcome] = useState<InspectionOutcome>("pass");
  const [phase, setPhase] = useState<Phase>("form");
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const [finished, setFinished] = useState<Finished | null>(null);
  // unknown: 서버는 반영했을 수 있는데 응답을 못 읽음 · local: 서버에 보내기 전에 화면에서 막힘(서버 거절이 아니다)
  const [error, setError] = useState<{ title: string; message: string; unknown?: true; local?: true } | null>(null);
  // 반응이 나왔는데 판정 없이 저장을 눌렀다 — 판정 칸을 오류로 표시한다(판정을 고르거나 반응이 없어지면 풀린다)
  const [verdictMissing, setVerdictMissing] = useState(false);
  const [measuredTier, setMeasuredTier] = useState<MeasuredTier | null>(null);
  const [measurement, setMeasurement] = useState<Measurement | null>(null);

  const allowed = allowedOutcomes(checks);
  const chosen = inspectionResultOf(checks, outcome)?.outcome ?? null;
  const restriction = outcomeRestriction(checks);
  const reacted = checks.kind === "gift" && trackerReacted(checks);
  const canInspect = parcel !== null && parcel.state === "labeled";
  // INV-W16: 개봉 대상 팬 선물 — 개봉 결과가 꼭 있어야 기록한다
  const openTarget = parcel !== null && parcel.kind === "gift" && parcel.openTarget;
  const openedMissing = openTarget && checks.kind === "gift" && !checks.opened;

  function updateChecks(changed: InspectionChecks) {
    // 반응이 없어지면 고른 판정을 비운다 — 다시 반응이 나와도 기본값 없이 비어 있다(INV-W4)
    const next = withoutStaleVerdict(changed);
    setChecks(next);
    setVerdictMissing(false);
    const r = inspectionResultOf(next, outcome);
    if (r) setOutcome(r.outcome);
  }

  /** 거부(409·404) 뒤 화면의 상자를 DB 에서 다시 읽는다 — 화면이 낡은 상자를 들고 있지 않게. 실패하면 카드를 내린다. */
  async function reload(qr: string) {
    const found = await postInspect({ kind: "lookup", qr });
    const next = found.kind === "ok" ? parcelFromLookupBody(found.body) : null;
    setParcel(next);
    if (next && next.state !== "labeled") setPhase("form");
  }

  async function onScan(raw: string) {
    const code = readScan(raw);
    if (code.kind !== "qr") {
      setError({ title: "라벨 QR 을 스캔해 주세요", message: "검수 화면은 상자에 붙인 라벨 QR(Q-여섯 자리)만 받아요.", local: true });
      return;
    }
    setError(null);
    setBusy(true);
    // 불러온 상자의 QR 을 다시 스캔하면 검수를 끝낸다 — 기록이 없으면 DB 가 거부한다(INV-W4)
    if (parcel && parcel.qr === code.value && canInspect && phase !== "finished") {
      const done = await postInspect({ kind: "complete", qr: code.value });
      setBusy(false);
      scan.current?.focus();
      if (done.kind === "failed") {
        const title =
          done.reason === "no_inspection" ? "검수 기록이 먼저 있어야 해요" : done.reason === "no_measurement" ? "실측이 먼저 있어야 해요" : "반영되지 않았어요";
        setError({ title, message: done.message });
        if (needsReload(done)) {
          await reload(code.value);
          router.refresh();
        }
        return;
      }
      const state = done.body.state;
      if (state === "inspected" || state === "return_waiting" || state === "held" || state === "tracker_held") {
        setFinished({ state });
        // 상자 정보 칸의 상태 표시도 끝난 상태로. nextStep 은 옛 값이지만 finished 단계에서는 「검수 단계가 아니에요」 안내가 가려져 쓰이지 않는다
        setParcel({ ...parcel, state });
        setPhase("finished");
      } else {
        setError({ title: "결과를 읽지 못했어요", message: "반영됐을 수 있어요. QR 을 다시 스캔해 상자 상태를 확인해 주세요.", unknown: true });
      }
      return;
    }

    const found = await postInspect({ kind: "lookup", qr: code.value });
    setBusy(false);
    scan.current?.focus();
    if (found.kind === "failed") {
      setParcel(null);
      setError({ title: "상자를 불러오지 못했어요", message: found.message });
      return;
    }
    const next = parcelFromLookupBody(found.body);
    if (!next) {
      setParcel(null);
      setError({ title: "상자를 불러오지 못했어요", message: "잠시 뒤 다시 스캔해 주세요." });
      return;
    }
    setParcel(next);
    setChecks(next.kind === "gift" ? CLEAR_GIFT : CLEAR_REVGIFT);
    setOutcome("pass");
    setVerdictMissing(false);
    setPhase("form");
    setSavedAt(null);
    setFinished(null);
    // 신고 구간을 미리 골라 둔다(S4h) — 역조공은 실측이 없다
    setMeasuredTier(next.kind === "gift" ? initialMeasuredTier(next.tier) : null);
    setMeasurement(null);
  }

  /** 실측 구간 기록(payment INV-M11). 상자마다 한 번 — 두 번째는 서버가 거부한다. */
  async function saveMeasurement() {
    if (!parcel || busy || !measuredTier) return;
    setBusy(true);
    setError(null);
    const saved = await postInspect({ kind: "measure", qr: parcel.qr, tier: measuredTier });
    setBusy(false);
    // 성공·실패 모두 스캔 칸으로 — 다음 동작(검수 기록·QR 다시 스캔)이 스캐너에서 시작한다
    scan.current?.focus();
    if (saved.kind === "failed") {
      setError({ title: "실측을 기록하지 못했어요", message: saved.message });
      return;
    }
    const m = measurementFromBody(saved.body);
    if (!m) {
      setError({ title: "결과를 읽지 못했어요", message: "반영됐을 수 있어요. QR 을 다시 스캔해 상자 상태를 확인해 주세요.", unknown: true });
      return;
    }
    setMeasurement(m);
  }

  async function save() {
    if (!parcel || busy) return;
    if (openedMissing) {
      setError({ title: "개봉 결과를 먼저 골라 주세요", message: "개봉 대상 상자는 열어 본 결과를 같이 기록해야 해요.", local: true });
      document.getElementById(OPENED_FIRST_ID)?.focus();
      return;
    }
    const result = inspectionResultOf(checks, outcome);
    if (!result) {
      setError({ title: "추적기인지 먼저 골라 주세요", message: "블루투스·RF 반응이 나온 상자는 위치 추적기인지 판정해야 기록할 수 있어요.", local: true });
      setVerdictMissing(true);
      document.getElementById(VERDICT_FIRST_ID)?.focus();
      return;
    }
    setBusy(true);
    setError(null);
    const saved = await postInspect({ kind: "record", qr: parcel.qr, result });
    setBusy(false);
    if (saved.kind === "failed") {
      setError({ title: "기록을 저장하지 못했어요", message: saved.message });
      if (needsReload(saved)) {
        await reload(parcel.qr);
        router.refresh();
      }
      return;
    }
    setPhase("saved");
    setSavedAt(new Date().toISOString());
    scan.current?.focus();
  }

  const stepIndex = !parcel ? 0 : phase === "form" ? 1 : phase === "saved" ? 3 : 4;
  const steps = ["QR 스캔", "검수 기록", "기록 저장", "QR 다시 스캔해 검수 완료"];
  const announce = error
    ? `${error.unknown || error.local ? "확인 필요" : "거절"}: ${error.title}`
    : phase === "finished" && finished
      ? FINISHED[finished.state].title
      : phase === "saved"
        ? "검수 기록이 남았어요"
        : measurement
          ? `실측을 기록했어요. ${measurementText(measurement)}`
          : parcel
            ? `상자 불러옴 ${parcel.orderNo}`
            : "";

  return (
    <div className={w.work}>
      <ScanInput
        ref={scan}
        id="inspect-scan"
        label="내부 라벨 QR 스캔"
        placeholder="상자에 붙인 라벨 QR 을 읽혀 주세요"
        hint="입고하며 붙인 라벨의 QR 로만 상자를 불러와요. 기록을 저장한 뒤 같은 QR 을 한 번 더 읽히면 검수가 끝나요. 주문을 목록에서 고르는 칸은 없어요."
        busy={busy}
        onScan={onScan}
      />

      <ol className={w.steps} aria-label="검수 순서">
        {steps.map((label, i) => (
          <li key={label} className={i < stepIndex ? w.done : i === stepIndex ? w.now : undefined}>
            <b>{i + 1}</b>
            {label}
          </li>
        ))}
      </ol>

      <p className="sr-only" role="status">
        {announce}
      </p>
      <div className={w.work} style={{ maxWidth: "none" }}>
        {error && (
          <div className={`${w.result} ${w.resultNo} ${w.resultHeadSm}`}>
            <div className={w.resultHead}>
              <span className={`${a.tag} ${a.tagInk}`}>{error.unknown || error.local ? "확인 필요" : "거절"}</span>
              <h2>{error.title}</h2>
            </div>
            <p>
              {error.message}
              {error.unknown || error.local ? "" : " 상자 상태는 그대로예요."}
            </p>
          </div>
        )}

        {parcel && (
          <section className={w.result} aria-labelledby="inspect-box">
            <div className={w.resultHead}>
              <span className={`${a.tag} ${a.tagBrand}`}>상자 정보</span>
              <h2 id="inspect-box" className={a.mono}>
                {parcel.orderNo}
              </h2>
              <span className={a.tag}>{STATE_LABEL[parcel.state].text}</span>
            </div>
            <dl className={a.kv}>
              <dt>종류</dt>
              <dd>
                {parcel.kind === "gift" ? `${KIND_LABEL.gift} · ${TIER_LABEL[parcel.tier]}` : `${KIND_LABEL.revgift} (팬에게 가는 상자) · ${TIER_LABEL[parcel.tier]}`}
              </dd>
              <dt>보내는 사람</dt>
              <dd>
                {parcel.senderNickname} {parcel.kind === "gift" ? "(팬)" : "(크리에이터)"}
              </dd>
              <dt>{parcel.kind === "gift" ? "받는 크리에이터" : "받는 팬"}</dt>
              <dd>{parcel.receiverName}</dd>
              <dt>라벨</dt>
              <dd className={a.mono}>{parcel.qr}</dd>
            </dl>
            {openTarget && (
              <div className={`${a.note} ${w.noteWarn}`}>
                <InfoIcon />
                <p>
                  <strong>개봉 대상 — 추적기 판정 이력</strong>
                </p>
              </div>
            )}
            {!canInspect && phase !== "finished" && (
              <div className={a.note}>
                <InfoIcon />
                <p>
                  <strong>이 상자는 지금 검수 단계가 아니에요.</strong> {NEXT_STEP_TEXT[parcel.nextStep] || "할 일이 없어요."}
                </p>
              </div>
            )}
          </section>
        )}

        {/* 실측 구간(payment INV-M11) — 팬 선물만. 신고보다 크면 차액 결제 요청, 대형 초과면 검수 불합격 */}
        {parcel && canInspect && phase !== "finished" && parcel.kind === "gift" && (
          <form
            className={w.result}
            aria-labelledby="measure-form"
            onSubmit={(e) => {
              e.preventDefault();
              void saveMeasurement();
            }}
          >
            <h2 id="measure-form" className={w.formTitle}>
              실측 구간
            </h2>
            <fieldset className={w.choice} disabled={measurement !== null} aria-describedby="measure-hint">
              <legend>재어 본 크기·무게로 고른 구간</legend>
              <div className={w.opts}>
                {MEASURED_TIERS.map((t) => (
                  <label key={t} className={w.opt}>
                    <input type="radio" name="measured" value={t} checked={measuredTier === t} onChange={() => setMeasuredTier(t)} />
                    {t === parcel.tier ? `${TIER_LABEL[t]} (신고)` : TIER_LABEL[t]}
                  </label>
                ))}
              </div>
              <div id="measure-hint">
                <p className={a.hint}>
                  <strong>재어 본 뒤 맞으면 그대로 기록해요.</strong>
                </p>
                <p className={a.hint}>신고한 구간을 미리 골라 뒀어요. 다를 때만 바꿔요. 검수 완료 전에 꼭 「실측 기록」을 눌러요. 신고보다 크면 차액만 팬에게 따로 결제 요청돼요. 신고 이하면 차액도 환불도 없어요. 실측은 상자마다 한 번만 기록해요.</p>
              </div>
            </fieldset>
            {measurement ? (
              <div className={`${a.note} ${measurement.result === "none" ? a.noteOk : w.noteWarn}`}>
                <InfoIcon />
                <p>
                  <strong>실측을 기록했어요.</strong> {measurementText(measurement)}
                </p>
              </div>
            ) : (
              <div className={a.btnRow}>
                <button className={a.btn} type="submit" aria-disabled={busy || measuredTier === null}>
                  {busy ? "기록하는 중…" : "실측 기록"}
                </button>
              </div>
            )}
          </form>
        )}

        {parcel && canInspect && phase !== "finished" && (
          <form
            className={w.result}
            aria-labelledby="inspect-form"
            onSubmit={(e) => {
              e.preventDefault();
              void save();
            }}
          >
            <h2 id="inspect-form" className={w.formTitle}>
              검수 기록
            </h2>
            {checks.kind === "gift" ? (
              <div className={w.checkGrid}>
                <MarkChoice name="bt" legend="블루투스 검사" clearLabel="이상 없음" foundLabel="나옴" value={checks.bluetooth} disabled={phase !== "form"} onChange={(v) => updateChecks({ ...checks, bluetooth: v })} />
                <MarkChoice name="rf" legend="RF 검사" clearLabel="이상 없음" foundLabel="나옴" value={checks.rf} disabled={phase !== "form"} onChange={(v) => updateChecks({ ...checks, rf: v })} />
                <MarkChoice name="mt" legend="금속 검사" clearLabel="이상 없음" foundLabel="나옴" value={checks.metal} disabled={phase !== "form"} onChange={(v) => updateChecks({ ...checks, metal: v })} />
              </div>
            ) : (
              <div className={`${w.checkGrid} ${w.checkGrid2}`}>
                <MarkChoice name="out" legend="겉면 확인" clearLabel="이상 없음" foundLabel="훼손·이상 있음" value={checks.surface} disabled={phase !== "form"} onChange={(v) => updateChecks({ ...checks, surface: v })} />
                <MarkChoice name="ban" legend="금지 물품 확인" clearLabel="없음" foundLabel="나옴" value={checks.prohibited} disabled={phase !== "form"} onChange={(v) => updateChecks({ ...checks, prohibited: v })} />
              </div>
            )}

            {openTarget && checks.kind === "gift" && (
              <fieldset className={w.choice} disabled={phase !== "form"}>
                <legend>개봉 결과</legend>
                <div className={w.opts}>
                  {(["none", "device"] as const).map((v) => (
                    <label key={v} className={w.opt}>
                      <input
                        id={v === "none" ? OPENED_FIRST_ID : undefined}
                        type="radio"
                        name="opened"
                        value={v}
                        checked={checks.opened === v}
                        onChange={() => updateChecks({ ...checks, opened: v })}
                      />
                      {OPENED_LABEL[v]}
                    </label>
                  ))}
                </div>
              </fieldset>
            )}

            {reacted && checks.kind === "gift" && (
              <fieldset
                id="tracker-verdict"
                // aria-invalid 를 읽게 라디오 묶음 역할을 준다
                role="radiogroup"
                className={w.choice}
                disabled={phase !== "form"}
                aria-invalid={verdictMissing ? true : undefined}
                aria-describedby={verdictMissing ? "tracker-verdict-error tracker-verdict-hint" : "tracker-verdict-hint"}
              >
                <legend>{checks.bluetooth === "found" || checks.rf === "found" ? "추적기 판정 — 블루투스·RF 반응이 나왔어요" : "추적기 판정 — 개봉에서 장치가 나왔어요"}</legend>
                <div className={w.opts}>
                  {(["tracker", "not_tracker"] as const).map((v) => (
                    <label key={v} className={w.opt}>
                      <input
                        id={v === "tracker" ? VERDICT_FIRST_ID : undefined}
                        type="radio"
                        name="tracker"
                        value={v}
                        checked={checks.trackerVerdict === v}
                        onChange={() => updateChecks({ ...checks, trackerVerdict: v })}
                      />
                      {VERDICT_LABEL[v]}
                    </label>
                  ))}
                </div>
                {verdictMissing && (
                  <p id="tracker-verdict-error" className={a.errorLine}>
                    <span className={a.errorMark} aria-hidden="true">
                      !
                    </span>
                    위치 추적기인지 골라 주세요.
                  </p>
                )}
                <p id="tracker-verdict-hint" className={a.hint}>
                  에어태그·스마트태그 같은 위치 추적기인지 상자를 열어 확인해요. 고른 판정은 검수 기록에 같이 남아요.
                </p>
              </fieldset>
            )}

            {restriction && (
              <div className={`${a.note} ${w.noteWarn}`}>
                <InfoIcon />
                <p>
                  {restriction === "tracker_only" ? (
                    <>
                      <strong>위치 추적기라 「추적기 보관」만 고를 수 있어요.</strong> 사무실에 두고, 크리에이터에게 신고할지 묻는 알림이 가요.
                    </>
                  ) : restriction === "creator_confirm" ? (
                    <>
                      <strong>추적기가 아니어도 바로 통과하지 않아요.</strong> 「크리에이터 확인」을 고르면 크리에이터에게 받을지 묻고, {CREATOR_CHECK_DAYS}일 안에 답이 없으면 반송해요.
                    </>
                  ) : restriction === "needs_verdict" ? (
                    <strong>블루투스·RF 반응이 나왔어요. 위치 추적기인지 먼저 골라 주세요.</strong>
                  ) : (
                    <strong>겉면이나 금지 물품에 문제가 있어서 반송만 고를 수 있어요.</strong>
                  )}
                </p>
              </div>
            )}

            <fieldset className={w.choice} disabled={phase !== "form"}>
              <legend>검수 결과</legend>
              <div className={w.opts}>
                {(checks.kind === "gift" ? (["pass", "return", "hold", "confirm"] as const) : (["pass", "return"] as const)).map((o) => {
                  const off = !allowed.includes(o);
                  return (
                    <label key={o} className={off ? `${w.opt} ${w.optOff}` : w.opt}>
                      <input type="radio" name="res" value={o} checked={chosen === o} disabled={off} onChange={() => setOutcome(o)} />
                      {OUTCOME_LABEL[o]}
                    </label>
                  );
                })}
              </div>
              <p className={a.hint}>
                {restriction === "tracker_only"
                  ? "위치 추적기가 나온 상자는 보관 선반에 두고 크리에이터의 신고 선택을 기다려요."
                  : restriction === "creator_confirm"
                    ? "크리에이터 확인은 사무실에 둔 채 크리에이터의 답을 기다려요. 반송은 바로 반송 대기로 넘어가요."
                  : restriction === "return_only"
                    ? "문제가 나온 역조공 상자는 반송 대기로 넘어가요."
                    : restriction === "needs_verdict"
                      ? "추적기 판정을 먼저 고르면 결과를 고를 수 있어요."
                      : "통과하면 출고 단계로 넘어가요. 반송은 반송 대기로 넘어가요. 추적기 보관은 위치 추적기로 판정했을 때만 고를 수 있어요. 크리에이터 확인은 추적기가 아니라고 판정했을 때만 골라요."}
              </p>
            </fieldset>

            {phase === "form" && (
              <div className={a.btnRow}>
                <button className={`${a.btn} ${a.btnLg}`} type="submit" aria-disabled={busy}>
                  {busy ? "저장하는 중…" : "기록 저장"}
                </button>
                <span className={a.hint}>저장한 기록은 고치거나 지울 수 없어요. 시각과 담당자({operatorNickname})가 같이 남아요.</span>
              </div>
            )}
          </form>
        )}

        {parcel && phase === "saved" && savedAt && (
          <div className={`${w.result} ${w.resultOk}`}>
            <div className={`${w.resultHead} ${w.resultHeadSm}`}>
              <span className={`${a.tag} ${a.tagBrand}`}>기록 저장됨</span>
              <h2>검수 기록이 남았어요</h2>
              <span className={a.faint}>
                {formatStamp(savedAt)} · {operatorNickname}
              </span>
            </div>
            {chosen && <p>결과: {SAVED_TEXT[chosen]}</p>}
            <div className={w.nextStep}>
              <h3>마지막으로</h3>
              <p>상자의 라벨 QR 을 한 번 더 스캔하면 검수가 끝나고 다음 단계로 넘어가요.</p>
            </div>
          </div>
        )}

        {parcel && phase === "form" && canInspect && (
          <div className={a.note}>
            <InfoIcon />
            <p>
              <strong>검수 기록이 없으면 다음 단계로 넘어가지 않아요.</strong> 기록을 저장하기 전에 QR 을 다시 스캔하면 서버가 받지 않아요. 이미 저장한 상자라면 QR 을 한 번 더 스캔하세요.
            </p>
          </div>
        )}

        {parcel && phase === "finished" && finished && (
          <div className={`${w.result} ${w.resultOk}`}>
            <div className={w.resultHead}>
              <span className={`${a.tag} ${a.tagBrand}`}>검수 끝</span>
              <h2>{FINISHED[finished.state].title}</h2>
            </div>
            <p>{FINISHED[finished.state].text}</p>
            {finished.state === "held" && (
              <div className={`${a.note} ${a.noteOk}`}>
                <InfoIcon />
                <p>크리에이터({parcel.receiverName})에게 받을지 묻는 알림이 갔어요. 답이 올 때까지 상자는 검수 선반에 두세요.</p>
              </div>
            )}
            {finished.state === "tracker_held" && (
              <div className={`${a.note} ${a.noteOk}`}>
                <InfoIcon />
                <p>크리에이터({parcel.receiverName})에게 신고할지 묻는 알림이 갔어요. 상자는 보관 선반에 두세요.</p>
              </div>
            )}
            <p className={a.hint}>다음 상자를 스캔하세요.</p>
          </div>
        )}
      </div>
    </div>
  );
}
