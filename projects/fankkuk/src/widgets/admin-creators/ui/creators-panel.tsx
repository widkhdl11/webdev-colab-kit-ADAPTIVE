"use client";

import { useState } from "react";
import { latestApprovals, type AdminCreator, type VerificationEvent } from "@/entities/creator/model/admin-creator";
import {
  adminVerificationTables,
  eventReasonLabel,
  isLive,
  platformLabel,
  VERIFICATION_METHOD_LABEL,
  VERIFICATION_STATUS_LABEL,
  VERIFICATION_TRIES,
  type AdminVerification,
} from "@/entities/creator/model/creator-verification";
import { ApproveButton } from "@/features/admin-creator-verify/ui/approve-button";
import { RejectButton } from "@/features/admin-creator-verify/ui/reject-button";
import { RevokeButton } from "@/features/admin-creator-verify/ui/revoke-button";
import { UnlockButton } from "@/features/admin-creator-verify/ui/unlock-button";
import { formatStamp } from "@/shared/lib/format/datetime";
import a from "@/shared/ui/admin.module.css";

// 관리자 「크리에이터 확인」 본문 (creator-verification INV-V5·V6·V9·V11·V13·V15, admin-console INV-K10·K8, 시안 admin/creators.html).
// 확인 대기(올림) 표 = 시안의 승인 대기 표 — 인증 코드·게시물 열기·승인·반려. 시안에 없던 표는 같은 표 모양으로 더했다:
// 코드 받음(아직 안 올림 — 반려만), 끝난 신청(횟수 풀기). 사람은 닉네임·아이디로만(INV-K8).
// 「게시물 열기」는 서버가 채널 키로 다시 만든 주소만 연다(INV-V2) — 크리에이터가 적은 문자열이 아니다.

type Props = { creators: readonly AdminCreator[]; verifications: readonly AdminVerification[]; events: readonly VerificationEvent[] };

function Who({ v }: { v: AdminVerification }) {
  return (
    <>
      <strong>{v.creatorName ?? v.nickname}</strong>
      <br />
      <span className={`${a.mono} ${a.sub}`}>{v.loginId}</span>
    </>
  );
}

function Channel({ v }: { v: AdminVerification }) {
  return (
    <>
      <span className={a.tag}>{platformLabel(v.platform)}</span> {v.channelTitle ?? ""}
      <br />
      <span className={`${a.mono} ${a.sub}`} style={{ wordBreak: "break-all" }}>
        {v.channelUrl}
      </span>
    </>
  );
}

function OpenChannel({ v }: { v: AdminVerification }) {
  return (
    <a className={a.link} href={v.channelUrl} target="_blank" rel="noopener noreferrer" aria-label={`${v.creatorName ?? v.nickname} 채널 새 창으로 열기`}>
      게시물 열기 ↗
    </a>
  );
}

const tries = (v: AdminVerification) => `${v.usedCount} / ${VERIFICATION_TRIES}`;

function actionTag(action: VerificationEvent["action"]) {
  if (action === "approve") return <span className={`${a.tag} ${a.tagBrand}`}>승인</span>;
  if (action === "revoke") return <span className={`${a.tag} ${a.tagInk}`}>승인 취소</span>;
  if (action === "reject") return <span className={a.tag}>반려</span>;
  return <span className={a.tag}>닫힘</span>;
}

