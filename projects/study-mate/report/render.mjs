// render.mjs — 화면이 그릴 값을 만드는 순수 함수들. DOM 도 fetch 도 여기 없다.
//
// 왜 떼어냈나:
//   "지금 노드가 강조되는가", "요청 밖 작업이 잡히는가" 같은 것을 눈으로만 확인하면
//   다음 사람이 못 믿는다. 순수 함수로 두면 node 에서 그대로 불러 검사할 수 있다.
//   빌드 도구는 없다 — 브라우저가 <script type="module"> 로 이 파일을 그냥 읽는다.
//
// 외부 라이브러리를 쓰지 않는다. 지도는 workflow.json 을 읽어 SVG 를 직접 그린다.

export const ESC = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

// ── 시간 표기 ───────────────────────────────────────────────────────────
export function fmtDuration(ms) {
  if (!Number.isFinite(ms) || ms < 0) return "—";
  const s = Math.round(ms / 1000);
  if (s < 60) return `${s}초`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}분`;
  const h = Math.floor(m / 60);
  return `${h}시간 ${m % 60}분`;
}

export function fmtTime(iso) {
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return "??:??:??";
  const d = new Date(t);
  const p = (n) => String(n).padStart(2, "0");
  return `${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}

// ── 지도 배치 ───────────────────────────────────────────────────────────
//
// Mermaid 를 걷어냈으므로 배치를 직접 계산한다. 이 그래프는 층이 얕고 엣지가 전부
// 이웃한 층 사이라, 층(rank)별로 세로로 쌓고 왼→오른쪽으로 잇는 것으로 충분하다.
// 엣지가 노드를 가로지르지 않는 이유가 이것이다 — 층을 건너뛰는 엣지가 없다.
//
// rank = 상류에서 여기까지의 **가장 긴** 경로 길이. 짧은 경로로 재면 늦게 합류하는
// 노드가 자기 상류와 같은 층에 놓여 선이 뒤로 간다.
//
// 치수는 "창 폭 1024px 에서 가로 스크롤이 없다"를 만족하도록 잡았다 —
// 층 여섯이면 18*2 + 6*116 + 5*46 = 962px 다. 여기를 키우면 그 기준이 깨진다.

const NODE_W = 116;
const NODE_H = 54;
const GAP_X = 46;
const GAP_Y = 24;
const PAD = 18;
const CHILD_H = 38;
const CHILD_GAP = 8;
const BOX_PAD = 28;

export function rankOf(workflow) {
  const all = workflow?.nodes ?? [];
  const tops = all.filter((n) => n.kind !== "child");
  const isTop = new Set(tops.map((n) => n.id));
  const edges = (workflow?.edges ?? []).filter((e) => isTop.has(e.from) && isTop.has(e.to));
  const rank = new Map(tops.map((n) => [n.id, 0]));
  // 층이 얕으므로 노드 수만큼 돌면 반드시 안정된다(순환은 그래프가 이미 거부한다).
  for (let i = 0; i < tops.length; i++) {
    for (const e of edges) rank.set(e.to, Math.max(rank.get(e.to), rank.get(e.from) + 1));
  }
  return rank;
}

/**
 * 지도의 기하 정보. 이 값만으로 SVG 를 그릴 수 있어야 한다 — 화면 코드가 좌표를 다시
 * 계산하기 시작하면 검사가 보는 것과 눈에 보이는 것이 갈라진다.
 */
