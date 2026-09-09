"use client";

import Link from "next/link";
import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from "react";
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
import { quotedParts, quoteUserText } from "@/shared/lib/quote";
import { relativeTime } from "@/shared/lib/schedule";
import styles from "./notification-bell.module.css";
import header from "./site-header.module.css";

/**
 * 지운 뒤 초점이 갈 곳. **줄 id 와 「패널」을 한 문자열에 담지 않는다** — 담으면 둘을
 * 가르는 값이 id 로 못 쓰이는 문자여야 하고, 그 문자는 diff 에도 grep 에도 안 보인다
 * (실제로 NUL 바이트였고, 그래서 git 이 이 파일을 바이너리로 읽었다 — 2026-09-09).
 */
type 초점자리 = { kind: "row"; id: string } | { kind: "panel" };
const 패널로: 초점자리 = { kind: "panel" };

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

  // 줄마다의 삭제 단추. 지운 뒤 초점을 「다음 줄」로 옮기려면 부모가 줄 순서를 알아야 한다.
  const 삭제단추 = useRef(new Map<string, HTMLButtonElement>());
  const [초점갈곳, set초점갈곳] = useState<초점자리 | null>(null);
  // 지운 사실을 낭독기에 알리는 자리. 눈으로는 줄이 사라지는 것이 이미 피드백이라
  // 보이는 문구는 띄우지 않는다. 급하지 않은 알림이라 `alert` 가 아니라 `status` 다
  // (「폼의 성공 문구」가 실패에만 `alert` 를 준 것과 같은 결).
  const [지운말, set지운말] = useState("");

  // **마지막으로 화면에 그려진 목록.** `remove` 가 `await` 뒤에 「다음 줄」을 정할 때
  // 클로저에 갇힌 옛 목록 대신 이것을 본다.
  const 커밋된목록 = useRef<readonly MyNotification[] | null>(null);
  useEffect(() => {
    커밋된목록.current = items;
  });

  const registerDel = useCallback((id: string, el: HTMLButtonElement | null) => {
    if (el === null) 삭제단추.current.delete(id);
    else 삭제단추.current.set(id, el);
  }, []);

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
      // **상태 `초점갈곳` 과 이름이 겹치지 않게 한다.** 겹치면 이 핸들러 안에서 상태를
      // 못 읽는데 그 사실이 안 보인다 (2026-09-09 ui-reviewer).
      const 탭순서 = panel.current.querySelectorAll<HTMLElement>(
        'a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])',
      );
      // **갈 곳이 없어도 빠져나가지 않는다.** 여기서 그냥 돌아가면 Tab 이 뒤 페이지로
      // 새는데, 낭독기에는 `aria-modal="true"` 로 「이 안이 전부」라고 말해 둔 상태다.
      // 0개가 되는 경로가 실제로 넷 있다: 빈 목록 · 마지막 줄을 지운 직후 · 오류 문구만
      // 있고 안 읽은 것이 없을 때 · 액션이 도는 동안 단추가 전부 비활성일 때
      // (2026-09-08 ui-reviewer).
      if (탭순서.length === 0) {
        e.preventDefault();
        panel.current.focus(); // tabIndex={-1} 이라 받을 수 있다
        return;
      }
      const 처음 = 탭순서[0];
      const 마지막 = 탭순서[탭순서.length - 1];
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
    // **지난번에 지운 말을 지우고 연다.** 안 비우면 다시 열었을 때 라이브 영역이 옛
    // 「남은 알림 N개」를 담은 채로 뜬다 — 그 수는 지금 목록과 아무 상관이 없다
    // (2026-09-09 security-reviewer).
    set지운말("");
    void loadNotificationsAction()
      .then((r) => {
        if (!살아있음) return;
        setLoading(false);
        if (r.ok) setItems(r.value);
        else setError(r.message);
      })
      // **약속이 깨지는 경로가 따로 있다.** 없으면 `setLoading(false)` 가 영영 안 돌아
      // 「불러오는 중입니다…」에서 멈추고, 닫았다 열어도 같은 자리다 (2026-09-09 code-reviewer).
      .catch(() => {
        if (!살아있음) return;
        setLoading(false);
        setError("연결에 문제가 있어 알림을 불러오지 못했습니다.");
      });
    panel.current?.focus();
    return () => {
      살아있음 = false;
    };
  }, [open]);

  // **지운 뒤 초점을 옮긴다** (design-rules.md 2026-09-08 (2)). 목록이 다시 그려진 다음에
  // 옮겨야 해서 여기 있다 — `remove` 안에서 바로 부르면 그 단추가 아직 화면에 있다.
  // 안 옮기면 초점이 문서 맨 앞으로 떨어지는데, 패널이 `aria-modal` 로 Tab 을 가두고 있어서
  // 다음 Tab 이 방금 지운 자리가 아니라 목록 맨 위로 되돌아온다.
  // **`useLayoutEffect` 다.** 보통 effect 는 화면을 그린 뒤에 도는데, 그 사이 동안
  // 초점은 사라진 단추 자리, 즉 문서 맨 앞에 있다. 그 틈에 Tab 이 들어오면 아래 가둠이
  // 「지금 초점이 처음도 마지막도 패널도 아니다」로 판단해 그냥 통과시킨다 (2026-09-09 code-reviewer).
  useLayoutEffect(() => {
    if (초점갈곳 === null) return;
    set초점갈곳(null);
    // **못 찾으면 패널이 받는다.** 지울 대상을 정한 뒤 목록이 갈리면(닫았다 열기 등)
    // 그 줄이 없을 수 있다. 여기서 조용히 넘어가면 초점이 문서 맨 앞에 남는데,
    // 그 상태가 정확히 이 기능이 없애려던 것이다.
    const 갈곳 =
      초점갈곳.kind === "panel"
        ? panel.current
        : (삭제단추.current.get(초점갈곳.id) ?? panel.current);
    갈곳?.focus(); // 패널은 tabIndex={-1} 이라 받을 수 있다
  }, [초점갈곳]);

  /**
   * 액션 하나를 실행하고, 성공하면 화면의 목록을 같은 방향으로 고친다.
   *
   * **`busy` 는 단추만 막는다 — 줄 링크는 안 막는다.** 링크는 누르면 화면이 바뀌면서 이
   * 컴포넌트가 사라지므로 막을 것이 없고, 막으면 「알림을 눌렀는데 아무 데도 안 간다」가
   * 된다. 목록을 고치는 것은 전부 함수형 갱신이라 액션이 겹쳐도 결과가 어긋나지 않는다.
   *
   * **성공했는지를 돌려준다.** 삭제 뒤 초점을 옮기는 쪽이 이 값을 봐야 한다.
   *
   * **약속이 깨지는 것과 `ok: false` 는 다르다.** 서버 액션은 오프라인·5xx·배포 불일치에서
   * 결과를 안 주고 그냥 실패한다. 그때 `busy` 를 안 풀면 패널의 단추가 **전부 영구
   * 비활성**이 되고 오류 문구도 안 뜬다 — 새로고침 전까지 죽은 화면이 된다
   * (2026-09-09 code-reviewer).
   */
  async function run(
    action: () => Promise<{ ok: true } | { ok: false; message: string }>,
    apply: (list: readonly MyNotification[]) => readonly MyNotification[],
  ): Promise<boolean> {
    setBusy(true);
    setError(null);
    try {
      const r = await action();
      if (!r.ok) {
        setError(r.message);
        return false;
      }
      setItems((list) => (list === null ? list : apply(list)));
      return true;
    } catch {
      // 서버가 준 문장이 없다 — 무엇이 실패했는지는 부르는 쪽이 아니라 여기가 안다
      setError("연결에 문제가 있어 처리하지 못했습니다. 잠시 뒤 다시 시도해 주세요.");
      return false;
    } finally {
      setBusy(false);
    }
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

  async function markAll() {
    const at = 지금();
    const 성공 = await run(
      () => markAllNotificationsReadAction(),
      (list) => markAllReadIn(list, at),
    );
    // **성공하면 이 단추가 스스로 영구 비활성이 된다**(안 읽은 것이 0이 되므로). 브라우저는
    // 비활성이 된 요소의 초점을 뺏으므로, 안 옮기면 초점이 문서 맨 앞에 남고 다음 Tab 이
    // 패널을 빠져나간다 — `aria-modal` 로 「이 안이 전부」라고 말해 둔 상태에서다.
    // 실패했으면 단추가 다시 켜지지만 초점은 이미 뺏겼으므로 어느 쪽이든 옮긴다.
    // (2026-09-09 code-reviewer. 이번 사이클이 만든 결함은 아니고 같은 결함이다)
    set초점갈곳(패널로);
    return 성공;
  }

  async function remove(id: string) {
    const form = new FormData();
    form.append(NOTIFICATION_ID_FIELD, id);

    const 성공 = await run(
      () => deleteNotificationAction(form),
      (list) => removeFrom(list, id),
    );

    // **실패해도 초점을 되돌려야 한다.** 줄은 그대로 남지만 초점은 이미 없다 — 누른
    // 단추가 `busy` 동안 비활성이 되면서 브라우저가 초점을 뺏어 문서 맨 앞으로 보냈다.
    // (jsdom 은 이 동작을 구현하지 않아서 검사만으로는 안 드러난다. 2026-09-09 code-reviewer)
    if (!성공) {
      set초점갈곳({ kind: "row", id });
      return;
    }

    // **다음 줄은 `await` 뒤에, 지금 커밋된 목록에서 정한다.** 부르기 전에 찍어 두면
    // 그 사이에 목록이 갈렸을 때 없는 줄을 가리킨다 — `busy` 는 액션별이 아니라 하나라
    // 줄 링크의 읽음 처리가 먼저 끝나면 단추가 다시 켜지고, 종 단추는 아예 안 막힌다.
    // 이 줄이 아직 목록에 있는 이유는 `setItems` 가 다시 그려지기 전이기 때문이다.
    const 목록 = 커밋된목록.current ?? [];
    const i = 목록.findIndex((n) => n.id === id);
    const 다음 = i < 0 ? null : (목록[i + 1] ?? 목록[i - 1] ?? null);
    set초점갈곳(다음 ? { kind: "row", id: 다음.id } : 패널로);
    // **남은 수를 같이 말한다.** 문구가 매번 같으면 라이브 영역의 내용이 안 바뀌어서
    // 둘째 삭제부터는 낭독기가 아무 말도 안 한다.
    set지운말(`알림을 지웠습니다. 남은 알림 ${Math.max(0, 목록.length - 1)}개`);
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

          {/* **패널이 열리는 순간부터 자리를 지킨다.** 지운 뒤에 이 요소를 만들어 넣으면
              낭독기가 새로 생긴 라이브 영역을 안 읽는 경우가 있다 */}
          <p className="sr-only" role="status">
            {지운말}
          </p>

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
                <Row
                  key={n.id}
                  item={n}
                  busy={busy}
                  onOpen={markRead}
                  onRemove={remove}
                  registerDel={registerDel}
                />
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
  registerDel,
}: {
  item: MyNotification;
  busy: boolean;
  onOpen: (id: string) => void;
  onRemove: (id: string) => void;
  registerDel: (id: string, el: HTMLButtonElement | null) => void;
}) {
  // **문장은 저장된 값으로만 짓는다**(INV-N6). 지금의 스터디를 읽어 오지 않는다.
  const { subject, tail } = notificationSentence(item.type, item.title);
  // 두르기는 화면이 한다. **보이는 문장과 낭독기용 이름이 같은 함수를 지나야** 두르기에
  // 판단이 붙는 날 한쪽만 고쳐지지 않는다 (2026-09-09 리뷰어 셋이 같은 자리를 지적했다).
  const { open, body, close } = quotedParts(subject);
  const unread = isUnread(item);

  const 문장 = (
    <>
      {/* **「안 읽음」은 링크 안에 있어야 한다.** 밖에 두면 낭독기로 링크만 훑을 때
          (가장 흔한 이동 방식) 이 글자가 안 읽히고, 안 읽음을 말하는 세 다리 중 하나가
          상황에 따라 사라진다 — 코랄 띠를 2.13:1 인 채로 둔 근거가 그 셋이다 */}
      {unread ? <span className="sr-only">안 읽음. </span> : null}
      {/* **낫표는 제품이 그리는 글자라 굵게 안에 넣지 않는다.** 이 배치가 지키는 것은
          「누를 수 없는 줄」의 취소선 범위다 — 취소선은 이름에만 걸리고 낫표에는 안 걸린다.
          읽은 줄에서는 색까지 갈린다(약한 잉크 대 잉크). 안 읽은 줄에서는 둘 다 잉크에
          600 대 700 이라 **눈으로는 사실상 안 갈리고**, 거기서 흉내를 막는 것은 배치가
          아니라 `quotedParts` 가 안쪽 낫표를 겹낫표로 바꾸는 쪽이다 */}
      <p className={styles.text}>
        {open}
        <b className={styles.name}>{body}</b>
        {close}
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
          ref={(el) => registerDel(item.id, el)}
          className={styles.del}
          disabled={busy}
          aria-label={`알림 삭제: ${quoteUserText(subject)}${tail}`}
          onClick={() => onRemove(item.id)}
        >
          <CloseIcon />
        </button>
      </div>
    </li>
  );
}

function CloseIcon() {
  // 시안은 17px 상자라 실 두께가 1.7px 인데, 짝수 규칙에 맞춰 16px 로 내리면서 1.6px 이
  // 됐다(24 좌표계의 2.4 가 16px 상자에서 그렇게 그려진다). 16 좌표계에 2 를 쓰면 굵어진다
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
