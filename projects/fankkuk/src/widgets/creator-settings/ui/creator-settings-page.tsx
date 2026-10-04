"use client";

import { useState } from "react";
import type { BlockedFan, CreatorSettingsView } from "@/entities/creator/api/sample-creator-settings";
import { APPROVAL_DEADLINE_DAYS } from "@/entities/order/config/approval-deadline";
import { formatDate } from "@/shared/lib/format/datetime";
import { BottomSheet } from "@/shared/ui/bottom-sheet";
import { FaceAvatar } from "@/shared/ui/face-avatar";
import { KakaoBubble } from "@/shared/ui/kakao-bubble";
import s from "./creator-settings.module.css";

// 크리에이터 — 주소와 설정. 시안: docs/design/mockups/site/v4/creator-settings.html
//
// 주소 변경·차단 풀기는 카카오톡 인증서 재서명이 필요한 동작이라(INV-P11 — 로그인 세션만으로는 주소를 바꿀 수 없다)
// 서명이 붙기 전까지 아무 일도 하지 않는다. 확인 창의 「카카오톡으로 서명하기」도 창을 닫기만 한다.
// 주소는 값을 받지 않는다 — 「등록돼 있는가」만 보여 준다. 프로필 저장·알림 스위치도 예시라 서버에 보내지 않는다.

type SheetState = { kind: "address" } | { kind: "unblock"; fan: string } | null;

function Switch({
  id,
  title,
  desc,
  checked,
  onChange,
}: {
  id: string;
  title: string;
  desc: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <div className={s["switch-row"]}>
      <label className={s.txt} htmlFor={id}>
        <strong>{title}</strong>
        <span className="sub">{desc}</span>
      </label>
      <input
        className={s.switch}
        type="checkbox"
        role="switch"
        id={id}
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
      />
    </div>
  );
}