export function layout(workflow) {
  const all = workflow?.nodes ?? [];
  const tops = all.filter((n) => n.kind !== "child");
  const childrenOf = (id) => all.filter((n) => n.kind === "child" && n.parent === id);
  const rank = rankOf(workflow);

  const byRank = new Map();
  for (const n of tops) {
    const r = rank.get(n.id) ?? 0;
    if (!byRank.has(r)) byRank.set(r, []);
    byRank.get(r).push(n);
  }

  const heightOf = (n) => {
    const kids = childrenOf(n.id);
    return kids.length === 0 ? NODE_H : BOX_PAD + kids.length * CHILD_H + (kids.length - 1) * CHILD_GAP + 12;
  };

  const colH = new Map();
  for (const [r, list] of byRank) {
    colH.set(r, list.reduce((sum, n) => sum + heightOf(n), 0) + GAP_Y * (list.length - 1));
  }
  const maxH = Math.max(...colH.values(), NODE_H);

  const placed = [];
  const pos = new Map();
  for (const [r, list] of [...byRank.entries()].sort((a, b) => a[0] - b[0])) {
    let y = PAD + (maxH - colH.get(r)) / 2;
    const x = PAD + r * (NODE_W + GAP_X);
    for (const n of list) {
      const h = heightOf(n);
      const box = {
        ...n, x, y, w: NODE_W, h,
        children: childrenOf(n.id).map((c, i) => ({
          ...c, x: x + 8, y: y + BOX_PAD + i * (CHILD_H + CHILD_GAP), w: NODE_W - 16, h: CHILD_H,
        })),
      };
      placed.push(box);
      pos.set(n.id, box);
      y += h + GAP_Y;
    }
  }

  const edges = (workflow?.edges ?? [])
    .filter((e) => pos.has(e.from) && pos.has(e.to))
    .map((e) => {
      const a = pos.get(e.from);
      const b = pos.get(e.to);
      const x1 = a.x + a.w, y1 = a.y + a.h / 2;
      const x2 = b.x, y2 = b.y + b.h / 2;
      const mid = (x1 + x2) / 2;
      return { from: e.from, to: e.to, d: `M ${x1} ${y1} C ${mid} ${y1}, ${mid} ${y2}, ${x2} ${y2}` };
    });

  const maxRank = Math.max(...[...byRank.keys()], 0);
  return {
    nodes: placed,
    edges,
    width: PAD * 2 + (maxRank + 1) * NODE_W + maxRank * GAP_X,
    height: PAD * 2 + maxH,
  };
}

/**
 * 노드 하나의 상태. 색 이름과 라벨을 **같이** 돌려준다 — 상태를 색으로만 구분하지
 * 않는다는 규칙이 화면 코드의 성의가 아니라 데이터가 되게 하려는 것이다.
 */
export function nodeState(node, state) {
  const blocked = (state?.blockers ?? []).length > 0;
  if (state?.current_node === node.id) {
    return blocked ? { kind: "blocked", label: "대기" } : { kind: "current", label: "진행 중" };
  }
  return { kind: "idle", label: "" };
}

/** 노드 패널의 값. 스킬 출처는 workflow(=바인딩 파일) 하나뿐이다. */
export function nodePanel(workflow, state, nodeId, until = Date.now()) {
  const node = (workflow?.nodes ?? []).find((n) => n.id === nodeId);
  if (!node) return null;
  const always = (workflow?.skills ?? [])
    .filter((s) => (s.nodes ?? []).includes("all")).map((s) => s.name).sort();
  const isCurrent = state?.current_node === node.id;
  return {
    id: node.id,
    label: node.label,
    status: nodeState(node, state),
    isCurrent,
    now: isCurrent ? (state?.now ?? "") : "",
    sinceMs: isCurrent && state?.since ? Math.max(0, until - Date.parse(state.since)) : null,
    skills: [...(node.skills ?? [])].sort(),
    alwaysSkills: always,
    runningSkill: state?.skill ?? null,
  };
}

// ── 서브에이전트 ────────────────────────────────────────────────────────
/**
 * 등록된 에이전트 전부에 실행 상태를 붙인다. 목록의 출처는 `workflow.agents`
 * (= `.claude/agents/` 의 실제 파일)이고, 여기에 이름을 박지 않는다.
 * start 뒤에 end 가 없으면 실행 중이다.
 */
export function subagentView(workflow, events, until = Date.now()) {
  const rows = [...(events ?? [])].sort((a, b) => Date.parse(a.at) - Date.parse(b.at));
  const open = new Map();
  for (const e of rows) {
    if (e.event === "start") open.set(e.agent, e);
    else if (e.event === "end") open.delete(e.agent);
  }
  return (workflow?.agents ?? []).map((a) => {
    const run = open.get(a.name);
    return {
      name: a.name,
      description: a.description ?? "",
      running: Boolean(run),
      label: run ? "작업 중" : "대기",
      brief: run?.brief ?? "",
      elapsedMs: run ? Math.max(0, until - Date.parse(run.at)) : null,
    };
  });
}

