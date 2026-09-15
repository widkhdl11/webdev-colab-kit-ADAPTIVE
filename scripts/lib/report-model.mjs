// report-model.mjs — 대시보드가 읽는 세 파일의 스키마와 판정을 한 자리에 둔다.
//
// 왜 한 자리인가:
//   같은 스키마를 내보내는 쪽(export-workflow)·쓰는 쪽(report-note)·검사하는 쪽(check-report)이
//   각자 들고 있으면, 한 군데만 고쳤을 때 나머지가 옛 스키마로 계속 돈다. 그 어긋남은
//   화면에 "칸이 비어 보인다"로만 나타나서 아무도 원인을 못 찾는다.
//
// 이 파일에는 파일 입출력이 없다. 순수 함수만 둔다 — 그래야 검사가 임시 디렉터리 없이 돈다.
//
// 정본 규약: docs/references/report-contract.md

export const NOW_MAX = 80;
export const DELAY_REASON_MAX = 80;

// 임계값(config.json)의 기본값은 여기 없다 — 그것을 읽는 쪽이 화면뿐이라 자산 쪽
// render.mjs 에 하나만 둔다. 두 벌 두면 검사와 화면이 다른 기본값을 쓴다.

// ── 1층: 워크플로우 구조 ────────────────────────────────────────────────
//
// GRAPH 선언에서 노드·엣지를 뽑는다. 이 함수가 유일한 파생 경로다 —
// 내보내기와 검사가 같은 함수를 쓰므로, workflow.json 이 낡으면 검사가 잡는다.
//
// 노드 종류 넷:
//   root      상류가 없는 노드(product)
//   step      보통 노드
//   aggregate 자식이 있는 노드(design) — 자기 산출물 없이 자식이 모두 clean 이라야 clean
//   child     aggregate 의 자식(design/page-designer)
//
// 엣지 방향은 "상류 → 하류"다. 자식은 부모로 들어간다(자식이 clean 이라야 부모가 clean).
export function deriveWorkflow(GRAPH, bindings = []) {
  const perNode = new Map();
  const catalog = new Map();
  for (const b of bindings) {
    if (!b || typeof b.skill !== "string") continue;
    if (!perNode.has(b.node)) perNode.set(b.node, []);
    perNode.get(b.node).push(b.skill);
    if (!catalog.has(b.skill)) catalog.set(b.skill, []);
    catalog.get(b.skill).push(b.node);
  }
  const skillsOf = (id) => [...(perNode.get(id) ?? [])].sort();

  const nodes = [];
  const edges = [];
  for (const [id, def] of Object.entries(GRAPH)) {
    const deps = def.depends_on ?? [];
    const kind = def.parallel ? "aggregate" : deps.length === 0 ? "root" : "step";
    nodes.push({ id, label: id, kind, skills: skillsOf(id) });
    for (const dep of deps) edges.push({ from: dep, to: id });
    for (const childName of Object.keys(def.parallel ?? {})) {
      const childId = `${id}/${childName}`;
      nodes.push({ id: childId, label: childName, kind: "child", parent: id, skills: skillsOf(childId) });
      edges.push({ from: childId, to: id });
    }
  }
  // 사이드바가 읽는 목록. 노드에 붙는 것과 같은 바인딩을 스킬 쪽에서 본 것이다.
  const skills = [...catalog.entries()]
    .map(([name, ns]) => ({ name, nodes: [...new Set(ns)].sort() }))
    .sort((a, b) => a.name.localeCompare(b.name));
  return { nodes, edges, skills };
}

/**
 * 바인딩이 낡았는지 본다(docs-contract 8절). 셋을 각각 다른 각도로 본다 —
 * 하나의 그물은 그 그물이 못 보는 방향으로 샌다.
 *   미등장  스킬 디렉터리가 생겼는데 바인딩에 한 줄도 없다
 *   낡은 줄  바인딩이 없는 노드나 없는 스킬을 가리킨다
 *   빈 계약  contract 가 null 이 아닌데 그 경로에 파일이 없다
 */
