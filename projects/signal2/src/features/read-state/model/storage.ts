/* 읽은 소식의 id 를 브라우저에만 둔다.
 *
 * 로그인이 없으므로 서버에 저장할 곳이 없다. 대가는 기기 간 동기화가 안 되는 것이고,
 * 그 대가를 받아들이는 대신 스키마 변경이 필요 없다(PRODUCT.md "읽음 표시").
 */

export const READ_IDS_KEY = "signal:read-ids";

/**
 * 남겨 두는 id 의 최대 개수.
 *
 * 없으면 목록이 영원히 자란다. 그 자체는 몇 년이 걸리지만, 한도를 넘긴 **뒤**가 문제다 —
 * `setItem` 이 던지면 아래 catch 가 조용히 삼켜서 그 뒤로 읽음이 하나도 저장되지 않는데
 * 화면은 정상으로 보인다. 새로고침해야 알 수 있다. 넘치기 전에 오래된 것부터 버린다.
 */
export const MAX_READ_IDS = 5_000;

/**
 * `localStorage` 를 꺼낸다. 못 꺼내면 `null`.
 *
 * **속성 접근 자체가 던지는 브라우저가 있다** — 저장소가 차단된 iframe, 쿠키 전면 차단.
 * `getItem`/`setItem` 만 감싸면 그 경로에서 effect 안의 예외가 클라이언트 트리를 죽인다.
 * 서버에는 `window` 가 없는 것도 여기서 같이 걸러진다.
 */
export function getStore(): Storage | null {
  try {
    if (typeof window === "undefined") return null;
    return window.localStorage;
  } catch {
    return null;
  }
}

/** 저장소가 없거나(서버) 값이 깨졌으면 빈 집합. 읽기가 화면을 죽이지 않게 한다. */
export function loadReadIds(store: Storage | null): Set<string> {
  if (store === null) return new Set();

  let raw: string | null;
  try {
    raw = store.getItem(READ_IDS_KEY);
  } catch {
    return new Set();
  }
  if (!raw) return new Set();

  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return new Set();
    return new Set(parsed.filter((v): v is string => typeof v === "string"));
  } catch {
    return new Set();
  }
}

/**
 * id 를 읽음으로 남기고, 저장 뒤의 전체 집합을 돌려준다.
 *
 * **쓰기 직전에 저장소를 다시 읽는다.** 화면이 들고 있던 집합에 더해서 쓰면, 다른 탭이
 * 그사이 읽은 것이 통째로 사라진다 — 예전에 실제로 그렇게 덮어썼다. 마지막에 쓴 탭의
 * 기록만 남는 것이 아니라 두 탭의 기록이 합쳐져야 맞다.
 */
export function markRead(store: Storage | null, id: string): Set<string> {
  const merged = loadReadIds(store);

  // 이미 있던 id 도 지웠다 다시 넣어 **맨 뒤로 보낸다.** 그래야 저장 순서가 "마지막에 읽은 순"이
  // 되고, 넘칠 때 앞에서부터(=오래전에 읽은 것부터) 버리는 것이 맞는 판단이 된다.
  merged.delete(id);
  merged.add(id);

  const kept = [...merged].slice(-MAX_READ_IDS);
  if (store === null) return new Set(kept);

  try {
    store.setItem(READ_IDS_KEY, JSON.stringify(kept));
  } catch {
    // 저장이 막혀도(프라이빗 모드 등) 화면은 계속 돌아야 한다.
    // 이번 세션 안에서는 읽음으로 보이고, 새로고침하면 사라진다.
  }
  // 저장한 것과 화면이 든 것이 달라지지 않게, 버린 뒤의 집합을 돌려준다.
  return new Set(kept);
}
