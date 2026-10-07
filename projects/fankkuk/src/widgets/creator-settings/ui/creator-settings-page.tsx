"use client";

import { statusTagClass } from "@/shared/ui/status-tone";
import { useRouter } from "next/navigation";
import { useState } from "react";
import type { BlockedFan } from "@/entities/creator/api/blocked-senders";
import type { CreatorSettingsView } from "@/entities/creator/model/creator-settings";
import { resolveTagSelection, type TagOption } from "@/entities/creator/model/creator-tags";
import { sendCreatorTags } from "@/features/creator-tags-edit/api/send-creator-tags";
import { TagPicker } from "@/features/creator-tags-edit/ui/tag-picker";
import { APPROVAL_DEADLINE_DAYS } from "@/entities/order/config/approval-deadline";
import { sendCreatorNotify, sendCreatorProfile } from "@/features/creator-settings-save/api/send-creator-settings";
import { clipChars, INTRO_MAX, PUBLIC_NAME_MAX } from "@/features/creator-settings-save/model/creator-settings-input";
import { formatDate } from "@/shared/lib/format/datetime";
import { charCount } from "@/shared/lib/validation/char-count";
import { BottomSheet } from "@/shared/ui/bottom-sheet";
import { FaceAvatar } from "@/shared/ui/face-avatar";
import type { MyAddressStatus } from "@/entities/creator/api/my-address-status";
import type { MyVerification, MyVerificationState } from "@/entities/creator/model/creator-verification";
import { AddressChangeForm } from "@/features/creator-address/ui/address-change-form";
import { PasswordChangePanel } from "@/features/password-change/ui/password-change-panel";
import { PhoneChangePanel } from "@/features/phone-change/ui/phone-change-panel";
import { VerificationPanel } from "@/features/creator-verify/ui/verification-panel";
import { sendUnblock } from "@/features/creator-unblock/api/send-unblock";
import s from "./creator-settings.module.css";

// 크리에이터 — 주소와 설정. 시안: docs/design/mockups/site/v4/creator-settings.html
//
// 주소 등록·변경(address-protection INV-P13): 확인 창에서 주소를 입력하고 「카카오톡으로 서명하기」를 누르면 이 브라우저에서 봉인해 보낸다.
// 카카오 재서명 자리는 지금 로컬 가짜 서명 창구가 맡고(카드 d28), 운영에서는 서버가 창구가 없어 거부한다.
// 「등록됨」은 서버에 저장된 뒤에만 바뀐다. 처음 그리는 값은 DB 읽기 함수(my_creator_address_status)의 등록 여부다.
// 차단 풀기는 로그인 세션으로 저장한다(decline-block INV-D10, 카드 d26) — 풀어도 주소는 열리지 않고, 새 선물은 건마다 서명 승인이 있어야 나간다.
// 주소는 값을 받지 않는다 — 「등록돼 있는가」만 보여 준다.
// 프로필(공개 이름·소개글·찾기 노출)은 「프로필 저장」으로 보낸다(my-account INV-A9·A10). 공개 이름은 운영자 확인 없이 바뀌고 바꾼 기록이 남는다.
// 찾기 노출을 끄면 크리에이터 찾기 목록에서만 빠진다 — 페이지·팔로우·새 선물은 그대로다.
// 알림은 카카오·이메일 두 스위치이고 누르는 즉시 저장한다(INV-A11). 저장에 실패하면 스위치를 되돌리고 이유를 보인다.
// 승인 요청은 두 칸이 꺼져도 가므로 끄는 스위치가 없다(notifications INV-N6).
// 채널 본인 확인(creator-verification)은 DB 읽기 함수(my_creator_verification_state · my_creator_verifications)의 값이다 —
// 프로필 칸의 방송 채널·본인 확인도 그 값을 쓴다.

type SheetState = { kind: "address" } | { kind: "unblock"; fan: BlockedFan } | null;

function Switch({
  id,
  title,
  desc,
  checked,
  onChange,
  busy = false,
}: {
  id: string;
  title: string;
  desc: string;
  checked: boolean;
  onChange: (v: boolean) => void;
  /** 저장하는 동안 — 겹쳐 누르지 않게 막는다(포커스는 남긴다). */
  busy?: boolean;
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
        aria-disabled={busy}
        onChange={(e) => {
          if (!busy) onChange(e.target.checked);
        }}
      />
    </div>
  );
}

