"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { CARRIER_LABEL, CARRIERS, isCarrier, type Carrier } from "@/entities/parcel/model/carrier";
import { needsReload } from "@/entities/parcel/model/office-error";
import { HOLD_REASON_LABEL, KIND_LABEL, TIER_LABEL } from "@/entities/parcel/model/office-labels";
import type { HoldReason, PendingLabel } from "@/entities/parcel/model/office-lists";
import type { ParcelDetail } from "@/entities/parcel/model/office-parcel";
import { readScan } from "@/entities/parcel/model/scan-code";
import { formatWaybill } from "@/entities/parcel/model/waybill-no";
import { formatStamp } from "@/shared/lib/format/datetime";
import a from "@/shared/ui/admin.module.css";
import { ScanInput, type ScanInputHandle } from "@/shared/ui/scan-input";
import w from "@/shared/ui/work.module.css";
import { postInbound } from "../api/post-inbound-client";
import { inboundReplyFromBody } from "../model/inbound-reply";
import { SENDER_NAME_MAX, SHELF_MAX } from "../model/scan-inbound";

// 입고 작업 화면 (office-workflow INV-W1·W2·W5·W7, inbound-address-code INV-C1·C5, design-rules 8-1, 시안 admin/work-inbound.html).
// 순서: 원 송장 바코드 스캔 → 받는 주소 끝 6자리 입력(대소문자 상관없음) → 입고 완료 + 라벨 1장, 또는 보류.
//   6자리가 틀리면(20자 밖 글자·확인 문자 불일치) 서버가 거부하고 상태는 그대로다 — 6자리 칸을 비우고 그 자리에서 다시 입력받는다.
//   6자리가 없거나 보류로 가야 하면 택배사·원 송장 「보내는 분」에 적힌 이름 그대로·선반 번호를 받아 보류로 기록한다.
//   그 이름은 서버가 팬꾹 닉네임과 비교만 하고 저장하지 않는다 — 결과 카드에 닉네임 일치(그 닉네임) 또는 닉네임 없음만 보인다(INV-C5·W7, 카드 d94).
// 스캔 칸: 숫자 송장이면 새 상자, Q-번호면 라벨 부착 확인. 상태를 고르거나 주문번호를 넣는 칸은 없다.
// 부착 대기 라벨 줄은 서버가 준 값(이 작업자의 대기 라벨)으로 시작하고, 스캔 결과로 바뀐다.
// 아래 표는 이 화면을 연 뒤 처리한 상자만 보인다(오늘 전체 기록을 읽는 함수는 아직 없다).

type Card =
  | { kind: "received"; qr: string; orderNo: string; parcel: ParcelDetail | null; at: string; reprinted: boolean }
  | { kind: "labeled"; orderNo: string | null } // null: 이 화면이 모르는 라벨이라 주문번호를 알 수 없음
  | { kind: "code"; barcode: string; at: string; error: string | null }
  // field: 화면이 틀렸다고 본 칸(그 칸에 오류를 잇고 초점을 옮긴다). 서버가 거부한 값은 어느 칸인지 몰라 비워 둔다
  | { kind: "details"; barcode: string; code: string; reason: HoldReason; at: string; error: string | null; field?: DetailsField | null }
  | { kind: "hold_saved"; reason: HoldReason; shelf: string; nickname: string | null }
  | { kind: "hold_recorded" }
  // unknown: 서버는 반영했을 수 있는데 응답을 못 읽음 — 「반영되지 않았어요」라고 말하면 안 된다
  | { kind: "rejected"; title: string; message: string; unknown?: true };

/** 화면 읽기 프로그램이 읽는 한 줄 — 결과 카드의 제목만. 부착 대기 줄·양식은 따로 알리지 않는다. */
function announceOf(card: Card | null): string {
  if (!card) return "";
  switch (card.kind) {
    case "received":
      return card.reprinted ? "라벨을 다시 냈어요" : `입고 완료 ${card.orderNo}`;
    case "labeled":
      return `라벨 붙임 확인 ${card.orderNo}`;
    case "code":
      return card.error ? `다시 입력: ${card.error}` : "받는 주소 끝 6자리를 입력하세요";
    case "details":
      return card.error ? `보류 기록 안 됨: ${card.error}` : "보류로 넣을 값을 적어 주세요";
    case "hold_saved":
      return card.nickname ? `보류로 기록했어요 · 닉네임 일치 ${card.nickname}` : "보류로 기록했어요 · 닉네임 없음";
    case "hold_recorded":
      return "이미 보류로 기록된 상자예요";
    case "rejected":
      return `${card.unknown ? "확인 필요" : "거절"}: ${card.title}`;
  }
}

