"use client";

import Link from "next/link";
import { useCallback, useEffect, useId, useRef, useState } from "react";
// **슬라이스 대문(index.ts)이 아니라 model 파일을 직접 집는다.** 대문은 서버 전용
// 판독기(`next/headers` 를 지난다)를 같이 내보내므로, 여기서 대문을 집으면 브라우저
// 번들이 서버 코드를 끌고 들어가 빌드가 죽는다(bundle 게이트가 그 자리를 잡는다).
import {
  countUnread,
  isUnread,
  markAllReadIn,
  markReadIn,
  notificationSentence,
  removeFrom,
  type MyNotification,
} from "@/entities/notification/model/notification";
import {
  NOTIFICATION_ID_FIELD,
  deleteNotificationAction,
  loadNotificationsAction,
  markAllNotificationsReadAction,
  markNotificationReadAction,
} from "@/features/manage-notifications";
import { BellIcon } from "@/shared/ui/icon/Icon";
import { relativeTime } from "@/shared/lib/schedule";
import styles from "./notification-bell.module.css";
import header from "./site-header.module.css";

/**
 * 종 아이콘과 거기 달린 알림 패널. 승인된 시각 기준의 「떠 있는 면」 그대로다
 * (design-rules.md 2026-09-08).
 *
 * **종 옆 숫자를 이 컴포넌트가 그린다**(INV-N8). 목록을 불러온 뒤에는 **그 목록에서 센
 * 값**이 숫자가 된다 — 서버가 준 수와 화면이 그리는 줄이 따로 놀 수가 없다. 목록을 열기
 * 전에는 서버가 세어 준 값을 그대로 쓴다.
 *
 * **목록은 열 때 가져온다.** 화면마다 미리 읽으면 패널을 안 여는 사람(대부분)이 매 요청
 * 질의 하나를 더 낸다.
 */
