"use client";

import { useState } from "react";
import { latestApprovals, type AdminCreator, type NameChange, type VerificationEvent } from "@/entities/creator/model/admin-creator";
import type { AdminTagOption, BannedWord, CustomTagCount } from "@/entities/creator/model/creator-tags";
import {
  adminVerificationTables,
  eventReasonLabel,
  isOperatorCheckedApplication,
  isLive,
  platformLabel,
  VERIFICATION_METHOD_LABEL,
  VERIFICATION_STATUS_LABEL,
  VERIFICATION_TRIES,
  type AdminVerification,
} from "@/entities/creator/model/creator-verification";
import { giftLinkText } from "@/entities/creator/model/gift-link-match";
import { ApproveButton } from "@/features/admin-creator-verify/ui/approve-button";
import { RejectButton } from "@/features/admin-creator-verify/ui/reject-button";
import { RevokeButton } from "@/features/admin-creator-verify/ui/revoke-button";
import { UnlockButton } from "@/features/admin-creator-verify/ui/unlock-button";
import { BANNED_TITLE_ID, BannedWordsTable, CustomTagsTable, TagOptionsTable } from "@/features/admin-creator-tags/ui/tag-options-manager";
import { formatStamp } from "@/shared/lib/format/datetime";
import a from "@/shared/ui/admin.module.css";

// 관리자 「크리에이터 확인」 본문 (creator-verification INV-V5·V6·V9·V11·V13·V15, admin-console INV-K10·K8, 시안 admin/creators.html).
// 확인 대기 표 — 채널 이름·찾을 링크(요청 때의 팬꾹 링크)·채널 열기·승인·반려(INV-V18·V19), 끝난 요청(횟수 풀기). 사람은 닉네임·아이디로만(INV-K8).
// 2026-11-02 팬꾹 링크 게시 확인으로 바꾸며 코드 받음 표와 인증 코드 칸을 뺐다 — 타입에 맞춘 최소 수정이다. 재확인·유예 묶음(INV-V20)은 시안 승인 뒤 더한다.
// 「채널 열기」는 서버가 채널 키로 다시 만든 주소만 연다(INV-V2) — 크리에이터가 적은 문자열이 아니다.

type Props = {
  creators: readonly AdminCreator[];
  verifications: readonly AdminVerification[];
  events: readonly VerificationEvent[];
  /** 공개 이름 바꾼 기록(my-account INV-A9) — 크리에이터가 운영자 확인 없이 바꾼다. 사칭 신고가 오면 이 기록으로 판단한다. */
  nameChanges: readonly NameChange[];
  /** 태그 선택지(숨긴 것 포함, 순서대로)와 크리에이터가 직접 입력한 태그(같은 말 묶음) — creator-tags INV-T1·T5 */
  tagOptions: readonly AdminTagOption[];
  customTags: readonly CustomTagCount[];
  bannedWords: readonly BannedWord[];
};

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
      채널 열기 ↗
    </a>
  );
}

const tries = (v: AdminVerification) => `${v.usedCount} / ${VERIFICATION_TRIES}`;

function actionTag(action: VerificationEvent["action"]) {
  if (action === "approve") return <span className={`${a.tag} ${a.tagBrand}`}>승인</span>;
  if (action === "revoke") return <span className={`${a.tag} ${a.tagInk}`}>승인 취소</span>;
  if (action === "reject") return <span className={a.tag}>반려</span>;
  if (action === "recheck_found") return <span className={a.tag}>재확인 · 링크 있음</span>;
  if (action === "recheck_missing") return <span className={`${a.tag} ${a.tagWarn}`}>재확인 · 링크 없음</span>;
  return <span className={a.tag}>닫힘</span>;
}