type DetailsField = "carrier" | "sender";

type Recent = { at: string; orderNo: string; kindText: string; resultText: string };

type Props = { initialPending: PendingLabel | null; operatorNickname: string };

function InfoIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true">
      <circle cx="12" cy="12" r="9" />
      <path d="M12 11v5M12 7.5v.01" />
    </svg>
  );
}

function ErrorLine({ id, message }: { id: string; message: string }) {
  return (
    <p className={a.errorLine} id={id}>
      <span className={a.errorMark} aria-hidden="true">
        !
      </span>
      {message}
    </p>
  );
}

function timeOnly(iso: string): string {
  return formatStamp(iso).slice(6);
}

export function InboundWorkbench({ initialPending, operatorNickname }: Props) {
  const router = useRouter();
  const scan = useRef<ScanInputHandle>(null);
  const codeInput = useRef<HTMLInputElement>(null);
  const carrierSelect = useRef<HTMLSelectElement>(null);
  const senderInput = useRef<HTMLInputElement>(null);
  const [pending, setPending] = useState<PendingLabel | null>(initialPending);
  const [seenInitial, setSeenInitial] = useState(initialPending);
  const [busy, setBusy] = useState(false);
  const [card, setCard] = useState<Card | null>(null);
  const [recent, setRecent] = useState<Recent[]>([]);
  const [code, setCode] = useState("");
  const [carrier, setCarrier] = useState<Carrier | "">("");
  const [senderName, setSenderName] = useState("");
  const [shelf, setShelf] = useState("");

  // 화면을 다시 읽으면(router.refresh) 서버가 준 대기 라벨로 맞춘다
  if (initialPending !== seenInitial) {
    setSeenInitial(initialPending);
    setPending(initialPending);
  }

  // 바코드를 읽었거나 6자리가 거부되면 6자리 칸으로 커서를 옮긴다 — 직원이 바로 다시 입력하게
  const codeFocusKey = card?.kind === "code" ? `${card.barcode}|${card.error ?? ""}` : null;
  useEffect(() => {
    if (codeFocusKey) codeInput.current?.focus();
  }, [codeFocusKey]);

  // 보류 양식이 뜨거나 양식 오류가 나면 첫 칸(택배사)으로 커서를 옮긴다 — 키보드·화면 읽기 사용자가 양식 위치를 찾지 않게
  //   틀린 칸이 정해져 있으면 그 칸으로
  const detailsField = card?.kind === "details" ? (card.field ?? null) : null;
  const detailsFocusKey = card?.kind === "details" ? `${card.barcode}|${card.error ?? ""}|${detailsField ?? ""}` : null;
  useEffect(() => {
    if (!detailsFocusKey) return;
    if (detailsField === "sender") senderInput.current?.focus();
    else carrierSelect.current?.focus();
  }, [detailsFocusKey, detailsField]);

  function addRecent(row: Recent) {
    setRecent((rows) => [row, ...rows].slice(0, 20));
  }

  function reject(title: string, message: string, unknown?: true) {
    setCard(unknown ? { kind: "rejected", title, message, unknown } : { kind: "rejected", title, message });
  }

  async function onScan(raw: string) {
    const scanned = readScan(raw);
    if (scanned.kind === "invalid") {
      reject("스캔한 값을 읽지 못했어요", "택배 송장 바코드(숫자 10~14자리)나 라벨 QR(Q-여섯 자리)을 다시 스캔해 주세요.");
      return;
    }
    if (scanned.kind === "waybill") {
      // 라벨 부착 대기 중이면 서버가 다음 상자를 받지 않는다(P0042) — 6자리를 적게 하기 전에 막는다
      if (pending) {
        reject("앞 상자 라벨을 붙였는지 먼저 확인하세요", "앞 상자 라벨을 붙였는지 먼저 확인해 주세요.");
        return;
      }
      setCode("");
      setCard({ kind: "code", barcode: scanned.value, at: new Date().toISOString(), error: null });
      return;
    }
    setBusy(true);
    const outcome = await postInbound({ kind: "label", qr: scanned.value });
    setBusy(false);
    scan.current?.focus();
    if (outcome.kind === "failed") {
      if (outcome.reason === "pending_label") reject("앞 상자 라벨을 붙였는지 먼저 확인하세요", outcome.message);
      else if (outcome.reason === "wrong_step") reject("이미 처리된 상자예요", outcome.message);
      else reject("반영되지 않았어요", outcome.message);
      if (needsReload(outcome)) router.refresh();
      return;
    }
    const orderNo = pending?.qr === scanned.value ? pending.orderNo : null;
    setPending(null);
    setCard({ kind: "labeled", orderNo });
    addRecent({ at: new Date().toISOString(), orderNo: orderNo ?? "—", kindText: "—", resultText: "라벨 붙임 확인" });
  }

  /** 바코드 + 6자리(없으면 빈칸) + 보류용 값(있으면)을 보낸다 */
  async function submitInbound(barcode: string, at: string, typedCode: string, details: { carrier: Carrier; senderName: string; shelf: string } | null) {
    if (busy) return;
    setBusy(true);
    const outcome = await postInbound(details ? { kind: "inbound", barcode, code: typedCode, ...details } : { kind: "inbound", barcode, code: typedCode });
    setBusy(false);

    if (outcome.kind === "failed") {
      // INV-C1·C5: 6자리가 틀림 — 상태는 그대로, 그 자리에서 다시 입력
      if (outcome.reason === "code_format" || outcome.reason === "code_check") {
        setCode("");
        setCard({ kind: "code", barcode, at, error: outcome.message });
        return;
      }
      if (details) {
        setCard({ kind: "details", barcode, code: typedCode, reason: card?.kind === "details" ? card.reason : "no_code", at, error: outcome.message });
        if (needsReload(outcome)) router.refresh();
        return;
      }
      scan.current?.focus();
      if (outcome.reason === "pending_label") reject("앞 상자 라벨을 붙였는지 먼저 확인하세요", outcome.message);
      else if (outcome.reason === "wrong_step") reject("이미 처리된 상자예요", outcome.message);
      else reject("반영되지 않았어요", outcome.message);
      if (needsReload(outcome)) router.refresh();
      return;
    }

    const reply = inboundReplyFromBody(outcome.body);
    if (!reply) {
      scan.current?.focus();
      reject("결과를 읽지 못했어요", "반영됐을 수 있어요. 위의 붙이기 대기 줄에 이 상자의 라벨이 나왔는지 확인해 주세요.", true);
      router.refresh();
      return;
    }
    const now = new Date().toISOString();
    if (reply.result === "need_details") {
      setCarrier("");
      setSenderName("");
      setShelf("");
      setCard({ kind: "details", barcode, code: typedCode, reason: reply.reason, at, error: null });
      return;
    }
    scan.current?.focus();
    if (reply.result === "hold_recorded") {
      setCard({ kind: "hold_recorded" });
      return;
    }
    if (reply.result === "hold") {
      const savedShelf = details?.shelf.trim() ?? "";
      setCard({ kind: "hold_saved", reason: reply.reason, shelf: savedShelf, nickname: reply.nickname });
      addRecent({ at: now, orderNo: "보류", kindText: "—", resultText: `보류 · ${savedShelf}` });
      return;
    }
    setPending({ qr: reply.qr, orderNo: reply.orderNo });
    setCard({ kind: "received", qr: reply.qr, orderNo: reply.orderNo, parcel: reply.parcel, at: now, reprinted: reply.result === "reprinted" });
    addRecent({ at: now, orderNo: reply.orderNo, kindText: reply.parcel ? KIND_LABEL[reply.parcel.kind] : "—", resultText: "입고 완료" });
  }

  return (
    <div className={w.work}>
      <div className={pending ? `${w.pendingLine} ${w.pendingOn}` : w.pendingLine}>
        <span className={w.dot} aria-hidden="true" />
        <span>
          {pending
            ? `붙이기를 기다리는 라벨 1장 · ${pending.orderNo} (${pending.qr}) — 라벨 QR 을 스캔해 붙임을 확인하기 전에는 다음 상자를 입고할 수 없어요`
            : "붙이기를 기다리는 라벨 없음 — 다음 상자를 스캔해도 돼요"}
        </span>
      </div>

      <ScanInput
        ref={scan}
        id="inbound-scan"
        label={pending ? "라벨 QR 스캔 (붙임 확인)" : "원래 송장 바코드 스캔"}
        placeholder="스캐너로 읽으면 여기에 들어가요"
        hint="상자에 붙은 택배 송장 바코드를 스캐너로 읽은 뒤, 받는 주소 끝 6자리를 입력해요. 라벨을 붙였으면 라벨 QR 을 읽혀요. 주문번호나 상태를 손으로 고르는 칸은 없어요."
        busy={busy}
        onScan={onScan}
      />

      <p className="sr-only" role="status">
        {announceOf(card)}
      </p>
      <div>
        {card?.kind === "code" && (
          <section className={w.result} aria-labelledby="inbound-code">
            <div className={w.resultHead}>
              <span className={`${a.tag} ${a.tagBrand}`}>2단계</span>
              <h2 id="inbound-code">받는 주소 끝 6자리 입력</h2>
              <span className={`${a.faint} ${a.mono}`}>송장 {formatWaybill(card.barcode)}</span>
            </div>
            <form
              className={w.scan}
              aria-label="받는 주소 6자리 입력"
              noValidate
              onSubmit={(e) => {
                e.preventDefault();
                void submitInbound(card.barcode, card.at, code, null);
              }}
            >
              <label htmlFor="inbound-code-input">원래 송장의 받는 주소 맨 끝 6자리</label>
              <div className={w.scanRow}>
                <input
                  ref={codeInput}
                  id="inbound-code-input"
                  className={a.mono}
                  type="text"
                  autoComplete="off"
                  autoCapitalize="characters"
                  spellCheck={false}
                  maxLength={12}
                  placeholder="예: K7M3XA"
                  value={code}
                  onChange={(e) => setCode(e.target.value.toUpperCase())}
                  aria-invalid={card.error ? true : undefined}
                  aria-describedby={card.error ? "inbound-code-error inbound-code-hint" : "inbound-code-hint"}
                />
                <button className={`${a.btn} ${a.btnLg}`} type="submit" aria-disabled={busy}>
                  {busy ? "확인하는 중…" : "입고"}
                </button>
              </div>
              {card.error && <ErrorLine id="inbound-code-error" message={card.error} />}
              <p id="inbound-code-hint" className={w.scanHint}>
                소문자로 쳐도 돼요. 0·O·1·I·5·S·8·B 같은 헷갈리는 글자는 쓰지 않아요.
              </p>
            </form>
            <div className={a.btnRow}>
              <button className={`${a.btn} ${a.btnLine}`} type="button" aria-disabled={busy} onClick={() => void submitInbound(card.barcode, card.at, "", null)}>
                받는 주소 끝에 6자리가 없어요
              </button>
            </div>
          </section>
        )}

        {card?.kind === "details" && (
          <section className={w.result} aria-labelledby="inbound-details">
            <div className={w.resultHead}>
              <span className={`${a.tag} ${a.tagWarn}`}>보류</span>
              <h2 id="inbound-details">이 상자는 보류로 들어가요</h2>
              <span className={`${a.faint} ${a.mono}`}>송장 {formatWaybill(card.barcode)}</span>
            </div>
            <p>
              사유: <strong>{HOLD_REASON_LABEL[card.reason]}</strong>
            </p>
            <form
              className={w.two}
              aria-label="보류 기록"
              noValidate
              onSubmit={(e) => {
                e.preventDefault();
                if (!carrier) {
                  setCard({ ...card, error: "택배사를 골라 주세요.", field: "carrier" });
                  return;
                }
                if (!senderName.trim()) {
                  setCard({ ...card, error: "송장의 보내는 분 이름을 적어 주세요.", field: "sender" });
                  return;
                }
                void submitInbound(card.barcode, card.at, card.code, { carrier, senderName, shelf });
              }}
            >
              <div className={a.field}>
                <label htmlFor="h-carrier">택배사</label>
                <select
                  ref={carrierSelect}
                  className={a.input}
                  id="h-carrier"
                  value={carrier}
                  onChange={(e) => setCarrier(isCarrier(e.target.value) ? e.target.value : "")}
                  aria-invalid={card.field === "carrier" ? true : undefined}
                  aria-describedby={card.field === "carrier" ? "h-error" : undefined}
                >
                  <option value="">고르세요</option>
                  {CARRIERS.map((c) => (
                    <option key={c} value={c}>
                      {CARRIER_LABEL[c]}
                    </option>
                  ))}
                </select>
              </div>
              <div className={a.field}>
                <label htmlFor="h-sender">송장의 보내는 분</label>
                <input
                  ref={senderInput}
                  className={a.input}
                  id="h-sender"
                  maxLength={SENDER_NAME_MAX}
                  placeholder="예: 별빛"
                  autoComplete="off"
                  value={senderName}
                  onChange={(e) => setSenderName(e.target.value)}
                  aria-invalid={card.field === "sender" ? true : undefined}
                  aria-describedby={card.field === "sender" ? "h-error h-sender-hint" : "h-sender-hint"}
                />
                <p id="h-sender-hint" className={a.hint}>
                  송장에 적힌 이름을 그대로 적어요. 닉네임과 맞는지만 보고 이름은 남기지 않아요. 주소·전화는 적지 않아요.
                </p>
              </div>
              <div className={a.field}>
                <label htmlFor="h-shelf">보관 선반 번호</label>
                <input className={`${a.input} ${a.mono}`} id="h-shelf" maxLength={SHELF_MAX} placeholder="예: A-03" autoComplete="off" value={shelf} onChange={(e) => setShelf(e.target.value)} />
              </div>
              <div className={a.field}>
                <label htmlFor="h-time">들어온 시각</label>
                <input className={`${a.input} ${a.mono}`} id="h-time" value={`${formatStamp(card.at)} (자동)`} readOnly />
              </div>
              <div className={a.btnRow}>
                <button className={`${a.btn} ${a.btnLg}`} type="submit" aria-disabled={busy}>
                  {busy ? "기록하는 중…" : "보류로 기록"}
                </button>
              </div>
            </form>
            <div role="status">{card.error && <ErrorLine id="h-error" message={card.error} />}</div>
          </section>
        )}

        {card?.kind === "received" && (
          <section className={`${w.result} ${w.resultOk}`} aria-labelledby="inbound-received">
            <div className={w.resultHead}>
              <span className={`${a.tag} ${a.tagBrand}`}>스캔 결과</span>
              <h2 id="inbound-received">{card.reprinted ? "라벨을 다시 냈어요" : "입고 완료"}</h2>
              <span className={a.faint}>
                {formatStamp(card.at)} · {operatorNickname}
              </span>
            </div>
            <dl className={a.kv}>
              <dt>주문번호</dt>
              <dd className={a.mono}>{card.orderNo}</dd>
              {card.parcel && (
                <>
                  <dt>종류</dt>
                  <dd>{card.parcel.kind === "gift" ? "팬 선물 (크리에이터에게 가는 상자)" : "역조공 (팬에게 가는 상자)"}</dd>
                  <dt>보낸 사람</dt>
                  <dd>{card.parcel.senderNickname}</dd>
                  <dt>구간</dt>
                  <dd>{TIER_LABEL[card.parcel.tier]} (결제한 구간)</dd>
                </>
              )}
            </dl>
            <div className={w.qnum}>
              <span>
                <small>라벨 QR 번호</small>
                {card.qr}
              </span>
            </div>
            <p className={w.bigNote}>라벨 1장 출력됨. 붙인 뒤 라벨 QR 을 스캔해 붙임 확인</p>
            <div className={w.nextStep}>
              <h3>지금 할 일</h3>
              <ol className={w.steps} aria-label="입고 순서">
                <li className={w.done}>
                  <b>1</b>원래 송장 스캔 · 6자리
                </li>
                <li className={w.now}>
                  <b>2</b>라벨 붙이기
                </li>
                <li>
                  <b>3</b>라벨 QR 스캔
                </li>
              </ol>
              <p className={a.hint}>
                떼어 낸 원래 송장은 봉투 <strong className={a.mono}>{card.qr}</strong>(라벨의 QR 번호와 같아요)에 넣고, 상자와 따로 보관 선반에 두세요. 크리에이터에게 가는 상자에 섞이면 안 돼요.
              </p>
            </div>
            <div className={a.note}>
              <InfoIcon />
              <p>붙임 확인 전까지 스캔 칸은 라벨 QR 만 받아요.</p>
            </div>
          </section>
        )}

        {card?.kind === "labeled" && (
          <div className={`${a.note} ${a.noteOk}`}>
            <InfoIcon />
            <p>
              <strong>라벨 붙임 확인.</strong> {card.orderNo ? `${card.orderNo} 상자는` : "이 상자는"} 이제 검수 단계로 넘어가요. 다음 상자를 스캔하세요.
            </p>
          </div>
        )}

        {card?.kind === "hold_saved" && (
          <div className={`${a.note} ${a.noteOk}`}>
            <InfoIcon />
            <p>
              <strong>보류로 기록했어요.</strong> 사유: {HOLD_REASON_LABEL[card.reason]}. 보낸 사람: {card.nickname ? <strong>닉네임 일치 · {card.nickname}</strong> : "닉네임 없음"}. 상자는 선반 <span className={a.mono}>{card.shelf}</span>에 두세요. 출고 목록에는 나오지 않고, 7일 안에 입고되지 않으면 원래 송장 주소로 착불 반송해요.
            </p>
          </div>
        )}

        {card?.kind === "hold_recorded" && (
          <div className={a.note}>
            <InfoIcon />
            <p>
              <strong>이미 보류로 기록된 상자예요.</strong> 선반에 그대로 두세요. 주인이 「받는 주소 없이 보냈어요」로 찾으면 입고돼요.
            </p>
          </div>
        )}

        {card?.kind === "rejected" && (
          <section className={`${w.result} ${w.resultNo}`} aria-labelledby="inbound-rejected">
            <div className={w.resultHead}>
              <span className={`${a.tag} ${a.tagInk}`}>{card.unknown ? "확인 필요" : "거절"}</span>
              <h2 id="inbound-rejected">{card.title}</h2>
            </div>
            <dl className={a.kv}>
              {pending && (
                <>
                  <dt>기다리는 라벨</dt>
                  <dd className={a.mono}>
                    {pending.orderNo} ({pending.qr})
                  </dd>
                </>
              )}
              <dt>상태</dt>
              <dd>{card.unknown ? card.message : `${card.message} 이번 스캔은 반영되지 않았어요. 상자 상태는 그대로예요.`}</dd>
            </dl>
            <div className={w.nextStep}>
              <h3>이렇게 하세요</h3>
              <p>
                {pending
                  ? "앞 상자에 라벨을 붙이고, 그 라벨의 QR 을 스캔하면 다음 상자를 받을 수 있어요. 한 상자에 스캔 한 번, 라벨 한 장씩 처리해요."
                  : "같은 송장을 두 번 읽었다면 그대로 두세요. 이 상자에 붙은 라벨이 없다면 대표에게 알려 주세요."}
              </p>
            </div>
          </section>
        )}
      </div>

      <section aria-labelledby="inbound-recent">
        <h2 className={w.miniH} id="inbound-recent">
          이 화면에서 처리한 상자
        </h2>
        <div className={a.tblWrap}>
          <table className={a.tbl}>
            <caption className="sr-only">이 화면에서 처리한 입고 기록</caption>
            <thead>
              <tr>
                <th scope="col">시각</th>
                <th scope="col">주문번호</th>
                <th scope="col">종류</th>
                <th scope="col">결과</th>
                <th scope="col">담당</th>
              </tr>
            </thead>
            <tbody>
              {recent.length === 0 ? (
                <tr>
                  <td colSpan={5} className={a.empty}>
                    아직 처리한 상자가 없어요.
                  </td>
                </tr>
              ) : (
                recent.map((r, i) => (
                  <tr key={`${r.at}-${i}`}>
                    <td className={a.mono}>{timeOnly(r.at)}</td>
                    <td className={a.mono}>
                      <strong>{r.orderNo}</strong>
                    </td>
                    <td>{r.kindText}</td>
                    <td>
                      <span className={`${a.tag} ${r.resultText === "라벨 붙임 확인" ? a.tagBrand : ""}`}>{r.resultText}</span>
                    </td>
                    <td>{operatorNickname}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