export function CreatorSettingsPage({
  settings,
  tagOptions,
  address,
  sealingKeyPem,
  blockedFans,
  verification,
}: {
  settings: CreatorSettingsView;
  /** 고를 수 있는 태그 선택지(숨기지 않은 것, 선택지 순서 — creator-tags INV-T3) */
  tagOptions: readonly TagOption[];
  address: MyAddressStatus;
  /** 주소 봉인 공개키(PEM). 없으면 주소 입력 대신 안내만 보인다. */
  sealingKeyPem: string | null;
  blockedFans: readonly BlockedFan[];
  verification: { state: MyVerificationState; rows: readonly MyVerification[]; apiPlatforms: readonly string[] };
}) {
  const router = useRouter();
  const [sheet, setSheet] = useState<SheetState>(null);
  const [security, setSecurity] = useState<"phone" | "password" | null>(null);
  const toggleSecurity = (which: "phone" | "password") => setSecurity((cur) => (cur === which ? null : which));
  const toLogin = () => router.push("/login?next=/creator/settings");
  const [addressRegistered, setAddressRegistered] = useState(address.registered);
  // 저장된 뒤에만 띄우는 확인 문구 — 바꾼 뒤에도 같은 「등록됨」이라 문구가 없으면 바뀌었는지 알 수 없다
  const [addressMsg, setAddressMsg] = useState<string | null>(null);
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
  const [intro, setIntro] = useState(settings.intro);
  const [visible, setVisible] = useState(settings.visibleInSearch);
  const [tagIds, setTagIds] = useState<string[]>([...settings.tagIds]);
  const [customTag, setCustomTag] = useState(settings.customTag);
  const [tagsBad, setTagsBad] = useState(false);
  const [profileSaving, setProfileSaving] = useState(false);
  const [profileMsg, setProfileMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [notify, setNotify] = useState(settings.notify);
  const [notifySaving, setNotifySaving] = useState(false);
  const [notifyMsg, setNotifyMsg] = useState<{ ok: boolean; text: string } | null>(null);

  // 서버가 저장한 뒤에만 「저장했어요」. 입력 검사는 서버가 다시 한다 — 화면은 서버가 준 문구를 그대로 보인다.
  // 태그(creator-tags INV-T3)는 화면에서 먼저 1~5개인지 보고, 프로필을 저장한 뒤 이어서 저장한다(서로 다른 DB 함수).
  const saveProfile = async () => {
    if (profileSaving) return;
    setProfileMsg(null);
    const tags = resolveTagSelection(tagOptions, tagIds, customTag);
    setTagsBad(!tags.ok);
    if (!tags.ok) {
      setProfileMsg({ ok: false, text: tags.message });
      return;
    }
    setProfileSaving(true);
    const r = await sendCreatorProfile({ name: publicName, intro, searchable: visible });
    const t = r.kind === "ok" ? await sendCreatorTags({ tagIds: tags.tagIds, customTag: tags.customTag }) : r;
    setProfileSaving(false);
    if (r.kind === "login" || t.kind === "login") {
      router.push("/login");
      return;
    }
    if (r.kind === "failed") {
      setProfileMsg({ ok: false, text: r.message });
      return;
    }
    if (t.kind === "failed") {
      setTagsBad(true);
      setProfileMsg({ ok: false, text: t.message });
      router.refresh(); // 공개 이름은 저장됐다 — 머리 메뉴를 새로. 태그 선택지가 바뀌었으면 새 목록으로
      return;
    }
    setProfileMsg({ ok: true, text: "프로필을 저장했어요." });
    router.refresh(); // 머리 메뉴의 이름도 새 공개 이름으로
  };

  // 스위치는 누르는 즉시 저장한다. 실패하면 화면 값을 저장된 값으로 되돌린다.
  const toggleNotify = async (key: "kakao" | "email", value: boolean) => {
    if (notifySaving) return;
    const before = notify;
    const next = { ...notify, [key]: value };
    setNotify(next);
    setNotifySaving(true);
    setNotifyMsg(null);
    const r = await sendCreatorNotify(next);
    setNotifySaving(false);
    if (r.kind === "login") {
      router.push("/login");
      return;
    }
    if (r.kind === "ok") {
      setNotifyMsg({ ok: true, text: "알림 설정을 저장했어요." });
      return;
    }
    setNotify(before);
    setNotifyMsg({ ok: false, text: r.message });
  };

  return (
    <div>
      <div className="panel-title">
        <h2 className="panel-h">주소와 설정</h2>
        <p>채널 본인 확인, 선물을 받을 주소, 차단한 팬, 프로필, 알림, 계정 보안을 한곳에서 관리해요.</p>
      </div>

      <div className={s["set-grid"]}>
        <div className={s.col}>
          <VerificationPanel state={verification.state} rows={verification.rows} apiPlatforms={verification.apiPlatforms} />

          <section aria-labelledby="addr-h">
            <div className={s["s-head"]}>
              <h3 id="addr-h">받는 주소</h3>
              {addressRegistered ? <span className={statusTagClass("success")}>등록됨</span> : <span className={statusTagClass("plain")}>등록 전</span>}
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
            <p className={`sub ${s.note}`}>
              {addressRegistered ? "아직 출력하지 않은 주문은 바뀐 주소로 나가요." : "등록하면 아직 출력하지 않은 주문부터 이 주소로 나가요."}
            </p>
            <button
              className="btn btn--line"
              type="button"
              onClick={() => {
                setAddressMsg(null);
                setSheet({ kind: "address" });
              }}
            >
              {addressRegistered ? "주소 바꾸기" : "주소 등록하기"}
            </button>
            <p className={`sub ${s["save-msg"]}`} role="status">
              {addressMsg ?? ""}
            </p>
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
                // 글자 수는 저장 검사와 같은 셈(코드 포인트)으로 막는다 — maxLength 는 이모지를 두 글자로 센다
                onChange={(e) => setPublicName(clipChars(e.target.value, PUBLIC_NAME_MAX))}
                aria-describedby="pub-name-hint"
              />
              <p className="hint" id="pub-name-hint">
                팬에게 보이는 이름이에요. {PUBLIC_NAME_MAX}자까지, 언제든 바꿀 수 있어요. 바꾼 기록은 운영팀이 볼 수 있어요.
              </p>
            </div>
            <div className={`field ${s["intro-field"]}`}>
              <label htmlFor="pub-intro">소개글</label>
              <textarea
                className={`input ${s.textarea}`}
                id="pub-intro"
                rows={3}
                value={intro}
                onChange={(e) => setIntro(clipChars(e.target.value, INTRO_MAX))}
                aria-describedby="pub-intro-hint"
              />
              <p className="hint" id="pub-intro-hint">
                크리에이터 페이지에 보여요. {INTRO_MAX}자까지 적을 수 있어요({charCount(intro.trim())}/{INTRO_MAX}).
              </p>
            </div>
            <div className={s["tags-field"]}>
              <TagPicker
                idBase="pub-tags"
                options={tagOptions}
                picked={tagIds}
                custom={customTag}
                onPickedChange={(next) => {
                  setTagIds(next);
                  setTagsBad(false);
                }}
                onCustomChange={(next) => {
                  setCustomTag(next);
                  setTagsBad(false);
                }}
                invalid={tagsBad ? { describedBy: "prof-msg" } : null}
              />
            </div>
            <dl className={s.kv}>
              <div>
                <dt>방송 채널</dt>
                <dd>{verification.state.channelTitle}</dd>
              </div>
              <div>
                <dt>본인 확인</dt>
                <dd>
                  {verification.state.verified ? (
                    <>
                      <span className={statusTagClass("success")}>확인 완료</span>
                    </>
                  ) : (
                    <span className="tag">확인 전</span>
                  )}
                </dd>
              </div>
            </dl>
            <Switch
              id="sw-find"
              title="크리에이터 찾기에 보이기"
              desc="끄면 크리에이터 찾기 목록에서만 빠져요. 내 페이지 링크·팔로우·선물 받기는 그대로예요. 본인 확인을 마쳐야 찾기에 보여요."
              checked={visible}
              onChange={setVisible}
            />
            <button className={`btn ${s.save}`} type="button" aria-disabled={profileSaving} onClick={() => void saveProfile()}>
              {profileSaving ? "저장하는 중…" : "프로필 저장"}
            </button>
            <p className={profileMsg && !profileMsg.ok ? s.error : `sub ${s["save-msg"]}`} role="status" id="prof-msg">
              {profileMsg && !profileMsg.ok ? (
                <span className={s["error-mark"]} aria-hidden="true">
                  !
                </span>
              ) : null}
              {profileMsg?.text}
            </p>
          </section>

          <section aria-labelledby="alarm-h">
            <div className={s["s-head"]}>
              <h3 id="alarm-h">알림 받기</h3>
            </div>
            {/* 승인 요청과 그 재알림은 꼭 가는 알림이라 끄는 스위치를 두지 않는다(notifications INV-N6, 결정 d33 ②).
                알림 스펙에 없는 종류(자동 반려 하루 전·주소가 열릴 때)의 스위치는 두지 않는다(my-account INV-A11) */}
            <div className={s["switch-row"]}>
              <div className={s.txt}>
                <strong>새 승인 요청</strong>
                <span className="sub">
                  팬이 선물을 보내면 알려드려요. 놓치면 {APPROVAL_DEADLINE_DAYS}일 뒤 자동으로 반려되기 때문에, 승인 요청은 알림을 꺼 두어도 가요.
                </span>
              </div>
            </div>
            <Switch
              id="sw-kakao"
              title="카카오톡 알림"
              desc="선물 보관·반송 같은 다른 소식을 카카오톡으로 알려드려요."
              checked={notify.kakao}
              busy={notifySaving}
              onChange={(v) => void toggleNotify("kakao", v)}
            />
            <Switch
              id="sw-email"
              title="이메일 알림"
              desc="같은 소식을 확인된 이메일로 알려드려요."
              checked={notify.email}
              busy={notifySaving}
              onChange={(v) => void toggleNotify("email", v)}
            />
            <p className={notifyMsg && !notifyMsg.ok ? s.error : `sub ${s["save-msg"]}`} role="status">
              {notifyMsg && !notifyMsg.ok ? (
                <span className={s["error-mark"]} aria-hidden="true">
                  !
                </span>
              ) : null}
              {notifyMsg?.text}
            </p>
          </section>

          {/* 번호 바꾸기(signup INV-U12)·비밀번호 바꾸기(session-login INV-L12)는 팬 내 정보와 같은 칸을 그대로 쓴다 —
              두 서버 처리 모두 로그인 토큰의 사람 것만 바꾸고 역할을 가리지 않는다 */}
          <section aria-labelledby="security-h">
            <div className={s["s-head"]}>
              <h3 id="security-h">계정 보안</h3>
            </div>
            <div className={s["switch-row"]}>
              <div className={s.txt}>
                <strong>휴대폰 번호</strong>
                <span className="sub">{settings.phoneMasked ?? "등록된 번호가 없어요"} · 바꾸려면 카카오 인증을 다시 받아요.</span>
              </div>
              <button
                className="btn btn--soft btn--sm"
                type="button"
                aria-expanded={security === "phone"}
                aria-controls="security-phone"
                onClick={() => toggleSecurity("phone")}
              >
                번호 바꾸기
              </button>
            </div>
            {security === "phone" && (
              <div className={s["sec-panel"]}>
                <PhoneChangePanel id="security-phone" onLoginExpired={toLogin} onChanged={() => router.refresh()} />
              </div>
            )}
            <div className={s["switch-row"]}>
              <div className={s.txt}>
                <strong>비밀번호</strong>
                <span className="sub">바꾸면 다른 기기의 로그인은 모두 끝나요.</span>
              </div>
              <button
                className="btn btn--soft btn--sm"
                type="button"
                aria-expanded={security === "password"}
                aria-controls="security-password"
                onClick={() => toggleSecurity("password")}
              >
                비밀번호 변경
              </button>
            </div>
            {security === "password" && (
              <div className={s["sec-panel"]}>
                <PasswordChangePanel id="security-password" onLoginExpired={toLogin} />
              </div>
            )}
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
              <button className="btn" type="button" aria-disabled={saving} onClick={() => void confirmUnblock(sheet.fan)}>
                {saving ? "저장하는 중…" : "차단 풀기"}
              </button>
            </div>
          </>
        ) : (
          <>
            <p>주소를 {addressRegistered ? "바꾸" : "등록하"}려면 카카오톡 인증서 서명이 필요해요. 로그인만으로는 바꿀 수 없어요.</p>
            <p className={`sub ${s["sheet-sub"]}`}>
              {addressRegistered
                ? "새 주소도 이 브라우저에서 잠가서 보내요. 아직 출력하지 않은 주문은 바뀐 주소로 나가요."
                : "주소는 이 브라우저에서 잠가서 보내요. 등록하면 아직 출력하지 않은 주문부터 이 주소로 나가요."}
            </p>
            {sealingKeyPem ? (
              <AddressChangeForm
                creatorId={address.creatorId}
                sealingKeyPem={sealingKeyPem}
                onSaved={() => {
                  // 서버에 저장된 뒤에만 「등록됨」으로 바꾼다
                  setAddressMsg(addressRegistered ? "주소를 바꿨어요." : "주소를 등록했어요.");
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