export function NotificationBell({ unreadCount }: { unreadCount: number }) {
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<readonly MyNotification[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const panelId = useId();
  const titleId = useId();
  const bell = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLDivElement>(null);

  // 목록을 불러왔으면 그 목록이 숫자의 근거다. 아직이면 서버가 센 값을 쓴다.
  // **세는 방법은 엔티티가 갖는다** — 화면이 조건을 다시 쓰면 띠와 숫자가 갈라질 수 있다.
  // (같은 뜻을 `read-unread-count.ts` 가 SQL 로 한 벌 더 적는다 — INV-N8 이 요구하는 두 벌이다.)
  //
  // **닫아도 이 목록이 근거로 남는다.** 한 번 열었다 닫으면 그 페이지에 머무는 동안 서버가
  // 새로 세어 보낸 값이 안 쓰인다. 실시간 밀어내기는 스펙 밖이라 계약 위반은 아니지만,
  // 여기 안 적으면 다음 사람이 「왜 안 바뀌지」로 헤맨다 (2026-09-08 code-reviewer).
  const unread = items === null ? unreadCount : countUnread(items);

  const close = useCallback(() => {
    setOpen(false);
    bell.current?.focus();
  }, []);

  // **바깥 누르기·ESC 로 닫는다.** 열려 있을 때만 듣는다 — 항상 붙여 두면 화면의 모든
  // 클릭이 이 핸들러를 지난다.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        close();
        return;
      }
      // **초점을 패널 안에 가둔다.** `aria-modal="true"` 라고 적어 놓고 안 가두면
      // 낭독기에는 "이 안이 전부"라고 말해 놓고 Tab 은 뒤 화면으로 새는 상태가 된다.
      if (e.key !== "Tab" || panel.current === null) return;
      const 초점갈곳 = panel.current.querySelectorAll<HTMLElement>(
        'a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])',
      );
      // **갈 곳이 없어도 빠져나가지 않는다.** 여기서 그냥 돌아가면 Tab 이 뒤 페이지로
      // 새는데, 낭독기에는 `aria-modal="true"` 로 「이 안이 전부」라고 말해 둔 상태다.
      // 0개가 되는 경로가 실제로 넷 있다: 빈 목록 · 마지막 줄을 지운 직후 · 오류 문구만
      // 있고 안 읽은 것이 없을 때 · 액션이 도는 동안 단추가 전부 비활성일 때
      // (2026-09-08 ui-reviewer).
      if (초점갈곳.length === 0) {
        e.preventDefault();
        panel.current.focus(); // tabIndex={-1} 이라 받을 수 있다
        return;
      }
      const 처음 = 초점갈곳[0];
      const 마지막 = 초점갈곳[초점갈곳.length - 1];
      const 지금 = document.activeElement;
      if (e.shiftKey && (지금 === 처음 || 지금 === panel.current)) {
        e.preventDefault();
        마지막.focus();
      } else if (!e.shiftKey && 지금 === 마지막) {
        e.preventDefault();
        처음.focus();
      }
    };
    const onDown = (e: MouseEvent) => {
      const t = e.target as Node;
      if (panel.current?.contains(t) || bell.current?.contains(t)) return;
      setOpen(false); // 바깥을 눌렀을 때는 초점을 뺏지 않는다 — 누른 자리로 가야 한다
    };
    document.addEventListener("keydown", onKey);
    document.addEventListener("mousedown", onDown);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("mousedown", onDown);
    };
  }, [open, close]);

  // 열면 목록을 가져오고 패널로 초점을 옮긴다. **닫았다 열 때마다 다시 가져온다** —
  // 그 사이에 새 알림이 왔을 수 있고, 옛 목록을 그대로 보여 주면 종 옆 숫자와 어긋난다.
  useEffect(() => {
    if (!open) return;
    let 살아있음 = true;
    setLoading(true);
    setError(null);
    void loadNotificationsAction().then((r) => {
      if (!살아있음) return;
      setLoading(false);
      if (r.ok) setItems(r.value);
      else setError(r.message);
    });
    panel.current?.focus();
    return () => {
      살아있음 = false;
    };
  }, [open]);

  /**
   * 액션 하나를 실행하고, 성공하면 화면의 목록을 같은 방향으로 고친다.
   *
   * **`busy` 는 단추만 막는다 — 줄 링크는 안 막는다.** 링크는 누르면 화면이 바뀌면서 이
   * 컴포넌트가 사라지므로 막을 것이 없고, 막으면 「알림을 눌렀는데 아무 데도 안 간다」가
   * 된다. 목록을 고치는 것은 전부 함수형 갱신이라 액션이 겹쳐도 결과가 어긋나지 않는다.
   */
  async function run(
    action: () => Promise<{ ok: true } | { ok: false; message: string }>,
    apply: (list: readonly MyNotification[]) => readonly MyNotification[],
  ) {
    setBusy(true);
    setError(null);
    const r = await action();
    setBusy(false);
    if (!r.ok) {
      setError(r.message);
      return;
    }
    setItems((list) => (list === null ? list : apply(list)));
  }

  // 화면이 들고 있는 목록을 옮기는 방법은 전부 엔티티에 있다. 여기서는 언제 부를지만 정한다.
  const 지금 = () => new Date().toISOString();

  function markRead(id: string) {
    const form = new FormData();
    form.append(NOTIFICATION_ID_FIELD, id);
    const at = 지금();
    return run(
      () => markNotificationReadAction(form),
      (list) => markReadIn(list, id, at),
    );
  }

  function markAll() {
    const at = 지금();
    return run(
      () => markAllNotificationsReadAction(),
      (list) => markAllReadIn(list, at),
    );
  }

  function remove(id: string) {
    const form = new FormData();
    form.append(NOTIFICATION_ID_FIELD, id);
    return run(
      () => deleteNotificationAction(form),
      (list) => removeFrom(list, id),
    );
  }

  return (
    <div className={styles.anchor}>
      <button
        ref={bell}
        type="button"
        className={header.iconBtn}
        aria-expanded={open}
        // 닫혀 있을 때는 패널이 그려지지 않으므로 가리킬 id 가 없다 — 없는 id 를 가리키는
        // `aria-controls` 는 낭독기에 죽은 참조로 간다
        aria-controls={open ? panelId : undefined}
        aria-haspopup="dialog"
        aria-label={unread > 0 ? `알림, 안 읽음 ${unread}개` : "알림, 안 읽은 알림 없음"}
        onClick={() => (open ? close() : setOpen(true))}
      >
        <BellIcon />
        {unread > 0 ? (
          <span className={`${header.dot} num`} aria-hidden="true">
            {unread > 99 ? "99+" : unread}
          </span>
        ) : null}
      </button>

      {open ? (
        <div
          ref={panel}
          id={panelId}
          className={styles.panel}
          role="dialog"
          aria-modal="true"
          aria-labelledby={titleId}
          tabIndex={-1}
        >
          <div className={styles.head}>
            <h2 className={styles.title} id={titleId}>
              알림
            </h2>
            <button
              type="button"
              className={styles.readAll}
              disabled={unread === 0 || busy}
              onClick={() => void markAll()}
            >
              전체 읽음
            </button>
          </div>

          {error ? (
            <p className={styles.state} role="alert">
              {error}
            </p>
          ) : null}

          {loading && items === null ? (
            <p className={styles.state}>불러오는 중입니다…</p>
          ) : items !== null && items.length === 0 ? (
            <div className={styles.empty}>
              <div className={styles.emptyIcon} aria-hidden="true">
                <BellIcon size={24} />
              </div>
              <h3>아직 알림이 없습니다</h3>
              <p>참가 신청이 오거나 신청 결과가 정해지면 여기에 쌓입니다.</p>
            </div>
          ) : (
            <ul className={styles.list}>
              {(items ?? []).map((n) => (
                <Row key={n.id} item={n} busy={busy} onOpen={markRead} onRemove={remove} />
              ))}
            </ul>
          )}
        </div>
      ) : null}
    </div>
  );
}