// ── 활동 피드 ───────────────────────────────────────────────────────────
export function feedRows(transitions, activity, until = Date.now()) {
  const sorted = [...(transitions ?? [])].sort((a, b) => Date.parse(a.at) - Date.parse(b.at));
  const acts = [...(activity ?? [])].sort((a, b) => Date.parse(a.at) - Date.parse(b.at));
  return sorted.map((t, i) => {
    const start = Date.parse(t.at);
    const end = i + 1 < sorted.length ? Date.parse(sorted[i + 1].at) : until;
    return {
      ...t,
      dwell_ms: Number.isFinite(start) && Number.isFinite(end) ? Math.max(0, end - start) : 0,
      activity: acts.filter((a) => {
        const at = Date.parse(a.at);
        return Number.isFinite(at) && at >= start && at < end;
      }),
    };
  }).reverse();
}

// ── 설정 ────────────────────────────────────────────────────────────────
//
// 임계는 **고정값 하나**다. 예상 시간 추정도, 항목별 임계도, 자동 학습도 하지 않는다 —
// 추정한 값과 실제가 어긋나면 화면이 틀린 것을 자신 있게 말하게 된다.
// 프로젝트가 바꾸는 자리: `projects/<이름>/report/config.json` (report-contract 11절)

export const DEFAULT_REPORT_CONFIG = { dwell_threshold_min: 30, activity_gap_min: 10 };

/** config.json 을 기본값에 얹는다. 숫자가 아니거나 0 이하인 칸만 기본값으로 돌린다. */
export function reportConfig(raw) {
  const out = { ...DEFAULT_REPORT_CONFIG };
  for (const k of Object.keys(DEFAULT_REPORT_CONFIG)) {
    const v = raw?.[k];
    if (typeof v === "number" && Number.isFinite(v) && v > 0) out[k] = v;
  }
  return out;
}

// 지연 진단 1) 이 세는 값. `result` 는 자유 문자열이라 부분 일치로 세면 "반려 아님" 같은
// 값까지 걸린다. 그래서 정확히 이 둘만 센다 — 어휘를 늘리려면 report-contract 3절에 먼저 적는다.
export const FAILED_RESULTS = ["실패", "반려"];

/**
 * 활동이 끊긴 구간을 「공백」으로 볼 것인가. 요약 박스와 지연 진단이 **같은 부등호**를 쓰게
 * 하려고 한 자리에 둔다 — 임계가 10분일 때 정확히 10분 끊긴 구간이 한쪽에만 뜨면
 * 두 칸이 같은 설정을 다르게 읽는 것이고, 화면을 보는 사람은 그걸 알 길이 없다.
 */
export function isGap(ms, cfg) {
  return Number.isFinite(ms) && ms >= cfg.activity_gap_min * 60000;
}

// ── 요청 층 ─────────────────────────────────────────────────────────────

/**
 * 전환 줄들을 구간으로 편다. 지연 진단·단계 띠·요청 층이 전부 이 하나를 쓴다 —
 * 같은 계산을 세 벌 두면 화면 세 군데가 다른 숫자를 말한다.
 *
 * 구간 하나 = [이 전환의 at, 다음 전환의 at). 마지막 구간은 기준 시각(until)까지다.
 *
 * `during` 이 이 함수의 핵심이다: 요청 밖 작업이나 그래프 밖 구간에 **직전까지 진행 중이던
 * 요청 항목**을 붙여 둔다. "어느 항목을 하다가 새 일이 끼어들었나"를 이것으로 답한다.
 */
