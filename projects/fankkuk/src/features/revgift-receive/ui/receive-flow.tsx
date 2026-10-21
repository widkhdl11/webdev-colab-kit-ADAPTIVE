"use client";

import { statusTagClass } from "@/shared/ui/status-tone";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, type ReactNode } from "react";
import type { MyFanAddressStatus } from "@/entities/address/api/my-fan-address-status";
import type { AddressLabel } from "@/entities/address/model/address-label";
import { addressOnFileText } from "@/entities/address/ui/address-on-file-text";
import { TodoBox } from "@/entities/action-item/ui/todo-box";
import type { ReceivedStage } from "@/entities/revgift/model/received-stage";
import { settledStageCopy } from "@/entities/revgift/ui/received-status";
import { FAN_HOME } from "@/entities/session/model/home-path";
import { BottomSheet } from "@/shared/ui/bottom-sheet";
import { acceptRevgift, declineRevgift } from "../api/reply-requests";
import { PROMISE } from "@/shared/config/site-copy";
import s from "./receive-flow.module.css";

// 받은 역조공 하나 — 받기·받지 않기. 시안: docs/design/mockups/site/v18/revgift-receive.html (가운데 한 기둥에 판을 세로로 쌓음)
// 받기를 누르면 설정에 등록한 받을 주소를 확인하는 판이 열린다(reverse-gift INV-R4, address-protection INV-P16·P17, 2026-10-17 카드 d100):
//   등록돼 있으면 「주소를 확인해 주세요」 — 이름표와 등록한 날만 보이고 주소는 보이지 않는다. 「이 주소로 받기」를 누르면 서버가 등록 주소를 이 선물에 복사한다.
//   등록 전이면 「주소를 입력해 주세요」 — 그 자리에서 받을 주소를 등록한 뒤(이 브라우저에서 봉인한 값만 — INV-R5) 확인 판으로 넘어간다.
// 주소 입력 칸은 위젯이 받을 주소 기능으로 조립해 넘긴다(기능끼리는 서로 import 하지 않는다 — FSD). 승인 창의 주소 단계와 같은 꼴이다.
// 2026-10-21(action-center INV-J12·J13, 시안 v34-part1/revgift-detail.html): 받은 역조공 상세는 선물 상세 하나(`/gifts/RG-…`)이고, 받기·받지 않기·주소 입력은
//   맨 위 「지금 할 일」 칸 안에서만 한다. 칸은 그 몫이 처리할 일 읽기 결과에 있을 때만(todo) — 이 화면이 따로 「받을 수 있는가」를 계산하지 않는다.

/** 받기 판의 주소 칸 — 위젯이 넘긴다. */
export type ReceiveAddressStep = {
  /** 로그인한 팬의 받을 주소 상태. 읽지 못했으면 null */
  status: MyFanAddressStatus | null;
  /** 주소 입력 칸을 그릴 수 있는가(봉인 공개키가 있다). 없으면 입력 대신 안내만 보인다 */
  canEnter: boolean;
  /** 주소 입력 칸 */
  renderForm: (p: { initialLabel: AddressLabel | null; autoFocusFirst: boolean; onSaved: (label: AddressLabel) => void; onCancel: () => void }) => ReactNode;
  /** canEnter 가 아닐 때 입력 칸 자리에 보이는 안내 */
  missingKeyText: string;
};

export type ReceiveFlowProps = {
  orderNo: string;
  creatorName: string;
  tierName: string;
  tierRule: string;
  stage: ReceivedStage;
  /** 기다리는 중일 때만 쓴다 — 「5일 남음」 */
  daysLeftText: string;
  /** 기다리는 중일 때만 쓴다 — 「10월 8일 오후 3:00까지 정해 주세요」 */
  deadlineText: string;
  address: ReceiveAddressStep;
  /** 이 몫이 처리할 일 읽기 결과에 있다(action-center INV-J13) — 그때만 「지금 할 일」 칸(받기·받지 않기·주소 입력)이 보인다 */
  todo: boolean;
  /** 받기 판들 아래에 붙는 칸(내 주소 열람 기록 — 위젯이 넣는다). */
  children?: ReactNode;
};

/** 주소 판 머리 — 등록 전이면 입력, 바꾸는 중이면 새 주소, 등록돼 있으면 확인(승인 창과 같은 말) */
function addressHead(registered: boolean, editing: boolean): string {
  if (!registered) return "주소를 입력해 주세요";
  return editing ? "새 주소를 입력해 주세요" : "주소를 확인해 주세요";
}