function Row({
  item,
  busy,
  onOpen,
  onRemove,
}: {
  item: MyNotification;
  busy: boolean;
  onOpen: (id: string) => void;
  onRemove: (id: string) => void;
}) {
  // **문장은 저장된 값으로만 짓는다**(INV-N6). 지금의 스터디를 읽어 오지 않는다.
  const { subject, tail } = notificationSentence(item.type, item.title);
  const unread = isUnread(item);

  const 문장 = (
    <>
      {/* **「안 읽음」은 링크 안에 있어야 한다.** 밖에 두면 낭독기로 링크만 훑을 때
          (가장 흔한 이동 방식) 이 글자가 안 읽히고, 안 읽음을 말하는 세 다리 중 하나가
          상황에 따라 사라진다 — 코랄 띠를 2.13:1 인 채로 둔 근거가 그 셋이다 */}
      {unread ? <span className="sr-only">안 읽음. </span> : null}
      <p className={styles.text}>
        <b className={styles.name}>{subject}</b>
        {tail}
      </p>
      {/* 수치는 고정폭 숫자 — 목록에서 세로로 쌓이는 「3분 전」의 자릿수가 흔들리지 않게 */}
      <p className={`${styles.time} num`}>
        {relativeTime(item.createdAt)}
        {item.gone ? (
          <>
            <span className={styles.sep} aria-hidden="true">
              ·
            </span>
            지워진 스터디예요. 열 수 없습니다
          </>
        ) : null}
      </p>
    </>
  );

  return (
    <li>
      <div className={`${styles.row} ${unread ? styles.isUnread : ""}`}>
        {item.href === null ? (
          // 가리키는 스터디가 지금 안 보인다(INV-N7). **주소를 아예 안 그린다** —
          // 링크로 두면 누르지 않아도 미리 가져오기가 404 를 만든다.
          <div className={styles.dead}>{문장}</div>
        ) : (
          <Link className={styles.link} href={item.href} onClick={() => onOpen(item.id)}>
            {문장}
          </Link>
        )}
        {/* **이름에 그 줄의 문장을 담는다.** 전부 「이 알림 지우기」면 낭독기의 단추
            목록에 같은 이름이 N개 뜨고 어느 것이 무엇인지 가릴 방법이 없다 */}
        <button
          type="button"
          className={styles.del}
          disabled={busy}
          aria-label={`알림 삭제: ${subject}${tail}`}
          onClick={() => onRemove(item.id)}
        >
          <CloseIcon />
        </button>
      </div>
    </li>
  );
}

function CloseIcon() {
  // 시안의 실 두께(1.6px)를 짝수 크기 안에서 낸다 — 16px 상자에 24 좌표계라 2.4 가
  // 화면에서 1.6px 로 그려진다. 16 좌표계에 2 를 쓰면 시안보다 굵어진다
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M6 6l12 12M18 6l-12 12"
        stroke="currentColor"
        strokeWidth="2.4"
        strokeLinecap="round"
      />
    </svg>
  );
}