export function itemIntervals(request, transitions, until = Date.now()) {
  const known = new Set((request?.items ?? []).map((it) => it.label));
  // 시각을 못 읽는 줄은 **아예 뺀다.** 남겨 두면 두 가지가 조용히 틀린다 — 정렬 비교자가
  // NaN 을 돌려줘 그 줄의 자리가 안 정해지고, 앞 줄의 끝이 자기 시작으로 접혀 0초가 된다.
  // 0초는 "짧았다"로 읽히지 "못 읽었다"로는 안 읽힌다. 기록 경로가 비 ISO 를 거부하므로
  // 여기 걸리는 것은 파일을 손으로 고친 경우뿐이고, 그때 몇 줄을 버렸는지는 dropped 로 센다.
  const all = [...(transitions ?? [])].filter((t) => !request?.task || t.task === request.task);
  const rows = all.filter((t) => Number.isFinite(Date.parse(t.at)))
    .sort((a, b) => Date.parse(a.at) - Date.parse(b.at));
  const dropped = all.length - rows.length;

  let carried = null;
  const list = rows.map((t, i) => {
    const start = Date.parse(t.at);
    const nextAt = i + 1 < rows.length ? Date.parse(rows[i + 1].at) : until;
    const end = Number.isFinite(nextAt) ? Math.max(start, nextAt) : start;
    const item = t.item ?? null;
    const inside = item !== null && known.has(item);
    if (inside) carried = item;
    return { row: t, start, end, ms: end - start, item, inside, during: carried };
  });
  list.dropped = dropped;
  return list;
}

/**
 * 지금 진행 중인 **요청 안** 항목. 요청 밖으로 나가 있어도 직전 항목이 유지된다.
 * 한 자리에만 둔다 — 「지금 항목」의 뜻을 바꿀 때 고칠 곳이 셋이면 하나를 빠뜨리고,
 * 그러면 띠가 강조하는 칸과 패널이 사유를 붙이는 항목이 서로 달라진다.
 */
export function currentItemOf(intervals) {
  const last = [...intervals].reverse().find((iv) => iv.inside) ?? null;
  return last ? last.item : null;
}

/**
 * 요청 층이 그리는 값. transitions 를 요청의 items 에 대조해 "안"과 "밖"을 가른다.
 *
 * 반환:
 *   done/total      항목 진행
 *   current         지금 항목(마지막 전환의 item), items 에 있으면 그 항목
 *   currentItem     마지막으로 진행 중이던 **요청 안** 항목 (밖으로 나가 있어도 유지된다)
 *   outside         요청 밖 작업 [{ label, ms, count, during: [항목 label…] }] — 체류 시간 큰 순
 *   insideMs        items 안에서 쓴 시간 합계 (밖과 견줄 기준)
 */
export function requestView(request, transitions, _state, until = Date.now()) {
  const items = request?.items ?? [];
  const intervals = itemIntervals(request, transitions, until);

  const outside = new Map();
  let insideMs = 0;
  for (const iv of intervals) {
    if (iv.item === null) continue; // 항목과 무관한 전환
    if (iv.inside) { insideMs += Math.max(0, iv.ms); continue; }
    const cur = outside.get(iv.item) ?? { label: iv.item, ms: 0, count: 0, during: [] };
    cur.ms += Math.max(0, iv.ms);
    cur.count += 1;
    // 같은 파생 작업이 여러 항목 구간에 걸치면 걸친 항목을 전부 적는다. 하나만 적으면
    // "이게 언제 끼어들었나"가 첫 번째 것으로 고정돼 나머지 구간이 안 보인다.
    if (iv.during && !cur.during.includes(iv.during)) cur.during.push(iv.during);
    outside.set(iv.item, cur);
  }

  return {
    total: items.length,
    done: items.filter((it) => it.done).length,
    // "멈춰 있나"의 판정은 여기 한 곳에만 둔다. 화면이 같은 조건을 다시 쓰면 status 어휘가
    // 늘 때 한쪽만 고쳐지고, 그러면 알약은 경고색인데 특이사항에는 안 뜨는 식으로 갈라진다.
    waiting: request?.status === "승인 대기" || request?.status === "중단",
    current: intervals.length > 0 ? (intervals[intervals.length - 1].item ?? null) : null,
    currentItem: currentItemOf(intervals),
    insideMs,
    outside: [...outside.values()].sort((a, b) => b.ms - a.ms),
  };
}

/**
 * 단계 띠. **items 의 배열 순서가 곧 시작 시점에 정한 작업 순서**이므로 그 순서 그대로 돌려준다
 * (순서는 items 와 함께 얼어붙는다 — 기록 스크립트가 재배열을 거부한다).
 *
 * 칸 하나: { index, id, label, ms, state, stateLabel, over }
 *   state 셋뿐이다 — done(완료) · current(진행 중) · todo(아직).
 *   over 는 진행 중인 칸의 체류가 임계를 넘은 것. 색만이 아니라 stateLabel 로도 구분된다.
 */