export function CreatorsPanel({ creators, verifications, events }: Props) {
  const { posted, issued, ended } = adminVerificationTables(verifications);
  const approved = creators.filter((c) => c.verified);
  const approvals = latestApprovals(events);
  const moving = new Set(verifications.filter(isLive).map((v) => v.loginId));
  const [done, setDone] = useState<string | null>(null);

  return (
    <>
      <div className={a.pageHead}>
        <div>
          <h1>크리에이터 본인 확인</h1>
          <p>채널 주인이 맞는지 확인하고 승인해요. 취소하면 찾기에서 사라지고 새 선물·팔로우가 막혀요. 이미 등록된 주문은 그대로 가요.</p>
        </div>
      </div>

      {/* 처리 결과를 한곳에서 알린다 — 처리한 줄은 다시 읽으면 다른 표로 옮겨 가기 때문이다 */}
      <p role="status" className={a.doneLine}>
        {done}
      </p>

      <div className={a.stack}>
        <section aria-labelledby="h-cv-posted">
          <div className={a.sectionH}>
            <h2 id="h-cv-posted" tabIndex={-1}>
              확인 대기 <span>{posted.length}건</span>
            </h2>
            <span>채널 설명란이나 최신 게시물에 인증 코드가 있는지 확인해 주세요</span>
          </div>
          <div className={a.tblWrap}>
            <table className={a.tbl} style={{ minWidth: 980 }}>
              <caption className="sr-only">확인 대기 신청 — 크리에이터가 코드를 올렸다고 알린 신청</caption>
              <thead>
                <tr>
                  <th scope="col">닉네임</th>
                  <th scope="col">채널</th>
                  <th scope="col">인증 코드</th>
                  <th scope="col">게시 확인</th>
                  <th scope="col">올린 시각</th>
                  <th scope="col">쓴 횟수</th>
                  <th scope="col">
                    <span className="sr-only">처리</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {posted.length === 0 ? (
                  <tr>
                    <td colSpan={7} className={a.empty}>
                      확인을 기다리는 신청이 없어요.
                    </td>
                  </tr>
                ) : (
                  posted.map((v) => (
                    <tr key={v.id}>
                      <td>
                        <Who v={v} />
                      </td>
                      <td>
                        <Channel v={v} />
                      </td>
                      <td className={a.mono}>
                        <b>{v.code}</b>
                      </td>
                      <td>
                        <OpenChannel v={v} />
                      </td>
                      <td className={`${a.mono} ${a.nowrap}`}>{v.postedAt ? formatStamp(v.postedAt) : "—"}</td>
                      <td className={`${a.mono} ${a.nowrap}`}>{tries(v)}</td>
                      <td className={a.act}>
                        <ApproveButton applicationId={v.id} creatorName={v.creatorName ?? v.nickname} returnFocusId="h-cv-posted" onDone={setDone} />
                        <RejectButton applicationId={v.id} creatorName={v.creatorName ?? v.nickname} returnFocusId="h-cv-posted" onDone={setDone} />
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </section>

        <section aria-labelledby="h-cv-issued">
          <div className={a.sectionH}>
            <h2 id="h-cv-issued" tabIndex={-1}>
              코드 받음 <span>{issued.length}건</span>
            </h2>
            <span>아직 「코드 올렸어요」를 누르지 않은 신청이에요. 승인은 올린 뒤에만 할 수 있어요</span>
          </div>
          <div className={a.tblWrap}>
            <table className={a.tbl} style={{ minWidth: 820 }}>
              <caption className="sr-only">코드 받음 신청 — 발급 뒤 7일 안에 올려야 하는 신청</caption>
              <thead>
                <tr>
                  <th scope="col">닉네임</th>
                  <th scope="col">채널</th>
                  <th scope="col">인증 코드</th>
                  <th scope="col">받은 시각</th>
                  <th scope="col">쓴 횟수</th>
                  <th scope="col">
                    <span className="sr-only">처리</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {issued.length === 0 ? (
                  <tr>
                    <td colSpan={6} className={a.empty}>
                      코드만 받고 기다리는 신청이 없어요.
                    </td>
                  </tr>
                ) : (
                  issued.map((v) => (
                    <tr key={v.id}>
                      <td>
                        <Who v={v} />
                      </td>
                      <td>
                        <Channel v={v} />
                      </td>
                      <td className={a.mono}>
                        <b>{v.code}</b>
                      </td>
                      <td className={`${a.mono} ${a.nowrap}`}>{formatStamp(v.issuedAt)}</td>
                      <td className={`${a.mono} ${a.nowrap}`}>{tries(v)}</td>
                      <td className={a.act}>
                        <RejectButton applicationId={v.id} creatorName={v.creatorName ?? v.nickname} returnFocusId="h-cv-issued" onDone={setDone} />
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
                  approved.map((c) => {
                    const last = approvals.get(c.id);
                    return (
                      <tr key={c.id}>
                        <td>
                          <strong>{c.name}</strong>
                          {c.loginId && moving.has(c.loginId) ? (
                            <>
                              {" "}
                              <span className={`${a.tag} ${a.tagWarn}`}>채널 이사 중</span>
                            </>
                          ) : null}
                        </td>
                        <td>
                          {c.channel ? <span className={a.tag}>{c.channel}</span> : null} {c.channelTitle}
                        </td>
                        <td>{last?.actorNickname ?? <span className={a.faint}>기록 없음</span>}</td>
                        <td className={`${a.mono} ${a.nowrap}`}>{last ? formatStamp(last.at) : <span className={a.faint}>—</span>}</td>
                        <td className={a.act}>
                          <RevokeButton creatorId={c.id} creatorName={c.name} returnFocusId="h-creators-ok" onDone={setDone} />
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </section>

        <section aria-labelledby="h-cv-ended">
          <div className={a.sectionH}>
            <h2 id="h-cv-ended" tabIndex={-1}>
              끝난 신청
            </h2>
            <span>한 채널로 {VERIFICATION_TRIES}번까지 신청할 수 있어요. 1:1 문의를 보고 횟수를 풀 수 있어요</span>
          </div>
          <div className={a.tblWrap}>
            <table className={a.tbl} style={{ minWidth: 900 }}>
              <caption className="sr-only">끝난 신청 — 승인·반려·거둠·닫힘·기간 지남</caption>
              <thead>
                <tr>
                  <th scope="col">신청 시각</th>
                  <th scope="col">닉네임</th>
                  <th scope="col">채널</th>
                  <th scope="col">확인 방법</th>
                  <th scope="col">상태</th>
                  <th scope="col">쓴 횟수</th>
                  <th scope="col">
                    <span className="sr-only">처리</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {ended.length === 0 ? (
                  <tr>
                    <td colSpan={7} className={a.empty}>
                      끝난 신청이 없어요.
                    </td>
                  </tr>
                ) : (
                  ended.map((v) => (
                    <tr key={v.id}>
                      <td className={`${a.mono} ${a.nowrap}`}>{formatStamp(v.issuedAt)}</td>
                      <td>
                        <Who v={v} />
                      </td>
                      <td>
                        <Channel v={v} />
                      </td>
                      <td>
                        {VERIFICATION_METHOD_LABEL[v.method]}
                        {v.code ? (
                          <>
                            <br />
                            <span className={`${a.mono} ${a.sub}`}>{v.code}</span>
                          </>
                        ) : null}
                      </td>
                      <td>
                        <span className={v.status === "approved" ? `${a.tag} ${a.tagBrand}` : a.tag}>{VERIFICATION_STATUS_LABEL[v.status]}</span>
                      </td>
                      <td className={`${a.mono} ${a.nowrap}`}>{v.method === "code" ? tries(v) : "—"}</td>
                      <td className={a.act}>
                        {v.unlockable ? (
                          <UnlockButton
                            applicationId={v.id}
                            creatorName={v.creatorName ?? v.nickname}
                            channelLabel={platformLabel(v.platform)}
                            usedCount={v.usedCount}
                            returnFocusId="h-cv-ended"
                            onDone={setDone}
                          />
                        ) : null}
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
            <table className={a.tbl} style={{ minWidth: 820 }}>
              <caption className="sr-only">승인·반려·닫힘·승인 취소 기록</caption>
              <thead>
                <tr>
                  <th scope="col">시각</th>
                  <th scope="col">누가</th>
                  <th scope="col">크리에이터</th>
                  <th scope="col">처리</th>
                  <th scope="col">그때의 채널 · 코드</th>
                </tr>
              </thead>
              <tbody>
                {events.length === 0 ? (
                  <tr>
                    <td colSpan={5} className={a.empty}>
                      아직 처리 기록이 없어요.
                    </td>
                  </tr>
                ) : (
                  events.map((e, i) => {
                    const reason = eventReasonLabel(e.action, e.reasonCode);
                    return (
                      <tr key={`${e.at}-${e.creatorId}-${i}`}>
                        <td className={`${a.mono} ${a.nowrap}`}>{formatStamp(e.at)}</td>
                        <td>{e.actorNickname}</td>
                        <td>{e.creatorName}</td>
                        <td>
                          {actionTag(e.action)}
                          {reason ? <span> {reason}</span> : null}
                          {e.reason !== "" && <span className={a.sub}> · 메모: {e.reason}</span>}
                        </td>
                        <td>
                          {e.method ? <span>{VERIFICATION_METHOD_LABEL[e.method]}</span> : <span className={a.faint}>—</span>}
                          {e.code ? <span className={`${a.mono} ${a.sub}`}> {e.code}</span> : null}
                          {e.channelUrl ? (
                            <>
                              <br />
                              <span className={`${a.mono} ${a.sub}`} style={{ wordBreak: "break-all" }}>
                                {e.channelUrl}
                              </span>
                            </>
                          ) : null}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </>
  );
}