export function ReceiveFlow(props: ReceiveFlowProps) {
  const { orderNo, creatorName, tierName, tierRule, daysLeftText, deadlineText, address } = props;
  const router = useRouter();
  const [stage, setStage] = useState<ReceivedStage>(props.stage);
  const [stepOpen, setStepOpen] = useState(false);
  const [status, setStatus] = useState(address.status);
  const [editing, setEditing] = useState(false);
  const [savedMsg, setSavedMsg] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [declineError, setDeclineError] = useState<string | null>(null);

  const stepTitle = useRef<HTMLHeadingElement>(null);
  const resultTitle = useRef<HTMLHeadingElement>(null);
  const focusNext = useRef<"step" | "result" | null>(null);

  // 화면이 바뀌면 누른 버튼이 사라진다 — 바뀐 부분의 제목으로 포커스를 옮겨 처음부터 읽게
  useEffect(() => {
    const target = focusNext.current === "step" ? stepTitle.current : focusNext.current === "result" ? resultTitle.current : null;
    focusNext.current = null;
    target?.focus();
  }, [stepOpen, stage, editing, status?.registered]);

  const waiting = stage === "waiting";
  const registered = status?.registered ?? false;
  // 등록 주소가 있으면 공개키 없이도 받을 수 있다(복사는 서버가 한다). 없으면 입력 칸이 있어야 받을 수 있다.
  const canReceive = status !== null && (registered || address.canEnter);

  const openStep = () => {
    setSubmitError(null);
    setSavedMsg(null);
    setEditing(false);
    focusNext.current = "step";
    setStepOpen(true);
  };

  const accept = async () => {
    if (busy) return;
    setBusy(true);
    setSubmitError(null);
    const outcome = await acceptRevgift(orderNo);
    setBusy(false);
    if (outcome.ok) {
      focusNext.current = "result";
      setStepOpen(false);
      setStage("accepted");
      return;
    }
    setSubmitError(outcome.message);
    // 서버가 「등록 주소 없음」으로 돌려보냈다 — 화면이 들고 있던 「등록됨」이 틀렸으니 입력부터 다시
    if (outcome.noAddress) {
      focusNext.current = "step";
      setStatus({ registered: false, label: null, updatedAt: null });
      setEditing(false);
      setSavedMsg(null);
    }
    // 이미 정해졌거나 기한이 지났으면 지금 상태를 다시 읽어 그 안내로 바꾼다
    if (outcome.status === 409) router.refresh();
  };

  const decline = async () => {
    if (busy) return;
    setBusy(true);
    setDeclineError(null);
    const outcome = await declineRevgift(orderNo);
    setBusy(false);
    setSheetOpen(false);
    if (outcome.ok) {
      focusNext.current = "result";
      setStepOpen(false);
      setStage("declined");
      return;
    }
    if (stepOpen) setSubmitError(outcome.message);
    else setDeclineError(outcome.message);
    if (outcome.status === 409) router.refresh();
  };

  const settled = stage === "waiting" ? null : settledStageCopy(stage);

  const addressBody = () => {
    if (!status) return <p className="err">받을 주소를 읽지 못했어요. 새로 고침한 뒤 다시 해 주세요.</p>;
    if (registered && !editing) {
      return (
        <>
          <div className={`card card--soft ${s["addr-on-file"]}`}>
            <p className="t-strong" data-address-on-file="">
              {addressOnFileText(status)}
            </p>
            <p className="t-meta">주소는 잠가서 보관해서 여기서도 보이지 않아요. 이사했거나 받는 곳이 바뀌었으면 받기 전에 바꿔 주세요.</p>
            <div>
              <button
                className="btn btn--line btn--sm"
                type="button"
                onClick={() => {
                  setSavedMsg(null);
                  setSubmitError(null);
                  focusNext.current = "step";
                  setEditing(true);
                }}
              >
                주소 바꾸기
              </button>
            </div>
          </div>
          <p className={`t-meta ${s["addr-saved"]}`} role="status">
            {savedMsg ?? ""}
          </p>
          <div role="alert">{submitError ? <p className={`err ${s.alert}`}>{submitError}</p> : null}</div>
          <div className="actions">
            <button className="btn btn--line" type="button" onClick={() => setSheetOpen(true)}>
              받지 않기
            </button>
            <button className="btn" type="button" onClick={() => void accept()} aria-disabled={busy || undefined} aria-busy={busy || undefined}>
              이 주소로 받기
            </button>
          </div>
        </>
      );
    }
    if (!address.canEnter) {
      return (
        <p className="err" role="status">
          {address.missingKeyText}
        </p>
      );
    }
    return (
      <>
        <p className={`t-lead t-desc ${s.desc}`}>
          주소는 이 브라우저에서 암호화돼요. 팬꾹도 송장을 뽑을 때만 열 수 있어요. {creatorName}님에게는 보이지 않아요.
        </p>
        <div role="alert">{submitError ? <p className={`err ${s.alert}`}>{submitError}</p> : null}</div>
        {address.renderForm({
          initialLabel: status.label,
          autoFocusFirst: registered,
          onSaved: (label) => {
            // 서버에 저장된 뒤에만 바뀐다 — 이어서 같은 판에서 「이 주소로 받기」를 누른다
            setSavedMsg(registered ? "주소를 바꿨어요." : "주소를 등록했어요.");
            setSubmitError(null);
            focusNext.current = "step";
            setStatus({ registered: true, label, updatedAt: new Date().toISOString() });
            setEditing(false);
          },
          onCancel: () => {
            focusNext.current = registered ? "step" : null;
            if (registered) setEditing(false);
            else setStepOpen(false);
          },
        })}
      </>
    );
  };

  // 받을지 정하는 칸 — 처리할 일 읽기 결과에 이 몫이 있고 아직 정하지 않았을 때만(INV-J13)
  const showTodo = waiting && props.todo;

  return (
    <>
      <header className="page-head">
        <div className="ph-row">
          <h1 className="ph-title" id="rv-title">
            {creatorName}님이 보낸 선물
          </h1>
        </div>
        <p className="ph-desc">내가 팔로우한 크리에이터가 보낸 선물이에요.</p>
      </header>
      <div className={`stack ${s.flow}`}>
        {showTodo ? (
          <TodoBox variant="revgift">
            <div className={s.todoHead}>
              <div>
                {stepOpen ? (
                  <h2 className={`${s.todoTitle} ${s.focusable}`} id="rv-step-title" ref={stepTitle} tabIndex={-1}>
                    {addressHead(registered, editing)}
                  </h2>
                ) : (
                  <h2 className={s.todoTitle}>받을지 정해 주세요</h2>
                )}
                <p className={s.todoSub}>{deadlineText}</p>
              </div>
              <p className="num-big num-big--32">{daysLeftText}</p>
            </div>
            {stepOpen ? (
              addressBody()
            ) : (
              <>
                {canReceive ? null : (
                  <p className={s.warn} role="status">
                    {status === null ? "받을 주소를 읽지 못했어요. 새로 고침한 뒤 다시 해 주세요." : `${address.missingKeyText} 설정이 끝나면 다시 들어와 주세요.`}
                  </p>
                )}
                <div className={s.choice}>
                  {canReceive ? (
                    <button className="btn" type="button" onClick={openStep}>
                      받기
                    </button>
                  ) : null}
                  <button className="btn btn--line" type="button" onClick={() => setSheetOpen(true)}>
                    받지 않기
                  </button>
                </div>
                <div role="alert">{declineError ? <p className={`err ${s.alert}`}>{declineError}</p> : null}</div>
                <p className={`t-meta ${s.once}`}>기한 안에 정하지 않으면 자동으로 받지 않음 처리돼요. 받기 전에는 주소를 입력하지 않아도 돼요.</p>
              </>
            )}
          </TodoBox>
        ) : null}

        {stage !== "waiting" ? (
          <section className={stage === "accepted" ? "part part--soft" : "part"} aria-labelledby="rv-result-title">
            {stage === "accepted" ? (
              <>
                <h2 className={`t-title ${s.focusable}`} id="rv-result-title" ref={resultTitle} tabIndex={-1}>
                  받기가 끝났어요
                </h2>
                <p className={`t-lead t-desc ${s.desc}`}>{creatorName}님의 선물이 곧 준비돼요.</p>
                <ol className={`flow ${s.next}`}>
                  <li>
                    <span className="n">1</span>
                    <p className="t-strong">상자가 팬꾹에 도착해요</p>
                    <p>{PROMISE.inspection}</p>
                  </li>
                  <li>
                    <span className="n">2</span>
                    <p className="t-strong">검수가 끝나면 보내 드려요</p>
                    <p>주소는 송장을 출력할 때만 열려요.</p>
                  </li>
                  <li>
                    <span className="n">3</span>
                    <p className="t-strong">배송이 시작되면 받은 역조공에서 확인할 수 있어요</p>
                    <p>상태가 「출고됨」으로 바뀌어요.</p>
                  </li>
                </ol>
              </>
            ) : (
              <>
                <h2 className={`t-title ${s.focusable}`} id="rv-result-title" ref={resultTitle} tabIndex={-1}>
                  {RESULT_TITLE[stage]}
                </h2>
                {resultBody(stage, creatorName) !== null && <p className={`t-lead t-desc ${s.desc}`}>{resultBody(stage, creatorName)}</p>}
              </>
            )}
            <div className={`btnrow ${s.links}`}>
              <Link className="btn" href="/me/revgifts">
                받은 역조공 보기
              </Link>
              <Link className="btn btn--line" href={FAN_HOME}>
                메인으로
              </Link>
            </div>
          </section>
        ) : null}
        <section className="part" aria-labelledby="rv-info-title">
          <h2 className="t-title" id="rv-info-title">
            선물 정보
          </h2>
          <dl className="kv">
            <div>
              <dt>보낸 사람</dt>
              <dd>{creatorName}님</dd>
            </div>
            <div>
              <dt>상자 크기</dt>
              <dd>
                {tierName} 상자 <span className="t-meta">{tierRule}</span>
              </dd>
            </div>
            <div>
              <dt>주문번호</dt>
              <dd>{orderNo}</dd>
            </div>
            <div>
              <dt>상태</dt>
              <dd>
                {settled ? (
                  <span className={statusTagClass(settled.tone)}>{settled.tag}</span>
                ) : (
                  <>
                    <span className={statusTagClass("warn")}>{daysLeftText}</span> <span className="t-meta">{deadlineText}</span>
                  </>
                )}
              </dd>
            </div>
          </dl>
        </section>
        {props.children}
      </div>

      <BottomSheet open={sheetOpen} title={`${creatorName}님의 선물을 받지 않을까요?`} onClose={() => setSheetOpen(false)}>
        <p className="t-desc">받지 않아도 {creatorName}님에게 이유는 알리지 않아요. 한 번 받지 않으면 다시 받을 수 없어요.</p>
        <div className={s["sheet-btns"]}>
          <button className="btn btn--line" type="button" onClick={() => setSheetOpen(false)}>
            돌아가기
          </button>
          <button className="btn" type="button" onClick={() => void decline()} aria-disabled={busy || undefined} aria-busy={busy || undefined}>
            받지 않기
          </button>
        </div>
      </BottomSheet>
    </>
  );
}