export function CreatorsPanel({ creators, verifications, events, nameChanges, tagOptions, customTags, bannedWords }: Props) {
  const { posted, ended } = adminVerificationTables(verifications);
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
            <span>채널 이름이 가입 때 적은 이름과 같고 팬꾹 링크가 채널 소개·링크 칸에 있는지 확인해 주세요</span>
          </div>
          <div className={a.tblWrap}>
            <table className={a.tbl} style={{ minWidth: 980 }}>
              <caption className="sr-only">확인 대기 신청 — 크리에이터가 운영자 확인을 요청한 신청</caption>
              <thead>
                <tr>
                  <th scope="col">닉네임</th>
                  <th scope="col">채널</th>
                  <th scope="col">찾을 링크</th>
                  <th scope="col">채널 확인</th>
                  <th scope="col">요청 시각</th>
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
                        <b>{v.linkHandle ? giftLinkText(v.linkHandle) : "—"}</b>
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
                              <span className={`${a.tag} ${a.tagWarn}`}>채널 변경 중</span>
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
              <caption className="sr-only">끝난 신청 — 승인·반려·거둠·닫힘·기한 지남</caption>
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
                        {v.linkHandle ? (
                          <>
                            <br />
                            <span className={`${a.mono} ${a.sub}`}>{giftLinkText(v.linkHandle)}</span>
                          </>
                        ) : null}
                      </td>
                      <td>
                        <span className={v.status === "approved" ? `${a.tag} ${a.tagBrand}` : a.tag}>{VERIFICATION_STATUS_LABEL[v.status]}</span>
                      </td>
                      <td className={`${a.mono} ${a.nowrap}`}>{isOperatorCheckedApplication(v.method) ? tries(v) : "—"}</td>
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
                  <th scope="col">그때의 채널 · 링크</th>
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
                          {e.linkHandle ? <span className={`${a.mono} ${a.sub}`}> {giftLinkText(e.linkHandle)}</span> : null}
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

        <section aria-labelledby="h-creator-tags">
          <div className={a.sectionH}>
            <h2 id="h-creator-tags">
              태그 선택지 <span>{tagOptions.length}개</span>
            </h2>
            <span>크리에이터가 고르는 목록이자 찾기·메인의 칩이에요 · 숨겨도 고른 기록은 남아요</span>
          </div>
          <TagOptionsTable options={tagOptions} onDone={setDone} />
        </section>

        <section aria-labelledby="h-creator-custom-tags">
          <div className={a.sectionH}>
            <h2 id="h-creator-custom-tags">
              직접 입력한 태그 <span>{customTags.length}개</span>
            </h2>
            <span>카드에 선택지 뒤로 보여요(찾기 칩은 아니에요) · 선택지에 넣으면 칩이 되고, 지우면 적은 크리에이터 모두의 태그에서 빠져요</span>
          </div>
          <CustomTagsTable rows={customTags} onDone={setDone} />
        </section>

        <section aria-labelledby={BANNED_TITLE_ID}>
          <div className={a.sectionH}>
            <h2 id={BANNED_TITLE_ID} tabIndex={-1}>
              태그 금칙어 <span>{bannedWords.length}개</span>
            </h2>
            <span>직접 입력과 선택지 이름에 쓸 수 없어요 · 띄어쓰기·기호는 무시하고 비교해요 · 전화번호·이메일·주소 꼴은 따로 막아요</span>
          </div>
          <BannedWordsTable words={bannedWords} onDone={setDone} />
        </section>

        <section aria-labelledby="h-creators-names">
          <div className={a.sectionH}>
            <h2 id="h-creators-names">공개 이름 바꾼 기록</h2>
            <span>크리에이터가 직접 바꿔요 · 채널은 승인으로만 바뀌어요</span>
          </div>
          <div className={a.tblWrap}>
            <table className={a.tbl} style={{ minWidth: 640 }}>
              <caption className="sr-only">크리에이터 공개 이름 바꾼 기록 — 언제·전·후</caption>
              <thead>
                <tr>
                  <th scope="col">시각</th>
                  <th scope="col">크리에이터</th>
                  <th scope="col">바꾸기 전</th>
                  <th scope="col">바꾼 뒤</th>
                </tr>
              </thead>
              <tbody>
                {nameChanges.length === 0 ? (
                  <tr>
                    <td colSpan={4} className={a.empty}>
                      아직 공개 이름을 바꾼 크리에이터가 없어요.
                    </td>
                  </tr>
                ) : (
                  nameChanges.map((n, i) => (
                    <tr key={`${n.at}-${n.creatorId}-${i}`}>
                      <td className={`${a.mono} ${a.nowrap}`}>{formatStamp(n.at)}</td>
                      <td>
                        <strong>{n.creatorName}</strong>
                        {n.loginId ? (
                          <>
                            <br />
                            <span className={`${a.mono} ${a.sub}`}>{n.loginId}</span>
                          </>
                        ) : null}
                      </td>
                      <td>{n.beforeName}</td>
                      <td>{n.afterName}</td>
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
