"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import type { BlockedFan } from "@/entities/creator/api/blocked-senders";
import type { CreatorSettingsView } from "@/entities/creator/api/sample-creator-settings";
import { APPROVAL_DEADLINE_DAYS } from "@/entities/order/config/approval-deadline";
import { formatDate } from "@/shared/lib/format/datetime";
import { BottomSheet } from "@/shared/ui/bottom-sheet";
import { FaceAvatar } from "@/shared/ui/face-avatar";
import type { MyAddressStatus } from "@/entities/creator/api/my-address-status";
import { AddressChangeForm } from "@/features/creator-address/ui/address-change-form";
import { sendUnblock } from "@/features/creator-unblock/api/send-unblock";
import s from "./creator-settings.module.css";

// 크리에이터 — 주소와 설정. 시안: docs/design/mockups/site/v4/creator-settings.html
//
// 주소 등록·변경(address-protection INV-P13): 확인 창에서 주소를 입력하고 「카카오톡으로 서명하기」를 누르면 이 브라우저에서 봉인해 보낸다.
// 카카오 재서명 자리는 지금 로컬 가짜 서명 창구가 맡고(카드 d28), 운영에서는 서버가 창구가 없어 거부한다.
// 「등록됨」은 서버에 저장된 뒤에만 바뀐다. 처음 그리는 값은 DB 읽기 함수(my_creator_address_status)의 등록 여부다.
// 차단 풀기는 로그인 세션으로 저장한다(decline-block INV-D10, 카드 d26) — 풀어도 주소는 열리지 않고, 새 선물은 건마다 서명 승인이 있어야 나간다.
// 주소는 값을 받지 않는다 — 「등록돼 있는가」만 보여 준다. 프로필 저장·알림 스위치는 아직 예시라 서버에 보내지 않는다.

type SheetState = { kind: "address" } | { kind: "unblock"; fan: BlockedFan } | null;

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

