"use client";

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { needsReload } from "@/entities/parcel/model/office-error";
import { DIFFERENCE_DEADLINE_DAYS } from "@/entities/payment/config/difference-deadline";
import { KIND_LABEL, NEXT_STEP_TEXT, STATE_LABEL, TIER_LABEL } from "@/entities/parcel/model/office-labels";
import { parcelFromLookupBody, type NextStep, type ParcelDetail } from "@/entities/parcel/model/office-parcel";
import { readScan } from "@/entities/parcel/model/scan-code";
import { formatStamp } from "@/shared/lib/format/datetime";
import a from "@/shared/ui/admin.module.css";
import { ScanInput, type ScanInputHandle } from "@/shared/ui/scan-input";
import w from "@/shared/ui/work.module.css";
import { postOutbound } from "../api/post-outbound-client";
import { canReprintLabel } from "../model/label-print-access";
import { printedReplyFromBody, returnPrintedReplyFromBody, type PrintedLabel } from "../model/outbound-reply";

// 출고 작업 화면 (office-workflow INV-W1·W3·W8, design-rules 8-1, 시안 admin/work-outbound.html).
// 라벨 QR 을 스캔하면 그 상자가 지금 할 수 있는 일만 나온다(다음 단계는 DB 가 정한 값). 봉투나 주문을 고르는 칸은 없다.
// 「송장 출력」「반송 송장 출력」은 방금 스캔한 그 상자에만 걸리는 버튼이다 — 다른 상자를 고를 수 없고, 출고·반송 확정은
// 출력된 송장 바코드를 스캔해야만 된다. 송장 출력은 대표만(직원에게는 버튼 대신 안내).
// 택배사 API·라벨 프린터가 아직 없어 송장번호는 서버가 만든 개발용 번호를 화면에 크게 보이고 화면 인쇄로 대신한다.
// 팬 선물은 송장 출력 함수가 연 받는 사람 주소(라벨 칸)를 응답으로 받아 인쇄에만 찍는다 — 화면에는 보이지 않고, 저장하지 않으며,
// 다른 상자를 스캔하거나 확정하면 버린다(address-protection INV-P4·P10).

type Done = { kind: "shipped" | "returned"; envelopeNo: string; at: string };
/** 방금 연 라벨 — 그 상자(qr)의 인쇄에만 쓴다 */
type OpenedLabel = { qr: string; waybill: string; fields: PrintedLabel };

function PrintLabel({ orderNo, opened }: { orderNo: string; opened: OpenedLabel }) {
  const f = opened.fields;
  return (
    <div className="print-only">
      <strong>받는 사람 {f.recipientName}</strong>
      <span>{f.phone}</span>
      <span>
        ({f.zipCode}) {f.address1} {f.address2}
      </span>
      <span>
        송장번호 {opened.waybill} · 주문번호 {orderNo}
      </span>
    </div>
  );
}

// 출고 안 되는 상자 중 「기다리는 중」 세 갈래의 제목과 안내. 차액 미납은 승인과 따로 안내한다 — 승인은 끝났는데
// 「승인을 기다려요」라고 하면 운영자가 크리에이터 쪽을 확인하러 간다.
type WaitStep = Extract<NextStep, "wait_approval" | "wait_difference" | "wait_accept">;
const WAIT_HEADING: Record<WaitStep, string> = {
  wait_approval: "크리에이터 승인을 기다리고 있어요",
  wait_difference: "팬의 차액 결제를 기다리고 있어요",
  wait_accept: "팬이 받기를 누르기 전이에요",
};
const WAIT_GUIDE: Record<WaitStep, string> = {
  wait_approval: "상자를 그대로 두세요. 승인이 나면 이 상자는 출고할 수 있게 돼요. 송장 출력 버튼은 나오지 않아요.",
  wait_difference: `상자를 그대로 두세요. 승인은 끝났고, 실측이 신고보다 커서 요청한 차액을 팬이 아직 내지 않았어요. 내면 출고할 수 있고, ${DIFFERENCE_DEADLINE_DAYS}일 안에 내지 않으면 반송 대기로 바뀌어요.`,
  wait_accept: "상자를 그대로 두세요. 팬이 받기를 하면 출고할 수 있어요. 기한 안에 받지 않으면 반송 대기로 바뀌어요.",
};

function InfoIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true">
      <circle cx="12" cy="12" r="9" />
      <path d="M12 11v5M12 7.5v.01" />
    </svg>
  );
}

function Facts({ parcel }: { parcel: ParcelDetail }) {
  return (
    <dl className={a.kv}>
      <dt>종류</dt>
      <dd>
        {parcel.kind === "gift" ? KIND_LABEL.gift : `${KIND_LABEL.revgift} (크리에이터 → 팬)`} · {TIER_LABEL[parcel.tier]}
      </dd>
      <dt>보내는 사람</dt>
      <dd>{parcel.senderNickname}</dd>
      <dt>{parcel.kind === "gift" ? "받는 크리에이터" : "받는 팬"}</dt>
      <dd>{parcel.receiverName}</dd>
      <dt>상태</dt>
      <dd>{STATE_LABEL[parcel.state].text}</dd>
    </dl>
  );
}

function WaybillBox({ label, waybill }: { label: string; waybill: string }) {
  return (
    <div className={`${w.qnum} ${w.qnumSm}`}>
      <span>
        <small>{label}</small>
        {waybill}
      </span>
    </div>
  );
}

export function OutboundWorkbench({ access, operatorNickname }: { access: "staff" | "owner"; operatorNickname: string }) {
  const router = useRouter();
  const scan = useRef<ScanInputHandle>(null);
  const [busy, setBusy] = useState(false);
  const [parcel, setParcel] = useState<ParcelDetail | null>(null);
  const [done, setDone] = useState<Done | null>(null);
  const [opened, setOpened] = useState<OpenedLabel | null>(null);
  const [error, setError] = useState<{ title: string; message: string; unknown?: true } | null>(null); // unknown: 서버는 반영했을 수 있는데 응답을 못 읽음

  /** quiet: 처리 뒤 다시 읽기 — 실패해도 거부 카드를 띄우지 않는다(앞 처리는 이미 됐다). 카드만 내린다. */
  async function lookup(qr: string, quiet = false): Promise<ParcelDetail | null> {
    const found = await postOutbound({ kind: "lookup", qr });
    if (found.kind === "failed") {
      if (!quiet) setError({ title: "상자를 불러오지 못했어요", message: found.message });
      return null;
    }
    const next = parcelFromLookupBody(found.body);
    if (!next && !quiet) setError({ title: "상자를 불러오지 못했어요", message: "잠시 뒤 다시 스캔해 주세요." });
    return next;
  }

  async function onScan(raw: string) {
    const code = readScan(raw);
    if (code.kind === "invalid") {
      setError({ title: "스캔한 값을 읽지 못했어요", message: "라벨 QR(Q-여섯 자리)이나 출력한 송장 바코드(숫자)를 다시 스캔해 주세요." });
      return;
    }
    setError(null);

    if (code.kind === "qr") {
      setBusy(true);
      const next = await lookup(code.value);
      setBusy(false);
      scan.current?.focus();
      setParcel(next);
      setDone(null);
      setOpened(null);
      return;
    }

    // 송장 바코드: 지금 불러온 상자가 확정을 기다릴 때만 그 상자의 확정으로 보낸다(INV-W1 — 송장번호가 이 상자 것인지는 DB 가 본다)
    if (!parcel || (parcel.nextStep !== "confirm_shipment" && parcel.nextStep !== "confirm_return")) {
      setError({ title: "먼저 라벨 QR 을 스캔해 주세요", message: "송장 바코드는 송장을 출력한 상자를 불러온 뒤에 읽혀요." });
      return;
    }
    const shipping = parcel.nextStep === "confirm_shipment";
    setBusy(true);
    const outcome = await postOutbound({ kind: shipping ? "confirm_shipment" : "confirm_return", qr: parcel.qr, waybill: code.value });
    setBusy(false);
    scan.current?.focus();
    if (outcome.kind === "failed") {
      setError({ title: outcome.reason === "wrong_code" ? "이 상자의 송장이 아니에요" : "반영되지 않았어요", message: outcome.message });
      if (needsReload(outcome)) {
        setParcel(await lookup(parcel.qr, true));
        router.refresh();
      }
      return;
    }
    setOpened(null);
    setDone({ kind: shipping ? "shipped" : "returned", envelopeNo: parcel.envelopeNo, at: new Date().toISOString() });
    setParcel(await lookup(parcel.qr, true));
  }

  async function print(kind: "print_label" | "print_return") {
    if (!parcel || busy) return;
    setBusy(true);
    setError(null);
    const outcome = await postOutbound({ kind, qr: parcel.qr });
    if (outcome.kind === "failed") {
      setError({ title: "출력하지 못했어요", message: outcome.message });
      if (needsReload(outcome)) {
        setParcel(await lookup(parcel.qr, true));
        router.refresh();
      }
      setBusy(false);
      return;
    }
    const printed = kind === "print_label" ? printedReplyFromBody(outcome.body) : null;
    const ok = kind === "print_label" ? printed : returnPrintedReplyFromBody(outcome.body);
    if (!ok) setError({ title: "출력 결과를 읽지 못했어요", message: "반영됐을 수 있어요. QR 을 다시 스캔해 상자 상태를 확인해 주세요.", unknown: true });
    setOpened(printed?.label ? { qr: parcel.qr, waybill: printed.waybill, fields: printed.label } : null);
    // 출력 뒤 상태는 DB 에서 다시 읽는다 — 화면이 상태를 짐작해 바꾸지 않는다
    setParcel(await lookup(parcel.qr, true));
    setBusy(false);
    scan.current?.focus();
  }

  return (
    <div className={w.work}>
      <ScanInput
        ref={scan}
        id="outbound-scan"
        label="내부 라벨 QR 스캔"
        placeholder="상자에 붙인 라벨 QR 을 읽혀 주세요"
        hint="QR 을 읽으면 그 상자가 지금 할 수 있는 일만 나와요. 송장을 붙인 뒤에는 출력된 송장 바코드를 여기에 읽혀요. 봉투나 주문을 고르는 칸은 없어요."
        busy={busy}
        onScan={onScan}
      />

      <p className="sr-only" role="status">
        {error ? `${error.unknown ? "확인 필요" : "거부"}: ${error.title}` : done ? (done.kind === "shipped" ? "출고 확정됐어요" : "반송 확정됐어요") : parcel ? `${parcel.orderNo} ${NEXT_STEP_TEXT[parcel.nextStep] || STATE_LABEL[parcel.state].text}` : ""}
      </p>
      <div className={w.work} style={{ maxWidth: "none" }}>
        {error && (
          <div className={`${w.result} ${w.resultNo} ${w.resultHeadSm}`}>
            <div className={w.resultHead}>
              <span className={`${a.tag} ${a.tagInk}`}>{error.unknown ? "확인 필요" : "거부"}</span>
              <h2>{error.title}</h2>
            </div>
            <p>
              {error.message}
              {error.unknown ? "" : " 상자 상태는 그대로예요."}
            </p>
          </div>
        )}

        {done && (
          <div className={`${w.result} ${w.resultOk}`}>
            <div className={`${w.resultHead} ${w.resultHeadSm}`}>
              <span className={`${a.tag} ${a.tagBrand}`}>{done.kind === "shipped" ? "출고 확정" : "반송 확정"}</span>
              <h2>{done.kind === "shipped" ? "출고 확정됐어요" : "반송 확정됐어요"}</h2>
              <span className={a.faint}>
                {formatStamp(done.at)} · {operatorNickname}
              </span>
            </div>
            <p className={w.bigNote}>
              봉투 <span className={a.mono}>{done.envelopeNo}</span> 파쇄 기록됨 — 봉투를 파쇄해 주세요
            </p>
            <p className={a.hint}>{done.kind === "shipped" ? "출고" : "반송"} 확정과 함께 파쇄 기록이 남았어요. 봉투 안의 원 송장을 파쇄하면 돼요.</p>
          </div>
        )}

        {parcel && !done && <ParcelCard parcel={parcel} access={access} busy={busy} onPrint={print} opened={opened?.qr === parcel.qr ? opened : null} />}
      </div>
    </div>
  );
}

