// 폼 임시 저장 — 브라우저 저장소(localStorage)에 계정별로 둔다. 쓰는 곳: 운영자 폼(fankkuk session-login INV-L20).
// 키 = `fk-draft:<사람 ID>:<폼 이름>`. 다른 계정으로 읽으면 읽지 않고 그 브라우저의 다른 계정 임시 저장을 모두 지운다.
// 남겨 두는 시간(maxAgeMs)이 지나면 지운다 — 값은 부르는 쪽이 정한다. 비밀번호 칸은 저장하지 않는다. 제출 성공이면 그 폼만, 직접 로그아웃이면 모두 지운다.
// 저장소는 막혀 있거나 비어 있을 수 있다(사생활 보호 창 등) — 모든 접근을 try/catch 로 감싸고 실패하면 저장하지 않은 것으로 본다.

export type DraftStorage = Pick<Storage, "getItem" | "setItem" | "removeItem" | "key" | "length">;
export type DraftValues = Record<string, string>;

const PREFIX = "fk-draft:";
const keyOf = (userId: string, formKey: string) => `${PREFIX}${userId}:${formKey}`;

function draftKeys(st: DraftStorage): string[] {
  const out: string[] = [];
  for (let i = 0; i < st.length; i += 1) {
    const k = st.key(i);
    if (k?.startsWith(PREFIX)) out.push(k);
  }
  return out;
}

/**
 * baseline: 서버 값을 고치는 폼이면 그 폼을 열 때의 서버 값(문자열로 만든 것). 다시 열 때 서버 값이 다르면 복원하지 않는다(옛 값으로 덮지 않게).
 */
export function saveDraft(st: DraftStorage, userId: string, formKey: string, values: DraftValues, now: number, baseline?: string): void {
  try {
    if (Object.keys(values).length === 0) st.removeItem(keyOf(userId, formKey));
    else st.setItem(keyOf(userId, formKey), JSON.stringify({ savedAt: now, values, ...(baseline === undefined ? {} : { baseline }) }));
  } catch {
    // 저장소가 막혀 있다 — 임시 저장 없이 그대로 쓴다
  }
}

/** 같은 계정의 그 폼 임시 저장. 다른 계정의 것은 지우고, maxAgeMs 지난 것도 지운다. */
export function loadDraft(st: DraftStorage, userId: string, formKey: string, now: number, maxAgeMs: number, baseline?: string): DraftValues | null {
  try {
    for (const k of draftKeys(st)) if (!k.startsWith(`${PREFIX}${userId}:`)) st.removeItem(k);
    const raw = st.getItem(keyOf(userId, formKey));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { savedAt?: unknown; values?: unknown; baseline?: unknown };
    // 서버 값이 그사이 바뀌었으면(기준값이 다르면) 복원하지 않고 지운다
    const staleBase = baseline !== undefined && parsed.baseline !== baseline;
    if (staleBase || typeof parsed.savedAt !== "number" || now - parsed.savedAt >= maxAgeMs || typeof parsed.values !== "object" || parsed.values === null) {
      st.removeItem(keyOf(userId, formKey));
      return null;
    }
    const values: DraftValues = {};
    for (const [k, v] of Object.entries(parsed.values)) if (typeof v === "string") values[k] = v;
    return values;
  } catch {
    return null;
  }
}

/**
 * 사이트 어느 화면에서든 한 번 — 만료된 것(망가진 값 포함)을 지우고, 로그인한 사람(keepUserId)이 있으면 다른 계정의 것도 지운다.
 * 로그인 안 한 화면(keepUserId null)이면 만료된 것만 — 누구의 것인지 모르므로 남은 것은 그대로 둔다.
 */
export function purgeDrafts(st: DraftStorage, now: number, maxAgeMs: number, keepUserId: string | null): void {
  try {
    for (const k of draftKeys(st)) {
      if (keepUserId !== null && !k.startsWith(`${PREFIX}${keepUserId}:`)) {
        st.removeItem(k);
        continue;
      }
      let savedAt: unknown;
      try {
        savedAt = (JSON.parse(st.getItem(k) ?? "") as { savedAt?: unknown }).savedAt;
      } catch {
        savedAt = undefined;
      }
      if (typeof savedAt !== "number" || now - savedAt >= maxAgeMs) st.removeItem(k);
    }
  } catch {
    // 막힌 저장소 — 지울 것도 없다
  }
}

/** 제출 성공·[닫기]·[취소] — 그 폼만 지운다 */
export function clearDraft(st: DraftStorage, userId: string, formKey: string): void {
  try {
    st.removeItem(keyOf(userId, formKey));
  } catch {
    // 막힌 저장소 — 지울 것도 없다
  }
}

/** 직접 로그아웃 — 이 브라우저의 임시 저장을 모두 지운다(다른 앱 값은 건드리지 않는다) */
export function clearAllDrafts(st: DraftStorage): void {
  try {
    for (const k of draftKeys(st)) st.removeItem(k);
  } catch {
    // 막힌 저장소 — 지울 것도 없다
  }
}

/** 폼 칸 하나의 모양 — DOM 의 input·textarea·select 에서 읽는다 */
export type DraftField = { type: string; name: string; id: string; value: string; checked?: boolean };

const SKIPPED = new Set(["password", "hidden", "file", "submit", "button", "reset", "image"]);

/** 저장할 칸의 값. 비밀번호·숨김·파일·버튼은 뺀다. 이름(없으면 id)이 없는 칸은 되돌릴 자리를 몰라 뺀다. */
export function draftableValues(fields: readonly DraftField[]): DraftValues {
  const out: DraftValues = {};
  for (const f of fields) {
    if (SKIPPED.has(f.type)) continue;
    const base = f.name || f.id;
    if (!base) continue;
    // 라디오는 같은 이름이 여럿이라 값까지 붙인 열쇠로 고른 것 하나를 남긴다
    if (f.type === "radio") {
      if (f.checked) out[`${base}=${f.value}`] = "true";
      continue;
    }
    out[base] = f.type === "checkbox" ? String(f.checked === true) : f.value;
  }
  return out;
}
