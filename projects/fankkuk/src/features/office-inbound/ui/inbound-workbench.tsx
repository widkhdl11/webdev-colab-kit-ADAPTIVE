"use client";

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { needsReload } from "@/entities/parcel/model/office-error";
import type { PendingLabel } from "@/entities/parcel/model/office-lists";
import { KIND_LABEL, TIER_LABEL } from "@/entities/parcel/model/office-labels";
import type { ParcelDetail } from "@/entities/parcel/model/office-parcel";
import { readScan } from "@/entities/parcel/model/scan-code";
import { formatStamp } from "@/shared/lib/format/datetime";
import a from "@/shared/ui/admin.module.css";
import { ScanInput, type ScanInputHandle } from "@/shared/ui/scan-input";
import w from "@/shared/ui/work.module.css";
import { postInbound } from "../api/post-inbound-client";
import { inboundReplyFromBody } from "../model/inbound-reply";
import { SHELF_MAX } from "../model/scan-inbound";

// 입고 작업 화면 (office-workflow INV-W1·W2·W5·W7, design-rules 8-1, 시안 admin/work-inbound.html).
// 스캔 칸 하나: 숫자 송장이면 입고 스캔, Q-번호면 라벨 부착 확인. 상태를 고르거나 주문번호를 넣는 칸은 없다.
// 부착 대기 라벨 줄은 서버가 준 값(이 작업자의 대기 라벨)으로 시작하고, 스캔 결과로 바뀐다.
// 아래 표는 이 화면을 연 뒤 처리한 상자만 보인다(오늘 전체 기록을 읽는 함수는 아직 없다).

type Card =
  | { kind: "received"; qr: string; orderNo: string; parcel: ParcelDetail | null; at: string; reprinted: boolean }
  | { kind: "labeled"; orderNo: string }
  | { kind: "unmatched"; waybill: string; at: string }
  | { kind: "unmatched_saved"; shelf: string }
  | { kind: "unmatched_recorded" }
  | { kind: "rejected"; title: string; message: string; pending: PendingLabel | null };

/** 화면 읽기 프로그램이 읽는 한 줄 — 결과 카드의 제목만. 부착 대기 줄·양식은 따로 알리지 않는다. */
function announceOf(card: Card | null): string {
  if (!card) return "";
  switch (card.kind) {
    case "received":
      return card.reprinted ? "라벨을 다시 냈어요" : `입고 완료 ${card.orderNo}`;
    case "labeled":
      return `부착 확인 완료 ${card.orderNo}`;
    case "unmatched":
      return "맞는 주문이 없어요";
    case "unmatched_saved":
      return "미확인 입고로 기록했어요";
    case "unmatched_recorded":
      return "이미 미확인 입고로 기록된 상자예요";
    case "rejected":
      return `거부: ${card.title}`;
  }
}

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

function timeOnly(iso: string): string {
  return formatStamp(iso).slice(6);
}