export function CreatorSettingsPage({ settings, blockedFans }: { settings: CreatorSettingsView; blockedFans: readonly BlockedFan[] }) {
  const [sheet, setSheet] = useState<SheetState>(null);
  const [publicName, setPublicName] = useState(settings.publicName);
  const [visible, setVisible] = useState(settings.visibleInSearch);
  const [notify, setNotify] = useState(settings.notify);

  return (
    <div>
      <div className="panel-title">
        <h2 className="panel-h">주소와 설정</h2>
        <p>선물을 받을 주소와 차단한 팬, 프로필, 알림을 한곳에서 관리해요.</p>
        {/* 주소 저장·차단 목록은 아직 DB 에 연결되지 않아 지어낸 값이다 */}
        <p className="hint">지금 보이는 주소와 차단 목록은 예시예요. 저장 기능을 연결하면 실제 값이 보여요.</p>
      </div>

      <div className={s["set-grid"]}>
        <div className={s.col}>
          <section aria-labelledby="addr-h">
            <div className={s["s-head"]}>
              <h3 id="addr-h">받는 주소</h3>
              {settings.addressRegistered ? <span className="tag tag--brand">등록됨</span> : <span className="tag">등록 전</span>}
            </div>
            <div className={s.addr}>
              <img className={`asset ${s["addr-ico"]}`} src="/img/icon-address-lock.png" alt="" aria-hidden="true" width={72} height={72} />
              <div>
                <p className={s["addr-t"]}>{settings.addressRegistered ? "주소가 안전하게 등록돼 있어요" : "아직 주소를 등록하지 않았어요"}</p>
                <p className="sub">
                  {settings.addressRegistered ? "브라우저에서 잠가 보냈어요. 저희 화면에는 보이지 않아요." : "등록하면 브라우저에서 잠가 보내요. 저희 화면에는 보이지 않아요."}
                </p>
              </div>
            </div>
            <p className={`sub ${s.note}`}>아직 출력하지 않은 주문은 바뀐 주소로 나가요.</p>
            <button className="btn btn--line" type="button" onClick={() => setSheet({ kind: "address" })}>
              주소 바꾸기
            </button>
          </section>

          <section id="blocked" className={s.anchor} aria-labelledby="block-h">
            <div className={s["s-head"]}>
              <h3 id="block-h">차단한 팬</h3>
              <span className="tag">{blockedFans.length}명</span>
            </div>
            {blockedFans.length === 0 ? (
              <p className="sub">차단한 팬이 없어요.</p>
            ) : (
              <ul className={s.blist}>
                {blockedFans.map((f, i) => (
                  <li key={f.fanNickname} className={s.brow}>
                    <FaceAvatar index={i} />
                    <div className={s.who}>
                      <strong>{f.fanNickname}</strong>
                      <span className="sub">{formatDate(f.blockedAt)} 차단</span>
                    </div>
                    <button
                      className="btn btn--soft btn--sm"
                      type="button"
                      aria-label={`${f.fanNickname}님 차단 풀기`}
                      onClick={() => setSheet({ kind: "unblock", fan: f.fanNickname })}
                    >
                      차단 풀기
                    </button>
                  </li>
                ))}
              </ul>
            )}
            <p className={`sub ${s.note}`}>차단을 풀 때도 카카오톡 인증서 서명이 필요해요.</p>
          </section>
        </div>

        <div className={s.col}>
          <section aria-labelledby="prof-h">
            <div className={s["s-head"]}>
              <h3 id="prof-h">프로필</h3>
            </div>
            <div className="field">
              <label htmlFor="pub-name">공개 이름</label>
              <input
                className="input"
                id="pub-name"
                value={publicName}
                onChange={(e) => setPublicName(e.target.value)}
                aria-describedby="pub-name-hint"
              />
              <p className="hint" id="pub-name-hint">
                팬에게 보이는 이름이에요.
              </p>
            </div>
            <dl className={s.kv}>
              <div>
                <dt>방송 채널</dt>
                <dd>{settings.channelTitle}</dd>
              </div>
              <div>
                <dt>본인 확인</dt>
                <dd>
                  {settings.verifiedAt ? (
                    <>
                      <span className="tag tag--brand">확인 완료</span> <span className="sub">{formatDate(settings.verifiedAt)} 방송 채널 인증</span>
                    </>
                  ) : (
                    <span className="tag">확인 전</span>
                  )}
                </dd>
              </div>
            </dl>
            <Switch id="sw-find" title="크리에이터 찾기에 보이기" desc="끄면 검색 결과에 나타나지 않아요." checked={visible} onChange={setVisible} />
            <button className={`btn ${s.save}`} type="button">
              프로필 저장
            </button>
          </section>

          <section aria-labelledby="alarm-h">
            <div className={s["s-head"]}>
              <h3 id="alarm-h">알림 받기</h3>
            </div>
            <Switch
              id="sw-a1"
              title="새 승인 요청"
              desc="팬이 선물을 등록하면 카카오톡으로 알려드려요."
              checked={notify.newRequest}
              onChange={(v) => setNotify((n) => ({ ...n, newRequest: v }))}
            />
            <Switch
              id="sw-a2"
              title="자동 반려 하루 전"
              desc={`${APPROVAL_DEADLINE_DAYS}일이 다 되어 가는 요청을 알려드려요.`}
              checked={notify.expiringSoon}
              onChange={(v) => setNotify((n) => ({ ...n, expiringSoon: v }))}
            />
            <Switch
              id="sw-a3"
              title="주소가 열릴 때"
              desc="송장을 출력해 주소가 열릴 때마다 알려드려요."
              checked={notify.addressOpened}
              onChange={(v) => setNotify((n) => ({ ...n, addressOpened: v }))}
            />
          </section>
        </div>
      </div>

      <BottomSheet
        open={sheet !== null}
        title={sheet?.kind === "unblock" ? `${sheet.fan}님의 차단을 풀까요?` : "주소를 바꿀까요?"}
        onClose={() => setSheet(null)}
      >
        {sheet?.kind === "unblock" ? (
          <p>차단을 풀려면 카카오톡 인증서 서명이 필요해요. 풀면 이 팬이 다시 선물을 보낼 수 있어요.</p>
        ) : (
          <>
            <p>주소를 바꾸려면 카카오톡 인증서 서명이 필요해요. 로그인만으로는 바꿀 수 없어요.</p>
            <p className={`sub ${s["sheet-sub"]}`}>새 주소도 이 브라우저에서 잠가서 보내요. 아직 출력하지 않은 주문은 바뀐 주소로 나가요.</p>
          </>
        )}
        <div className={s["sheet-btns"]}>
          <button className="btn btn--soft" type="button" onClick={() => setSheet(null)}>
            돌아가기
          </button>
          <button className="btn btn--kakao" type="button" onClick={() => setSheet(null)}>
            <KakaoBubble />
            카카오톡으로 서명하기
          </button>
        </div>
      </BottomSheet>
    </div>
  );
}