export function itemStrip(request, transitions, until = Date.now(), cfg = DEFAULT_REPORT_CONFIG) {
  const items = request?.items ?? [];
  const thresholdMs = cfg.dwell_threshold_min * 60000;
  const intervals = itemIntervals(request, transitions, until);
  const currentItem = currentItemOf(intervals);

  const cells = items.map((it, index) => {
    const ms = intervals.filter((iv) => iv.item === it.label).reduce((sum, iv) => sum + Math.max(0, iv.ms), 0);
    const state = it.done ? "done" : it.label === currentItem ? "current" : "todo";
    const over = state === "current" && ms > thresholdMs;
    return {
      index, id: it.id, label: it.label, ms, state,
      stateLabel: state === "done" ? "완료" : state === "current" ? "하는 중" : "아직 안 함",
      over,
    };
  });
  return { cells, currentItem, thresholdMs, thresholdMin: cfg.dwell_threshold_min };
}

/**
 * 요약 박스가 그리는 값. **문장을 새로 만들지 않는다** — 기록 파일의 필드를 고정 템플릿에
 * 끼워 넣을 뿐이다. 특이사항 조건은 아래 여덟 개로 고정이고, 여기 없는 줄은 넣지 않는다.
 */
export function summaryBox(data, until = Date.now(), cfg = DEFAULT_REPORT_CONFIG) {
  const { state, request, transitions = [], activity = [], subagents = [] } = data ?? {};
  const v = request ? requestView(request, transitions, state, until) : null;
  const strip = request ? itemStrip(request, transitions, until, cfg) : null;
  const notes = [];

  // 1) 승인 대기·중단
  if (v?.waiting) {
    notes.push({ code: 1, text: `${request.status} — ${request.status_reason ?? ""}` });
  }
  // 2) 사람 입력 대기
  for (const b of state?.blockers ?? []) notes.push({ code: 2, text: `답을 기다리는 중: ${b.label}` });
  // 3) 요청 밖 작업
  if (v && v.outside.length > 0) {
    const sum = v.outside.reduce((s, o) => s + o.ms, 0);
    notes.push({ code: 3, text: `시킨 것 밖의 일 ${v.outside.length}건 · ${fmtDuration(sum)}` });
  }
  // 4) 그래프 밖
  if (state && state.current_node === null) {
    notes.push({ code: 4, text: `지도에 없는 일 · ${state.off_graph ?? ""}` });
  }
  // 5) 최근 검사 결과
  const withResult = [...transitions].filter((t) => t.result).sort((a, b) => Date.parse(a.at) - Date.parse(b.at));
  const lastResult = withResult[withResult.length - 1];
  if (lastResult) notes.push({ code: 5, text: `방금 끝난 검사: ${lastResult.result} (${fmtTime(lastResult.at)})` });
  // 6) 실행 중 서브에이전트. 등록 목록(workflow.agents)이 아니라 **기록된 이벤트**를 센다 —
  //    등록에 없는 에이전트가 돌고 있으면 그것도 지금 돌고 있는 것이다.
  const openAgents = new Set();
  for (const e of [...subagents].sort((a, b) => Date.parse(a.at) - Date.parse(b.at))) {
    if (e.event === "start") openAgents.add(e.agent);
    else if (e.event === "end") openAgents.delete(e.agent);
  }
  if (openAgents.size > 0) notes.push({ code: 6, text: `서브에이전트 실행 중 ${openAgents.size}개` });
  // 7) 활동 공백. 활동 기록이 **하나도 없으면** 세지 않는다 — 그건 3층(훅)이 안 붙은 상태고,
  //    "조용하다"와 "관찰 장치가 꺼져 있다"는 다르다.
  const lastAct = [...activity].map((a) => Date.parse(a.at)).filter(Number.isFinite).sort((a, b) => a - b).pop();
  if (lastAct !== undefined && isGap(until - lastAct, cfg)) {
    notes.push({ code: 7, text: `${Math.floor((until - lastAct) / 60000)}분째 아무 기록 없음` });
  }
  // 8) 항목 체류가 임계를 넘음
  const over = strip?.cells.find((c) => c.over);
  if (over) {
    notes.push({ code: 8, text: `${over.label} — ${fmtDuration(over.ms)}째 (기준 ${strip.thresholdMin}분)` });
  }

  // 「지금」은 제일 크게 읽히는 한 줄이라 틀린 이름을 적으면 안 된다. 요청 밖 작업 중이면
  // 그 사실과 직전 항목을 같이 준다 — 직전 항목만 적으면 이미 떠난 자리를 지금이라고 말한다.
  const nowText = state?.now ?? "";
  const outsideNow = v && v.current !== null && v.current !== v.currentItem ? v.current : null;
  const nowLine = !state ? "기록 없음"
    : state.current_node === null
      ? `지도에 없는 일 · ${state.off_graph ?? ""} — ${nowText}`
      : outsideNow
        ? `시킨 것 밖: ${outsideNow} (하던 항목 ${v.currentItem ?? "없음"}) — ${nowText}`
        : `${v?.currentItem ?? "항목 없음"} — ${nowText}`;

  return {
    goal: request?.goal ?? null,
    request: request?.request ?? null,
    nowLine,
    elapsed: {
      sinceStartMs: request?.started_at ? Math.max(0, until - Date.parse(request.started_at)) : null,
      done: v?.done ?? 0,
      total: v?.total ?? 0,
      nodeDwellMs: state?.since ? Math.max(0, until - Date.parse(state.since)) : null,
    },
    notes,
    brief: "아직 없음",
  };
}