export function InboundWorkbench({ initialPending, operatorNickname }: Props) {
  const router = useRouter();
  const scan = useRef<ScanInputHandle>(null);
  const [pending, setPending] = useState<PendingLabel | null>(initialPending);
  const [seenInitial, setSeenInitial] = useState(initialPending);
  const [busy, setBusy] = useState(false);
  const [card, setCard] = useState<Card | null>(null);
  const [recent, setRecent] = useState<Recent[]>([]);
  const [senderInitial, setSenderInitial] = useState("");
  const [shelf, setShelf] = useState("");
  const [formError, setFormError] = useState<string | null>(null);

  // 화면을 다시 읽으면(router.refresh) 서버가 준 대기 라벨로 맞춘다
  if (initialPending !== seenInitial) {
    setSeenInitial(initialPending);
    setPending(initialPending);
  }

  function addRecent(row: Recent) {
    setRecent((rows) => [row, ...rows].slice(0, 20));
  }

  function reject(title: string, message: string) {
    setCard({ kind: "rejected", title, message, pending });
  }

  async function onScan(raw: string) {
    const code = readScan(raw);
    if (code.kind === "invalid") {
      reject("스캔한 값을 읽지 못했어요", "택배 송장 바코드(숫자 10~14자리)나 라벨 QR(Q-여섯 자리)을 다시 스캔해 주세요. 상자 상태는 그대로예요.");
      return;
    }
    setBusy(true);
    const outcome = code.kind === "qr" ? await postInbound({ kind: "label", qr: code.value }) : await postInbound({ kind: "waybill", waybill: code.value });
    setBusy(false);
    scan.current?.focus();
    const now = new Date().toISOString();

    if (outcome.kind === "failed") {
      if (outcome.reason === "pending_label") reject("앞 상자 라벨 부착을 먼저 확인하세요", outcome.message);
      else if (outcome.reason === "wrong_step") reject("이미 처리된 상자예요", outcome.message);
      else reject("반영되지 않았어요", outcome.message);
      if (needsReload(outcome)) router.refresh(); // 부착 대기 줄을 서버 값으로 다시 맞춘다
      return;
    }

    if (code.kind === "qr") {
      const orderNo = pending?.qr === code.value ? pending.orderNo : code.value;
      setPending(null);
      setCard({ kind: "labeled", orderNo });
      addRecent({ at: now, orderNo, kindText: "—", resultText: "부착 확인" });
      return;
    }

    const reply = inboundReplyFromBody(outcome.body);
    if (!reply) {
      reject("결과를 읽지 못했어요", "화면을 새로고침해 부착 대기 라벨이 있는지 확인해 주세요.");
      router.refresh();
      return;
    }
    if (reply.result === "unmatched_recorded") {
      setCard({ kind: "unmatched_recorded" });
      return;
    }
    if (reply.result === "unmatched") {
      setSenderInitial("");
      setShelf("");
      setFormError(null);
      setCard({ kind: "unmatched", waybill: code.value, at: now });
      return;
    }
    setPending({ qr: reply.qr, orderNo: reply.orderNo });
    setCard({ kind: "received", qr: reply.qr, orderNo: reply.orderNo, parcel: reply.parcel, at: now, reprinted: reply.result === "reprinted" });
    addRecent({ at: now, orderNo: reply.orderNo, kindText: reply.parcel ? KIND_LABEL[reply.parcel.kind] : "—", resultText: "입고 완료" });
  }

  async function saveUnmatched(waybill: string) {
    if (busy) return;
    setBusy(true);
    setFormError(null);
    const outcome = await postInbound({ kind: "unmatched", waybill, senderInitial, shelf });
    setBusy(false);
    if (outcome.kind === "failed") {
      setFormError(outcome.message);
      if (needsReload(outcome)) router.refresh();
      return;
    }
    const savedShelf = shelf.trim();
    setCard({ kind: "unmatched_saved", shelf: savedShelf });
    addRecent({ at: new Date().toISOString(), orderNo: "미확인", kindText: "미확인", resultText: `미확인 입고 · ${savedShelf}` });
    scan.current?.focus();
  }

  return (
    <div className={w.work}>
      <div className={pending ? `${w.pendingLine} ${w.pendingOn}` : w.pendingLine}>
        <span className={w.dot} aria-hidden="true" />
        <span>
          {pending
            ? `부착 대기 중인 라벨 1장 · ${pending.orderNo} (${pending.qr}) — 라벨 QR 을 스캔해 부착을 확인하기 전에는 다음 상자를 입고할 수 없어요`
            : "부착 대기 중인 라벨 없음 — 다음 상자를 스캔해도 돼요"}
        </span>
      </div>

      <ScanInput
        ref={scan}
        id="inbound-scan"
        label={pending ? "라벨 QR 스캔 (부착 확인)" : "원 송장 바코드 스캔"}
        placeholder="스캐너로 읽으면 여기에 들어가요"
        hint="상자에 붙은 택배 송장 바코드를 스캐너로 읽어요. 라벨을 붙였으면 라벨 QR 을 읽혀요. 주문번호나 상태를 손으로 고르는 칸은 없어요."
        busy={busy}
        onScan={onScan}
      />

      <p className="sr-only" role="status">
        {announceOf(card)}
      </p>
      <div>
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
            <p className={w.bigNote}>라벨 1장 출력됨. 붙인 뒤 라벨 QR 을 스캔해 부착 확인</p>
            <div className={w.nextStep}>
              <h3>지금 할 일</h3>
              <ol className={w.steps} aria-label="입고 순서">
                <li className={w.done}>
                  <b>1</b>원 송장 스캔
                </li>
                <li className={w.now}>
                  <b>2</b>라벨 붙이기
                </li>
                <li>
                  <b>3</b>라벨 QR 스캔
                </li>
              </ol>
              <p className={a.hint}>
                떼어 낸 원 송장은 봉투 <strong className={a.mono}>{card.qr}</strong>(라벨의 QR 번호와 같아요)에 넣고, 상자와 따로 보관 선반에 두세요. 크리에이터에게 가는 상자에 섞이면 안 돼요.
              </p>
            </div>
            <div className={a.note}>
              <InfoIcon />
              <p>부착 확인 전까지 이 칸은 라벨 QR 만 받아요.</p>
            </div>
          </section>
        )}

        {card?.kind === "labeled" && (
          <div className={`${a.note} ${a.noteOk}`}>
            <InfoIcon />
            <p>
              <strong>부착 확인 완료.</strong> {card.orderNo} 상자는 이제 검수 단계로 넘어가요. 다음 상자를 스캔하세요.
            </p>
          </div>
        )}

        {card?.kind === "unmatched" && (
          <section className={w.result} aria-labelledby="inbound-unmatched">
            <div className={w.resultHead}>
              <span className={`${a.tag} ${a.tagWarn}`}>스캔 결과</span>
              <h2 id="inbound-unmatched">맞는 주문이 없어요</h2>
            </div>
            <p>이 송장번호는 어느 상자와도 이어지지 않아요. 미확인 입고로 기록해 두면 팬이 「내 물건 찾기」에서 송장번호를 넣을 때 이어져요.</p>
            <form
              className={w.two}
              aria-label="미확인 입고 기록"
              onSubmit={(e) => {
                e.preventDefault();
                void saveUnmatched(card.waybill);
              }}
            >
              <div className={a.field}>
                <label htmlFor="u-sender">발신인 앞 한 글자</label>
                <input className={a.input} id="u-sender" maxLength={2} placeholder="예: 별" autoComplete="off" value={senderInitial} onChange={(e) => setSenderInitial(e.target.value)} aria-describedby="u-sender-hint" />
                <p id="u-sender-hint" className={a.hint}>
                  이름 전체·주소·전화는 적지 않아요. 앞 한 글자만 남겨요.
                </p>
              </div>
              <div className={a.field}>
                <label htmlFor="u-shelf">보관 선반 번호</label>
                <input className={`${a.input} ${a.mono}`} id="u-shelf" maxLength={SHELF_MAX} placeholder="예: A-03" autoComplete="off" value={shelf} onChange={(e) => setShelf(e.target.value)} aria-describedby="u-shelf-hint" />
                <p id="u-shelf-hint" className={a.hint}>
                  상자를 둔 선반 번호만 적어요.
                </p>
              </div>
              <div className={a.field}>
                <label htmlFor="u-time">들어온 시각</label>
                <input className={`${a.input} ${a.mono}`} id="u-time" value={`${formatStamp(card.at)} (자동)`} readOnly />
              </div>
              <div className={a.field} style={{ alignContent: "end" }}>
                <div className={a.btnRow}>
                  <button className={`${a.btn} ${a.btnLg}`} type="submit" aria-disabled={busy}>
                    {busy ? "기록하는 중…" : "미확인 입고로 기록"}
                  </button>
                </div>
              </div>
            </form>
            <div role="status">
              {formError && (
                <p className={a.errorLine}>
                  <span className={a.errorMark} aria-hidden="true">
                    !
                  </span>
                  {formError}
                </p>
              )}
            </div>
          </section>
        )}

        {card?.kind === "unmatched_saved" && (
          <div className={`${a.note} ${a.noteOk}`}>
            <InfoIcon />
            <p>
              <strong>미확인 입고로 기록했어요.</strong> 7일 안에 팬이 찾지 않으면 처리 대상이 돼요. 상자는 선반 <span className={a.mono}>{card.shelf}</span>에 두세요.
            </p>
          </div>
        )}

        {card?.kind === "unmatched_recorded" && (
          <div className={a.note}>
            <InfoIcon />
            <p>
              <strong>이미 미확인 입고로 기록된 상자예요.</strong> 선반에 그대로 두세요. 팬이 「내 물건 찾기」로 송장번호를 넣으면 이어져요.
            </p>
          </div>
        )}

        {card?.kind === "rejected" && (
          <section className={`${w.result} ${w.resultNo}`} aria-labelledby="inbound-rejected">
            <div className={w.resultHead}>
              <span className={`${a.tag} ${a.tagInk}`}>거부</span>
              <h2 id="inbound-rejected">{card.title}</h2>
            </div>
            <dl className={a.kv}>
              {card.pending && (
                <>
                  <dt>기다리는 라벨</dt>
                  <dd className={a.mono}>
                    {card.pending.orderNo} ({card.pending.qr})
                  </dd>
                </>
              )}
              <dt>상태</dt>
              <dd>{card.message} 이번 스캔은 반영되지 않았어요. 상자 상태는 그대로예요.</dd>
            </dl>
            <div className={w.nextStep}>
              <h3>이렇게 하세요</h3>
              <p>
                {card.pending
                  ? "앞 상자에 라벨을 붙이고, 그 라벨의 QR 을 스캔하면 다음 상자를 받을 수 있어요. 한 상자에 스캔 한 번, 라벨 한 장씩 처리해요."
                  : "같은 송장을 두 번 읽었다면 그대로 두세요. 이 상자에 붙은 라벨이 없다면 관리자에게 알려 주세요."}
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
                      <span className={`${a.tag} ${r.resultText === "부착 확인" ? a.tagBrand : ""}`}>{r.resultText}</span>
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
