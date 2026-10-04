"use client";

import { useState } from "react";
import type { AdminCreator, VerificationEvent } from "@/entities/creator/model/admin-creator";
import { ApproveButton } from "@/features/admin-creator-verify/ui/approve-button";
import { RevokeButton } from "@/features/admin-creator-verify/ui/revoke-button";
import { formatStamp } from "@/shared/lib/format/datetime";
import a from "@/shared/ui/admin.module.css";

// 관리자 「크리에이터 확인」 본문 (admin-console INV-K10·K8, 시안 admin/creators.html).
// 크리에이터가 직접 신청하고 인증 코드를 거는 흐름은 아직 없다 — 그래서 승인 대기 표에 인증 코드·게시 확인·반려 칸이 없다.
// 운영자(대표·직원) 누구나 승인·취소하고, 누가 언제 했는지는 처리 기록에 남는다. 사람은 닉네임·아이디로만.

type Props = { creators: readonly AdminCreator[]; events: readonly VerificationEvent[] };

function Channel({ c }: { c: AdminCreator }) {
  return (
    <>
      <span className={a.tag}>{c.channel}</span> {c.channelTitle}
    </>
  );
}

export function CreatorsPanel({ creators, events }: Props) {
  const waiting = creators.filter((c) => !c.verified);
  const approved = creators.filter((c) => c.verified);
  const [done, setDone] = useState<string | null>(null);

  return (
    <>
      <div className={a.pageHead}>
        <div>
          <h1>크리에이터 본인 확인</h1>
          <p>채널 주인이 맞는지 확인하고 승인해요. 취소하면 찾기에서 사라지고 새 선물·팔로우가 막혀요. 이미 등록된 주문은 그대로 가요.</p>
        </div>
      </div>

      {/* 승인·승인 취소 결과를 한곳에서 알린다 — 처리한 줄은 다시 읽으면 다른 표로 옮겨 가기 때문이다 */}
      <p role="status" className={a.doneLine}>
        {done}
      </p>

      <div className={a.stack}>
        <section aria-labelledby="h-creators-wait">
          <div className={a.sectionH}>
            <h2 id="h-creators-wait" tabIndex={-1}>
              승인 대기 <span>{waiting.length}명</span>
            </h2>
          </div>
          <div className={a.tblWrap}>
            <table className={a.tbl} style={{ minWidth: 640 }}>
              <caption className="sr-only">승인 대기 크리에이터</caption>
              <thead>
                <tr>
                  <th scope="col">닉네임</th>
                  <th scope="col">아이디</th>
                  <th scope="col">채널</th>
                  <th scope="col">
                    <span className="sr-only">처리</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {waiting.length === 0 ? (
                  <tr>
                    <td colSpan={4} className={a.empty}>
                      승인을 기다리는 크리에이터가 없어요.
                    </td>
                  </tr>
                ) : (
                  waiting.map((c) => (
                    <tr key={c.id}>
                      <td>
                        <strong>{c.name}</strong>
                      </td>
                      <td className={a.mono}>{c.loginId ?? <span className={a.faint}>계정 없음</span>}</td>
                      <td>
                        <Channel c={c} />
                      </td>
                      <td className={a.act}>
                        <ApproveButton creatorId={c.id} creatorName={c.name} returnFocusId="h-creators-wait" onDone={setDone} />
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </section>

        <section aria-labelledby="h-creators-ok">
          <div className={a.sectionH}>
            <h2 id="h-creators-ok" tabIndex={-1}>
              승인된 크리에이터
            </h2>
          </div>
          <div className={a.tblWrap}>
            <table className={a.tbl} style={{ minWidth: 760 }}>
              <caption className="sr-only">승인된 크리에이터</caption>
              <thead>
                <tr>
                  <th scope="col">닉네임</th>
                  <th scope="col">채널</th>
                  <th scope="col">승인한 사람</th>
                  <th scope="col">승인 시각</th>
                  <th scope="col">
                    <span className="sr-only">처리</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {approved.length === 0 ? (
                  <tr>
                    <td colSpan={5} className={a.empty}>
                      승인된 크리에이터가 없어요.
                    </td>
                  </tr>
                ) : (
                  approved.map((c) => (
                    <tr key={c.id}>
                      <td>
                        <strong>{c.name}</strong>
                      </td>
                      <td>
                        <Channel c={c} />
                      </td>
                      <td>{c.lastActorNickname ?? <span className={a.faint}>기록 없음</span>}</td>
                      <td className={`${a.mono} ${a.nowrap}`}>{c.lastActionAt ? formatStamp(c.lastActionAt) : <span className={a.faint}>—</span>}</td>
                      <td className={a.act}>
                        <RevokeButton creatorId={c.id} creatorName={c.name} returnFocusId="h-creators-ok" onDone={setDone} />
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </section>

        <section aria-labelledby="h-creators-log">
          <div className={a.sectionH}>
            <h2 id="h-creators-log">처리 기록</h2>
            <span>누가 · 언제 · 무엇을</span>
          </div>
          <div className={a.tblWrap}>
            <table className={a.tbl} style={{ minWidth: 560 }}>
              <caption className="sr-only">승인·취소 기록</caption>
              <thead>
                <tr>
                  <th scope="col">시각</th>
                  <th scope="col">누가</th>
                  <th scope="col">크리에이터</th>
                  <th scope="col">처리</th>
                </tr>
              </thead>
              <tbody>
                {events.length === 0 ? (
                  <tr>
                    <td colSpan={4} className={a.empty}>
                      아직 처리 기록이 없어요.
                    </td>
                  </tr>
                ) : (
                  events.map((e, i) => (
                    <tr key={`${e.at}-${e.creatorId}-${i}`}>
                      <td className={`${a.mono} ${a.nowrap}`}>{formatStamp(e.at)}</td>
                      <td>{e.actorNickname}</td>
                      <td>{e.creatorName}</td>
                      <td>
                        {e.action === "approve" ? <span className={`${a.tag} ${a.tagBrand}`}>승인</span> : <span className={`${a.tag} ${a.tagInk}`}>승인 취소</span>}
                        {e.reason !== "" && <span className={a.sub}> {e.reason}</span>}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </>
  );
}
