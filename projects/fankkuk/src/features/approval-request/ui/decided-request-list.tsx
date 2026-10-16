import Link from "next/link";
import { APPROVAL_DEADLINE_DAYS } from "@/entities/order/config/approval-deadline";
import type { DecidedOutcome, DecidedRequestView } from "@/entities/order/model/decided-request";
import { formatDate } from "@/shared/lib/format/datetime";
import { FaceAvatar } from "@/shared/ui/face-avatar";
import { statusTagClass, type StatusTone } from "@/shared/ui/status-tone";
import a from "./approval-request.module.css";

// 승인 내역 — 승인·받지 않기를 마친 요청(시안 v18 creator-requests.html 의 「처리한 요청」 구간). 대기 중인 요청은 크리에이터 처리할 일에서
// 승인 창으로 처리한다(action-center INV-J5·J6 — 승인 대기만 따로 세는 숫자·목록은 없다). 사이드바 「승인 내역」이 #done 으로 온다.

const DECIDED_TAG: Record<DecidedOutcome, { text: string; tone: StatusTone }> = {
  approved: { text: "승인함", tone: "success" },
  declined: { text: "받지 않음", tone: "danger" },
  blocked: { text: "차단함", tone: "danger" },
  expired: { text: "자동 반려", tone: "danger" },
};

function DecidedNote({ d }: { d: DecidedRequestView }) {
  const day = formatDate(d.decidedAt);
  if (d.outcome === "approved") return <>{day} 처리 · 카카오톡 서명으로 승인했어요.</>;
  if (d.outcome === "declined") return <>{day} 처리 · 팬에게는 이유를 알리지 않았어요.</>;
  if (d.outcome === "expired") return <>{day} 자동 처리 · {APPROVAL_DEADLINE_DAYS}일 안에 정하지 않아 자동으로 받지 않음 처리됐어요.</>;
  return (
    <>
      {day} 처리 · 앞으로 이 팬의 선물은 받지 않아요. 풀려면{" "}
      <Link className={a["link-in"]} href="/creator/settings#blocked">
        주소와 설정
      </Link>
      에서 해요.
    </>
  );
}

export function DecidedRequestList({ decided }: { decided: readonly DecidedRequestView[] }) {
  return (
    <section id="done" className={a.sec} aria-labelledby="done-h">
      <h2 className="t-card" id="done-h">
        처리한 요청
      </h2>
      {decided.length === 0 ? (
        <p className="empty">아직 처리한 요청이 없어요.</p>
      ) : (
        <ul className="grid cols-2">
          {decided.map((d, i) => {
            const tag = DECIDED_TAG[d.outcome];
            return (
              <li key={d.orderNo} className="card card-col">
                <p>
                  <span className={statusTagClass(tag.tone)}>{tag.text}</span>
                </p>
                <div className="who">
                  <FaceAvatar index={i} />
                  <div>
                    <p className="t-card">{d.fanNickname}님의 선물</p>
                    <p className="t-meta">
                      {d.itemKind} · 상자 {d.boxCount}개 · {d.orderNo}
                    </p>
                  </div>
                </div>
                <p className="t-meta">
                  <DecidedNote d={d} />
                </p>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
