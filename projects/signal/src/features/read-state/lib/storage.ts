/**
 * 읽음 표시 보관소.
 *
 * 로그인이 없는 개인용 사이트라 읽음 상태는 브라우저에만 둔다(PRODUCT.md 결정 2026-08-02).
 * 서버·스키마에는 아무 영향이 없고, 대가는 기기 간 동기화가 안 된다는 것.
 *
 * 저장소는 언제든 못 쓸 수 있다(시크릿 모드·용량 초과·차단). 그때는 조용히 비어 있는 것으로
 * 취급한다 — 읽음 표시가 없는 것은 불편이지 고장이 아니다.
 */

const STORAGE_KEY = "signal:read-articles";

/**
 * 무한정 쌓이지 않게 이만큼만 남긴다.
 * 넘치면 **가장 먼저 읽은 것부터** 버린다(목록 순서 = 처음 읽은 순).
 */
const MAX_ENTRIES = 500;

export function loadReadIds(): string[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (raw === null) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((v): v is string => typeof v === "string");
  } catch {
    return [];
  }
}

function write(ids: readonly string[]): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify(ids.slice(-MAX_ENTRIES)),
    );
  } catch {
    // 저장 실패는 무시한다 — 이번 세션 동안의 읽음 표시는 화면에 그대로 남는다.
  }
}

/**
 * 읽음 목록에 id 들을 더한다. **저장 직전에 다시 읽어 합집합을 만든다.**
 *
 * 통째로 덮어쓰면 동시에 열린 탭끼리 서로를 지운다: 저장소가 비어 있을 때
 * 상세를 새 탭 둘로 열면 A 는 []+X 를, B 는 (A 의 저장을 못 본 채) []+Y 를 써서
 * 먼저 쓴 쪽이 사라진다. 휠 클릭이나 세션 복원에서 흔한 상황이다.
 * 읽기-수정-쓰기를 한 함수 안에 두면 그 창이 최소가 된다.
 */
export function addReadIds(ids: readonly string[]): void {
  // 반환값을 두지 않는다. write 는 조용히 실패할 수 있으므로(용량 초과·차단),
  // "저장된 결과"인 척하는 값을 돌려주면 화면과 저장소가 갈릴 수 있다.
  // 잘라내기는 write 한 곳에만 둔다.
  write([...new Set([...loadReadIds(), ...ids])]);
}