const RESULT_TITLE: Record<Exclude<ReceivedStage, "waiting" | "accepted">, string> = {
  declined: "받지 않기로 했어요",
  expired: "기한이 지나 받지 않음으로 정해졌어요",
  shipped: "배송이 시작됐어요",
  returned: "상자를 돌려보냈어요",
  disposed: "상자를 처분했어요",
  cancelled: "이 선물은 취소됐어요",
};

// 이 선물에 복사해 둔 주소는 출고·반송 때 지운다(reverse-gift INV-R9). 등록한 받을 주소는 그대로라 「주소를 지웠다」고 쓰지 않는다.
// 처분(office-workflow INV-W15)은 제목 한 줄로 끝난다 — 덧붙일 사실이 없다.
function resultBody(stage: Exclude<ReceivedStage, "waiting" | "accepted">, creatorName: string): string | null {
  if (stage === "disposed") return null;
  if (stage === "declined") return `${creatorName}님에게는 받지 않은 이유를 알리지 않아요.`;
  if (stage === "expired") return `7일 안에 정하지 않아 받지 않음으로 처리됐어요. ${creatorName}님에게는 이유를 알리지 않아요.`;
  if (stage === "shipped") return "곧 도착해요.";
  if (stage === "cancelled") return `${creatorName}님이 보낸 이 선물은 더 진행되지 않아요.`;
  return `상자를 ${creatorName}님에게 돌려보냈어요.`;
}