export function bindingErrors(bindings, { nodeIds: ids, skillDirs, fileExists }) {
  const errors = [];
  const bound = new Set();
  bindings.forEach((b, i) => {
    const at = `bindings[${i}]`;
    if (!b || typeof b.node !== "string" || typeof b.skill !== "string") {
      errors.push(`${at} 가 { node, skill, contract } 모양이 아니다`);
      return;
    }
    bound.add(b.skill);
    if (b.node !== "all" && !ids.has(b.node)) {
      errors.push(`${at} 의 node(${b.node}) 가 워크플로우에 없다 — 낡은 줄이다`);
    }
    if (!skillDirs.includes(b.skill)) {
      errors.push(`${at} 의 skill(${b.skill}) 디렉터리가 없다 — 낡은 줄이다`);
    }
    if (b.contract !== null && b.contract !== undefined) {
      if (typeof b.contract !== "string" || !fileExists(b.contract)) {
        errors.push(`${at} 의 contract(${b.contract}) 경로에 파일이 없다`);
      }
    }
  });
  const missing = skillDirs.filter((d) => !bound.has(d));
  if (missing.length > 0) {
    errors.push(`바인딩에 안 올라온 스킬: ${missing.join(", ")} — 스킬이 생겼는데 어느 노드에서 쓰는지 아무도 안 적었다`);
  }
  return errors;
}

export function nodeIds(workflow) {
  return new Set((workflow?.nodes ?? []).map((n) => n.id));
}

// ── 2층: 현재 위치와 전환 이력 ──────────────────────────────────────────

function isNonEmptyString(v) {
  return typeof v === "string" && v.trim() !== "";
}

function isIso(v) {
  if (typeof v !== "string" || v.trim() === "") return false;
  const t = Date.parse(v);
  return Number.isFinite(t);
}

/** state.json 판정. 반환은 사람이 읽는 실패 줄 목록(빈 배열이면 통과). */
export function validateState(state, workflow) {
  const errors = [];
  if (state === null || typeof state !== "object" || Array.isArray(state)) {
    return ["state 가 객체가 아니다"];
  }
  for (const field of ["session_id", "task", "now", "since"]) {
    if (!isNonEmptyString(state[field])) errors.push(`state.${field} 가 비었거나 문자열이 아니다`);
  }
  // current_node 는 null 일 수 있다 = "제품 그래프 밖의 일을 하는 중".
  // 킷을 고치는 것처럼 어느 노드의 산출물도 아닌 작업이 그렇다. 예전엔 그럴 때도 노드 이름을
  // 하나 골라 적어야 했고, 그래서 지도가 틀린 상자를 빛냈다 — 모른다고 말할 자리가 없으면
  // 아무 값이나 들어가고, 그 값은 틀렸다는 신호를 아무 데도 안 남긴다.
  if (state.current_node !== null && !isNonEmptyString(state.current_node)) {
    errors.push("state.current_node 는 노드 id 이거나 null 이다");
  }
  if (isNonEmptyString(state.now) && state.now.length > NOW_MAX) {
    errors.push(`state.now 가 ${NOW_MAX}자를 넘는다(${state.now.length}자). 산문 보고를 쓰는 자리가 아니다`);
  }
  if (isNonEmptyString(state.since) && !isIso(state.since)) errors.push("state.since 가 ISO8601 로 안 읽힌다");
  // 노드 목록이 비면 이름 검증이 통째로 꺼진다. 예전엔 그때 조용히 통과시켰는데, 그러면
  // workflow.json 이 없거나 깨진 순간 아무 문자열이나 노드 이름으로 통과한다 —
  // 검사기가 입력이 나쁠 때 스스로 눈을 감는 모양이었다. 이제 그 자체를 위반으로 신고한다.
  const ids = nodeIds(workflow);
  if (ids.size === 0) {
    errors.push("workflow 노드 목록이 비었다 — 노드 이름을 검증할 수 없다(workflow.json 이 없거나 깨졌다)");
  } else if (isNonEmptyString(state.current_node) && !ids.has(state.current_node)) {
    errors.push(`state.current_node(${state.current_node}) 가 workflow 노드에 없다`);
  }
  // 그래프 밖이면 왜 밖인지를 적는다. 빈칸으로 두면 "밖"이 "안 적었다"와 구별되지 않는다.
  if (state.current_node === null && !isNonEmptyString(state.off_graph)) {
    errors.push("state.current_node 가 null 이면 off_graph 에 무슨 작업인지 한 줄이 있어야 한다");
  }
  if (state.current_node !== null && state.off_graph !== undefined) {
    errors.push("off_graph 는 current_node 가 null 일 때만 쓴다");
  }
  // skill 은 선택 필드다. 있으면 workflow 가 아는 이름이어야 한다 — 오타 하나면 화면에서
  // 아무 스킬도 안 빛나고, 그건 "지금 스킬을 안 쓰는 중"과 겉이 같다.
  if (state.skill === undefined) {
    errors.push("state.skill 이 없다 — 스킬을 안 쓰는 중이면 null 을 적는다(빠뜨림과 구별해야 한다)");
  } else if (state.skill !== null) {
    const known = new Set((workflow?.skills ?? []).map((x) => x.name));
    if (!isNonEmptyString(state.skill)) {
      errors.push("state.skill 이 문자열이 아니다");
    } else if (known.size > 0 && !known.has(state.skill)) {
      errors.push(`state.skill(${state.skill}) 이 바인딩에 없는 이름이다`);
    }
  }
  // delay_reason 은 skill 과 같은 이유로 **언제나 있는 필드**다. 안 적었으면 null 이다 —
  // 빠뜨림과 "사유 없음"이 겉이 같으면, 지연 진단 패널의 "기록 없음"이 둘 중 무엇인지 모른다.
  if (state.delay_reason === undefined) {
    errors.push("state.delay_reason 이 없다 — 지연 사유가 없으면 null 을 적는다(빠뜨림과 구별해야 한다)");
  } else if (state.delay_reason !== null) {
    if (!isNonEmptyString(state.delay_reason)) {
      errors.push("state.delay_reason 은 한 줄 문자열이거나 null 이다");
    } else if (state.delay_reason.length > DELAY_REASON_MAX) {
      errors.push(`state.delay_reason 이 ${DELAY_REASON_MAX}자를 넘는다(${state.delay_reason.length}자)`);
    }
  }
  if (!Array.isArray(state.blockers)) {
    errors.push("state.blockers 가 배열이 아니다");
  } else {
    state.blockers.forEach((b, i) => {
      if (b === null || typeof b !== "object" || !isNonEmptyString(b.id) || !isNonEmptyString(b.label)) {
        errors.push(`state.blockers[${i}] 가 { id, label } 모양이 아니다`);
      }
    });
  }
  return errors;
}