type CardProps = {
  parcel: ParcelDetail;
  access: "staff" | "owner";
  busy: boolean;
  onPrint: (kind: "print_label" | "print_return") => void;
  opened: OpenedLabel | null;
};

function ParcelCard({ parcel, access, busy, onPrint, opened }: CardProps) {
  switch (parcel.nextStep) {
    case "print_label":
      return (
        <section className={`${w.result} ${w.resultOk}`} aria-labelledby="out-ready">
          <div className={w.resultHead}>
            <span className={`${a.tag} ${a.tagBrand}`}>출고 조건 충족</span>
            <h2 id="out-ready" className={a.mono}>
              {parcel.orderNo}
            </h2>
          </div>
          <Facts parcel={parcel} />
          <ul className={a.checks}>
            {(parcel.kind === "gift" ? ["크리에이터 승인 있음", "검수 완료", "차액 미납 없음"] : ["팬이 받기를 함", "검수 완료"]).map((t) => (
              <li key={t}>
                <span className={a.mk} aria-hidden="true">
                  ✓
                </span>
                {t}
              </li>
            ))}
          </ul>
          {access === "owner" ? (
            <div>
              <div className={a.btnRow}>
                <button className={`${a.btn} ${a.btnLg}`} type="button" onClick={() => onPrint("print_label")} aria-disabled={busy}>
                  {busy ? "출력하는 중…" : "송장 출력"}
                </button>
              </div>
              <p className={a.hint} style={{ marginTop: 6 }}>
                받는 사람의 주소는 화면에 보이지 않고 송장에만 찍혀요. 주소는 송장을 출력할 때만 열려요(이 상자는 다시 출력 포함 최대 3번).
              </p>
            </div>
          ) : (
            <div className={`${a.note} ${w.noteWarn}`}>
              <InfoIcon />
              <p>
                <strong>송장 출력은 대표만 할 수 있어요.</strong> 이 상자를 대표에게 넘겨 주세요. 상자 상태는 그대로예요.
              </p>
            </div>
          )}
        </section>
      );

    case "confirm_shipment":
      return (
        <section className={`${w.result} ${w.resultOk}`} aria-labelledby="out-printed">
          <div className={w.resultHead}>
            <span className={`${a.tag} ${a.tagBrand}`}>송장 출력함</span>
            <h2 id="out-printed" className={a.mono}>
              {parcel.orderNo}
            </h2>
          </div>
          <Facts parcel={parcel} />
          {parcel.outboundWaybillNo && <WaybillBox label="출력한 송장번호 (개발용 — 택배사 연동 전)" waybill={parcel.outboundWaybillNo} />}
          <div className={w.nextStep}>
            <h3>송장이 출력됐어요</h3>
            <p>
              상자에 송장을 붙인 뒤, <strong>출력된 송장의 바코드</strong>를 스캔하면 출고가 확정돼요. 위 스캔 칸을 쓰세요.
            </p>
            {opened ? (
              <>
                <PrintLabel orderNo={parcel.orderNo} opened={opened} />
                <div className={a.btnRow}>
                  <button className={`${a.btn} ${a.btnLine} ${a.btnSm}`} type="button" onClick={() => window.print()}>
                    송장 인쇄
                  </button>
                </div>
                <p className={a.hint}>받는 사람 주소는 화면에 보이지 않고 인쇄에만 찍혀요. 다른 상자를 스캔하면 지워져요.</p>
              </>
            ) : (
              <div className={a.btnRow}>
                <button className={`${a.btn} ${a.btnLine} ${a.btnSm}`} type="button" onClick={() => window.print()}>
                  화면 인쇄
                </button>
                {canReprintLabel(access) && (
                  <button className={`${a.btn} ${a.btnLine} ${a.btnSm}`} type="button" onClick={() => onPrint("print_label")} aria-disabled={busy}>
                    {busy ? "출력하는 중…" : "송장 다시 출력"}
                  </button>
                )}
              </div>
            )}
            {!opened && canReprintLabel(access) && (
              <p className={a.hint}>프린터가 걸렸거나 라벨이 망가졌을 때만 다시 출력해요. 다시 출력하면 주소를 한 번 더 열고 열람 기록에 남아요(첫 출력 포함 최대 3번).</p>
            )}
          </div>
        </section>
      );

    case "print_return":
      return (
        <section className={`${w.result} ${w.resultOk}`} aria-labelledby="out-return">
          <div className={w.resultHead}>
            <span className={`${a.tag} ${a.tagWarn}`}>반송 대기</span>
            <h2 id="out-return" className={a.mono}>
              {parcel.orderNo}
            </h2>
          </div>
          <Facts parcel={parcel} />
          <p className={a.hint}>{parcel.kind === "gift" ? "보낸 팬의 원 송장 주소로 반송해요. 택배비는 팬꾹이 먼저 내요(선불) — 환불에서 빠져요." : "보낸 크리에이터 쪽으로 반송해요."}</p>
          <div className={a.btnRow}>
            <button className={`${a.btn} ${a.btnLg}`} type="button" onClick={() => onPrint("print_return")} aria-disabled={busy}>
              {busy ? "출력하는 중…" : "반송 송장 출력"}
            </button>
          </div>
        </section>
      );

    case "confirm_return":
      return (
        <section className={`${w.result} ${w.resultOk}`} aria-labelledby="out-return-printed">
          <div className={w.resultHead}>
            <span className={`${a.tag} ${a.tagWarn}`}>반송 송장 출력함</span>
            <h2 id="out-return-printed" className={a.mono}>
              {parcel.orderNo}
            </h2>
          </div>
          <div className={w.qnum}>
            <span>
              <small>이 상자의 원 송장 봉투 번호</small>
              {parcel.envelopeNo}
            </span>
          </div>
          {parcel.returnWaybillNo && <WaybillBox label="반송 송장번호 (개발용 — 택배사 연동 전)" waybill={parcel.returnWaybillNo} />}
          <div className={w.nextStep}>
            <h3>이렇게 하세요</h3>
            <p>
              화면에 뜬 번호의 봉투에서 원 송장을 꺼내 반송 송장을 붙여요. 봉투 번호는 이 상자 것만 나와요. 붙인 뒤 <strong>반송 송장의 바코드</strong>를 스캔하면 반송이 확정돼요.
            </p>
            <div className={a.btnRow}>
              <button className={`${a.btn} ${a.btnLine} ${a.btnSm}`} type="button" onClick={() => window.print()}>
                화면 인쇄
              </button>
            </div>
          </div>
        </section>
      );

    case "wait_expiry":
      return (
        <section className={`${w.result} ${w.resultNo}`} aria-labelledby="out-expiry">
          <div className={w.resultHead}>
            <span className={`${a.tag} ${a.tagInk}`}>출고 안 됨</span>
            <h2 id="out-expiry">자동 처리 대기(반송 예정)</h2>
          </div>
          <dl className={a.kv}>
            <dt>주문번호</dt>
            <dd className={a.mono}>{parcel.orderNo}</dd>
            <dt>상태</dt>
            <dd>{STATE_LABEL[parcel.state].text}</dd>
          </dl>
          <div className={w.nextStep}>
            <h3>이렇게 하세요</h3>
            <p>상자를 그대로 두세요. 거절·반려됐거나 받지 않은 상자예요. 자동 처리가 돌면 반송 대기로 바뀌고, 그때 QR 을 스캔하면 반송 송장이 나와요.</p>
          </div>
        </section>
      );

    case "wait_approval":
    case "wait_difference":
    case "wait_accept":
      return (
        <section className={`${w.result} ${w.resultNo}`} aria-labelledby="out-wait">
          <div className={w.resultHead}>
            <span className={`${a.tag} ${a.tagInk}`}>출고 안 됨</span>
            <h2 id="out-wait">{WAIT_HEADING[parcel.nextStep]}</h2>
          </div>
          <dl className={a.kv}>
            <dt>주문번호</dt>
            <dd className={a.mono}>{parcel.orderNo}</dd>
            <dt>{parcel.kind === "gift" ? "받는 크리에이터" : "받는 팬"}</dt>
            <dd>{parcel.receiverName}</dd>
            <dt>상태</dt>
            <dd>{STATE_LABEL[parcel.state].text}</dd>
          </dl>
          <div className={w.nextStep}>
            <h3>이렇게 하세요</h3>
            <p>
              {WAIT_GUIDE[parcel.nextStep]}
            </p>
          </div>
        </section>
      );

    default:
      // INV-P5 (2026-10-10): 출고 확정된 팬 선물 상자도 택배 기사가 가져가기 전이면 남은 횟수 안에서 대표가 다시 출력한다
      if (parcel.kind === "gift" && parcel.state === "shipped" && canReprintLabel(access)) {
        return (
          <section className={w.result} aria-labelledby="out-shipped">
            <div className={w.resultHead}>
              <span className={`${a.tag} ${a.tagBrand}`}>출고 확정</span>
              <h2 id="out-shipped" className={a.mono}>
                {parcel.orderNo}
              </h2>
            </div>
            <Facts parcel={parcel} />
            {parcel.outboundWaybillNo && <WaybillBox label="출력한 송장번호 (개발용 — 택배사 연동 전)" waybill={parcel.outboundWaybillNo} />}
            <div className={w.nextStep}>
              {opened ? (
                <>
                  <PrintLabel orderNo={parcel.orderNo} opened={opened} />
                  <div className={a.btnRow}>
                    <button className={`${a.btn} ${a.btnLine} ${a.btnSm}`} type="button" onClick={() => window.print()}>
                      송장 인쇄
                    </button>
                  </div>
                  <p className={a.hint}>받는 사람 주소는 화면에 보이지 않고 인쇄에만 찍혀요. 송장번호는 처음 것과 같아요.</p>
                </>
              ) : (
                <>
                  <h3>출고 확정된 상자예요</h3>
                  <p>택배 기사가 가져가기 전에 송장이 젖거나 망가졌을 때만 다시 출력해요. 송장번호는 처음 것 그대로예요.</p>
                  <div className={a.btnRow}>
                    <button className={`${a.btn} ${a.btnLine} ${a.btnSm}`} type="button" onClick={() => onPrint("print_label")} aria-disabled={busy}>
                      {busy ? "출력하는 중…" : "송장 다시 출력"}
                    </button>
                  </div>
                  <p className={a.hint}>다시 출력하면 주소를 한 번 더 열고 열람 기록에 남아요(첫 출력 포함 최대 3번).</p>
                </>
              )}
            </div>
          </section>
        );
      }
      return (
        <section className={w.result} aria-labelledby="out-other">
          <div className={w.resultHead}>
            <span className={a.tag}>{STATE_LABEL[parcel.state].text}</span>
            <h2 id="out-other" className={a.mono}>
              {parcel.orderNo}
            </h2>
          </div>
          <Facts parcel={parcel} />
          <div className={a.note}>
            <InfoIcon />
            <p>
              <strong>출고 화면에서 할 일이 없어요.</strong> {NEXT_STEP_TEXT[parcel.nextStep] || "이미 끝난 상자예요."}
            </p>
          </div>
        </section>
      );
  }
}