export function CreatorSettingsPage({
  settings,
  address,
  sealingKeyPem,
  blockedFans,
}: {
  settings: CreatorSettingsView;
  address: MyAddressStatus;
  /** 주소 봉인 공개키(PEM). 없으면 주소 입력 대신 안내만 보인다. */
  sealingKeyPem: string | null;
  blockedFans: readonly BlockedFan[];
}) {
  const router = useRouter();
  const [sheet, setSheet] = useState<SheetState>(null);
  const [addressRegistered, setAddressRegistered] = useState(address.registered);
  const [blocked, setBlocked] = useState(blockedFans);
  const [saving, setSaving] = useState(false);
  const [unblockError, setUnblockError] = useState<string | null>(null);

  // 서버에 저장된 뒤에만 목록에서 뺀다. 실패하면 창을 닫지 않고 이유를 보인다.
  const confirmUnblock = async (fan: BlockedFan) => {
    if (saving) return;
    setSaving(true);
    setUnblockError(null);
    const r = await sendUnblock(fan.blockId);
    setSaving(false);
    if (r.kind === "ok") {
      setBlocked((list) => list.filter((f) => f.blockId !== fan.blockId));
      setSheet(null);
      return;
    }
    if (r.kind === "login") {
      router.push("/login");
      return;
    }
    setUnblockError(r.kind === "refused" ? r.message : "저장하지 못했어요. 잠시 뒤 다시 해 주세요.");
  };
  const [publicName, setPublicName] = useState(settings.publicName);
  const [visible, setVisible] = useState(settings.visibleInSearch);
  const [notify, setNotify] = useState(settings.notify);

  return (
    <div>
      <div className="panel-title">
        <h2 className="panel-h">주소와 설정</h2>
        <p>선물을 받을 주소와 차단한 팬, 프로필, 알림을 한곳에서 관리해요.</p>
        {/* 프로필·알림은 아직 DB 에 연결되지 않아 지어낸 값이다 */}
        <p className="hint">프로필과 알림은 아직 예시예요. 저장 기능을 연결하면 실제 값이 보여요.</p>
      </div>

      <div className={s["set-grid"]}>
        <div className={s.col}>
          <section aria-labelledby="addr-h">
            <div className={s["s-head"]}>
              <h3 id="addr-h">받는 주소</h3>
              {addressRegistered ? <span className="tag tag--brand">등록됨</span> : <span className="tag">등록 전</span>}
            </div>
            <div className={s.addr}>
              <img className={`asset ${s["addr-ico"]}`} src="/img/icon-address-lock.png" alt="" aria-hidden="true" width={72} height={72} />
              <div>
                <p className={s["addr-t"]}>{addressRegistered ? "주소가 안전하게 등록돼 있어요" : "아직 주소를 등록하지 않았어요"}</p>
                <p className="sub">
                  {addressRegistered ? "브라우저에서 잠가 보냈어요. 저희 화면에는 보이지 않아요." : "등록하면 브라우저에서 잠가 보내요. 저희 화면에는 보이지 않아요."}
                </p>
              </div>
            </div>
            <p className={`sub ${s.note}`}>아직 출력하지 않은 주문은 바뀐 주소로 나가요.</p>
            <button className="btn btn--line" type="button" onClick={() => setSheet({ kind: "address" })}>
              {addressRegistered ? "주소 바꾸기" : "주소 등록하기"}
            </button>
          </section>

          <section id="blocked" className={s.anchor} aria-labelledby="block-h">
            <div className={s["s-head"]}>
              <h3 id="block-h">차단한 팬</h3>
              <span className="tag">{blocked.length}명</span>
            </div>
            {blocked.length === 0 ? (
              <p className="sub">차단한 팬이 없어요.</p>
            ) : (
              <ul className={s.blist}>
                {blocked.map((f, i) => (
                  <li key={f.blockId} className={s.brow}>
                    <FaceAvatar index={i} />
                    <div className={s.who}>
                      <strong>{f.fanNickname}</strong>
                      <span className="sub">{formatDate(f.blockedAt)} 차단</span>
                    </div>
                    <button
                      className="btn btn--soft btn--sm"
                      type="button"
                      aria-label={`${f.fanNickname}님 차단 풀기`}
                      onClick={() => {
                        setUnblockError(null);
                        setSheet({ kind: "unblock", fan: f });
                      }}
                    >
                      차단 풀기
                    </button>
                  </li>
                ))}
              </ul>
            )}
            <p className={`sub ${s.note}`}>차단을 풀어도 주소는 열리지 않아요. 새 선물도 한 건씩 카카오톡 서명으로 승인해야 나가요.</p>
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
        title={sheet?.kind === "unblock" ? `${sheet.fan.fanNickname}님의 차단을 풀까요?` : addressRegistered ? "주소를 바꿀까요?" : "주소를 등록할까요?"}
        onClose={() => setSheet(null)}
      >
        {sheet?.kind === "unblock" ? (
          <>
            <p>풀면 이 팬이 다시 선물을 보낼 수 있어요. 받지 않은 지난 선물은 그대로예요.</p>
            <p className={`sub ${s["sheet-sub"]}`}>새로 온 선물도 한 건씩 카카오톡 서명으로 승인해야 주소가 열려요.</p>
            {unblockError ? (
              <p className={s.error} role="alert">
                <span className={s["error-mark"]} aria-hidden="true">
                  !
                </span>
                {unblockError}
              </p>
            ) : null}
            <div className={s["sheet-btns"]}>
              <button className="btn btn--soft" type="button" onClick={() => setSheet(null)}>
                돌아가기
              </button>
              <button className="btn" type="button" disabled={saving} onClick={() => void confirmUnblock(sheet.fan)}>
                {saving ? "저장하는 중…" : "차단 풀기"}
              </button>
            </div>
          </>
        ) : (
          <>
            <p>주소를 {addressRegistered ? "바꾸" : "등록하"}려면 카카오톡 인증서 서명이 필요해요. 로그인만으로는 바꿀 수 없어요.</p>
            <p className={`sub ${s["sheet-sub"]}`}>새 주소도 이 브라우저에서 잠가서 보내요. 아직 출력하지 않은 주문은 바뀐 주소로 나가요.</p>
            {sealingKeyPem ? (
              <AddressChangeForm
                creatorId={address.creatorId}
                sealingKeyPem={sealingKeyPem}
                onSaved={() => {
                  // 서버에 저장된 뒤에만 「등록됨」으로 바꾼다
                  setAddressRegistered(true);
                  setSheet(null);
                  router.refresh();
                }}
                onCancel={() => setSheet(null)}
                onLoginExpired={() => router.push("/login")}
              />
            ) : (
              <>
                <p className={s.error} role="status">
                  <span className={s["error-mark"]} aria-hidden="true">
                    !
                  </span>
                  주소 보호 설정이 아직 안 돼 있어요. 지금은 주소를 등록할 수 없어요.
                </p>
                <div className={s["sheet-btns"]}>
                  <button className="btn btn--soft" type="button" onClick={() => setSheet(null)}>
                    돌아가기
                  </button>
                </div>
              </>
            )}
          </>
        )}
      </BottomSheet>
    </div>
  );
}