/** transitions.jsonl 한 줄 판정. from_node 는 첫 전환에서 null 이어도 된다. */
export function validateTransition(t, workflow, index = 0) {
  const errors = [];
  const at = (m) => `transitions[${index}] ${m}`;
  if (t === null || typeof t !== "object" || Array.isArray(t)) return [at("가 객체가 아니다")];
  if (!isIso(t.at)) errors.push(at(".at 이 ISO8601 로 안 읽힌다"));
  for (const field of ["task", "now"]) {
    if (!isNonEmptyString(t[field])) errors.push(at(`.${field} 가 비었거나 문자열이 아니다`));
  }
  // to_node 도 null 을 받는다 — 그래프 밖 구간이 이력에 그대로 남아야 여정 뷰가 그것을 그린다.
  if (t.to_node !== null && !isNonEmptyString(t.to_node)) errors.push(at(".to_node 는 노드 id 이거나 null 이다"));
  if (isNonEmptyString(t.now) && t.now.length > NOW_MAX) {
    errors.push(at(`.now 가 ${NOW_MAX}자를 넘는다(${t.now.length}자)`));
  }
  if (t.from_node !== null && !isNonEmptyString(t.from_node)) errors.push(at(".from_node 는 문자열이거나 null 이다"));
  if (t.result !== null && !isNonEmptyString(t.result)) errors.push(at(".result 는 문자열이거나 null 이다"));
  // item 은 이 전환이 속한 요청 항목의 label. 요청의 items 에 없는 값이면 "요청 밖 작업"이고,
  // 그 판별은 여기서 하지 않는다 — 요청 기록과 대조해야 알 수 있어서 요청 층이 한다.
  if (t.item !== null && t.item !== undefined && !isNonEmptyString(t.item)) {
    errors.push(at(".item 은 문자열이거나 null 이다"));
  }
  // blockers 는 그 시점의 state.blockers 사본이다. state.json 은 덮어쓰기라 과거가 안 남고,
  // 그래서 "언제 생겨서 언제 풀렸나"를 계산할 자리가 이력밖에 없다.
  // 필드가 **없는 줄**은 이 필드가 생기기 전의 기록이다 — 빈 배열(= blocker 없음)과 다르므로
  // 여기서 요구하지 않고, 화면은 그런 구간을 "기록 없음"으로 구분해 그린다.
  if (t.blockers !== undefined) {
    if (!Array.isArray(t.blockers)) {
      errors.push(at(".blockers 는 배열이다"));
    } else {
      t.blockers.forEach((b, i) => {
        if (b === null || typeof b !== "object" || !isNonEmptyString(b.id) || !isNonEmptyString(b.label)) {
          errors.push(at(`.blockers[${i}] 가 { id, label } 모양이 아니다`));
        }
      });
    }
  }
  const ids = nodeIds(workflow);
  if (ids.size === 0) {
    errors.push(at("을 검증할 workflow 노드 목록이 비었다(workflow.json 이 없거나 깨졌다)"));
  } else {
    for (const field of ["from_node", "to_node"]) {
      const v = t[field];
      if (isNonEmptyString(v) && !ids.has(v)) errors.push(at(`.${field}(${v}) 가 workflow 노드에 없다`));
    }
  }
  return errors;
}