/**
 * 지연 진단. **판정하지 않는다** — 집계 다섯과 에이전트가 적은 사유 하나를 나란히 놓을 뿐이고,
 * "파생 작업 때문에 늦었다" 같은 결론은 화면이 내리지 않는다. 사람이 둘을 대조한다.
 *
 * 「이 항목 구간」의 뜻: 이 항목이 진행 중이던 동안의 모든 구간이다(그 사이에 끼어든 요청 밖
 * 작업과 그래프 밖 구간을 포함한다). 항목 자신의 체류 시간은 그중 item 이 이 항목인 구간만 센다.
 */
export function delayDiagnosis(itemLabel, data, until = Date.now(), cfg = DEFAULT_REPORT_CONFIG) {
  const { request, transitions = [], activity = [], subagents = [], state } = data ?? {};
  const intervals = itemIntervals(request, transitions, until);
  const current = currentItemOf(intervals);

  // 「이 항목 구간」의 끝을 어디로 보나. 이월(during)은 다음 요청 안 항목이 나올 때까지
  // 계속되는데, **마지막 항목 뒤로는 다음 항목이 영영 안 온다** — 그대로 두면 끝난 항목의
  // 패널이 그 뒤의 모든 시간을 자기 것으로 삼아 "체류 12분에 파생 작업 2시간" 같은
  // 그럴듯한 숫자를 만든다. 그래서 **지금 항목이 아니면 자기 마지막 구간에서 끊는다.**
  // (지금 항목이면 끝이 아직 없으므로 기준 시각까지가 맞다.)
  const raw = intervals.filter((iv) => iv.during === itemLabel);
  const lastOwn = raw.reduce((at, iv, i) => (iv.item === itemLabel ? i : at), -1);
  const span = itemLabel === current || lastOwn < 0 ? raw : raw.slice(0, lastOwn + 1);
  const own = span.filter((iv) => iv.item === itemLabel);
  const dwellMs = own.reduce((s, iv) => s + Math.max(0, iv.ms), 0);

  // 이어진 구간들을 창(window)으로 묶는다. 활동 공백·서브에이전트를 잴 때 필요하다.
  const windows = [];
  for (const iv of span) {
    if (!Number.isFinite(iv.start) || !Number.isFinite(iv.end)) continue;
    const last = windows[windows.length - 1];
    if (last && last.end === iv.start) last.end = iv.end;
    else windows.push({ start: iv.start, end: iv.end });
  }

  // 1) 검사 실패 반복
  const failures = span
    .filter((iv) => FAILED_RESULTS.includes(iv.row.result))
    .map((iv) => ({ at: iv.row.at, result: iv.row.result }));

  // 2) 요청 밖 작업 비중
  const byLabel = new Map();
  for (const iv of span) {
    if (iv.inside || iv.item === null) continue;
    const cur = byLabel.get(iv.item) ?? { label: iv.item, ms: 0 };
    cur.ms += Math.max(0, iv.ms);
    byLabel.set(iv.item, cur);
  }
  const derivedRows = [...byLabel.values()].sort((a, b) => b.ms - a.ms);
  const derivedMs = derivedRows.reduce((s, r) => s + r.ms, 0);

  // 3) 블로커 대기. blockers 가 **없는 줄**은 이 필드가 생기기 전의 기록이라 "0분"이 아니라
  //    "모른다"다. 한 줄도 기록이 없으면 known: false 로 돌려주고 화면은 "기록 없음"을 쓴다.
  const withBlockers = span.filter((iv) => Array.isArray(iv.row.blockers));
  const blockedMs = withBlockers
    .filter((iv) => iv.row.blockers.length > 0)
    .reduce((s, iv) => s + Math.max(0, iv.ms), 0);
  // 옛 줄과 새 줄이 **섞여** 있으면 합계는 반쪽이다. 그것을 확정값으로 그리면 규약 3절이
  // 구분하라고 적은 바로 그 모양이 된다 — 그래서 셋으로 나눠 돌려준다.
  const unknownMs = span.filter((iv) => !Array.isArray(iv.row.blockers))
    .reduce((s, iv) => s + Math.max(0, iv.ms), 0);
  const blockedKnown = withBlockers.length === 0 ? "none" : unknownMs > 0 ? "partial" : "all";

  // 4) 활동 공백. 활동 기록이 **하나도 없으면** 세지 않는다 — 그건 3층(훅)이 안 붙은 상태이고
  //    (규약 5절이 그 상태를 정상으로 인정한다), 그때 구간 전체를 공백이라고 말하면
  //    관찰 장치가 꺼진 것을 "아무 일도 안 했다"로 바꿔 읽는 것이다. 요약 박스 7번과 같은 가드다.
  const gapKnown = activity.length > 0;
  const gaps = [];
  if (gapKnown) {
    for (const w of windows) {
      const marks = [w.start, ...activity.map((a) => Date.parse(a.at)).filter((t) => Number.isFinite(t) && t >= w.start && t <= w.end).sort((a, b) => a - b), w.end];
      for (let i = 1; i < marks.length; i++) {
        if (isGap(marks[i] - marks[i - 1], cfg)) gaps.push({ from: marks[i - 1], to: marks[i], ms: marks[i] - marks[i - 1] });
      }
    }
  }

  // 5) 서브에이전트 — 구간과 겹친 시간만 센다
  const rows = [...subagents].sort((a, b) => Date.parse(a.at) - Date.parse(b.at));
  const runs = [];
  const open = new Map();
  for (const e of rows) {
    if (e.event === "start") open.set(e.agent, Date.parse(e.at));
    else if (e.event === "end" && open.has(e.agent)) {
      runs.push({ name: e.agent, start: open.get(e.agent), end: Date.parse(e.at), running: false });
      open.delete(e.agent);
    }
  }
  for (const [name, start] of open) runs.push({ name, start, end: until, running: true });
  const agents = runs.map((r) => {
    const ms = windows.reduce((s, w) => s + Math.max(0, Math.min(r.end, w.end) - Math.max(r.start, w.start)), 0);
    return { name: r.name, ms, running: r.running };
  }).filter((r) => r.ms > 0).sort((a, b) => b.ms - a.ms);

  // 6) 에이전트가 적은 지연 사유. **지금 항목에 대한 것만**이다 — 지난 항목의 사유를
  //    끌어다 붙이면 대조의 뜻이 사라진다(기록 쪽에서 항목이 바뀔 때 null 로 돌린다).
  const reason = current === itemLabel ? (state?.delay_reason ?? null) : null;

  return {
    label: itemLabel,
    dwellMs,
    failures,
    derived: { rows: derivedRows, totalMs: derivedMs, ratio: dwellMs > 0 ? derivedMs / dwellMs : null },
    blocked: { ms: blockedMs, known: blockedKnown, unknownMs },
    gaps: { rows: gaps, known: gapKnown },
    agents,
    reason,
  };
}