/** JSONL 문자열 → 객체 배열. 빈 줄은 건너뛰고, 깨진 줄은 그 사실을 담아 돌려준다. */
export function parseJsonl(text) {
  const rows = [];
  const broken = [];
  (text ?? "").split(/\r?\n/).forEach((line, i) => {
    if (line.trim() === "") return;
    try {
      rows.push(JSON.parse(line));
    } catch {
      broken.push(i + 1);
    }
  });
  return { rows, broken };
}

/**
 * 노드별 체류 시간(밀리초). 전환 줄 하나는 "이 시각부터 to_node 에 있었다"는 뜻이고,
 * 다음 줄의 at 에서 끝난다. 마지막 줄은 now(기준 시각)까지로 친다.
 */
export function dwellByNode(transitions, until = Date.now()) {
  const out = {};
  const sorted = [...transitions].sort((a, b) => Date.parse(a.at) - Date.parse(b.at));
  sorted.forEach((t, i) => {
    const start = Date.parse(t.at);
    const end = i + 1 < sorted.length ? Date.parse(sorted[i + 1].at) : until;
    if (!Number.isFinite(start) || !Number.isFinite(end)) return;
    out[t.to_node] = (out[t.to_node] ?? 0) + Math.max(0, end - start);
  });
  return out;
}

/**
 * 이력 자체가 끊기지 않았는가(report-contract 3절).
 *
 * 짝 검사(pairingErrors)는 마지막 한 줄만 본다. 그것만으로는 이력 한가운데가 끊긴 것을
 * 못 잡는다 — state.json 만 지우고 transitions.jsonl 이 남은 상태(둘 다 gitignore 대상이라
 * 흔한 모양)에서 다음 기록이 from_node: null 인 줄을 한가운데에 덧붙이면, 마지막 줄과
 * state 는 정확히 맞아떨어져 짝 검사를 통과한다. 그래서 체인을 따로 본다.
 */
export function chainErrors(transitions) {
  const errors = [];
  const name = (v) => (v === null ? "(그래프 밖)" : v);
  transitions.forEach((t, i) => {
    if (i === 0) return; // 첫 줄의 from_node 는 아래 firstRow 검사에서 본다
    const prev = transitions[i - 1];
    // 규칙은 하나다: 이 줄이 출발한 자리는 앞 줄이 도착한 자리와 **정확히 같아야** 한다.
    // null 끼리도 그대로 비교된다 — 그래프 밖 구간이 이어지는 것은 정상이고,
    // "qa 에 도착했는데 다음 줄이 아무 데서도 출발 안 함"은 끊김이다.
    if (t.from_node !== prev.to_node) {
      errors.push(`transitions[${i}].from_node(${name(t.from_node)}) 가 앞 줄의 to_node(${name(prev.to_node)}) 와 다르다 — 이력이 끊겼다`);
    }
    if (Date.parse(t.at) < Date.parse(prev.at)) {
      errors.push(`transitions[${i}].at 이 앞 줄보다 이르다 — 파일 순서와 시간 순서가 갈라졌다`);
    }
  });
  if (transitions.length > 0 && transitions[0].from_node !== null) {
    errors.push(`transitions[0].from_node 가 null 이 아니다(${transitions[0].from_node}) — 첫 줄이 아닌 것이 첫 줄에 있다`);
  }
  return errors;
}

/**
 * 기록 쌍 규칙(report-contract 4절)의 판정.
 * state.json 의 현재 위치는 transitions.jsonl 의 마지막 줄과 같아야 한다 —
 * 다르면 한쪽만 기록된 것이다.
 *
 * 체인 검사를 함께 돌린다. 둘은 같은 규칙의 양면이라 따로 부르면 한쪽만 부르는 자리가 생긴다.
 */
export function pairingErrors(state, transitions) {
  const errors = chainErrors(transitions);
  if (transitions.length === 0) {
    if (state && state.current_node !== undefined) {
      errors.push("state 는 현재 위치를 들고 있는데 transitions 가 비었다 — 한쪽만 기록됐다");
    }
    return errors;
  }
  const last = transitions[transitions.length - 1];
  if (!state) {
    errors.push("transitions 는 있는데 state 가 없다 — 한쪽만 기록됐다");
    return errors;
  }
  if (state.current_node !== last.to_node) {
    errors.push(
      `state.current_node(${state.current_node}) 와 마지막 전환의 to_node(${last.to_node}) 가 다르다 — 한쪽만 기록됐다`,
    );
  }
  if (state.since !== last.at) {
    errors.push(`state.since(${state.since}) 와 마지막 전환의 at(${last.at}) 이 다르다 — 한쪽만 기록됐다`);
  }
  return errors;
}
