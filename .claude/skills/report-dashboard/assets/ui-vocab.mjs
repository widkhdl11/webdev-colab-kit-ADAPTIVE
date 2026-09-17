// ui-vocab.mjs — 화면에 나가는 **라벨 문자열의 정본**. 렌더는 여기서만 말을 가져온다.
//
// 왜 파일을 따로 두나:
//   말이 화면 코드 안에 흩어져 있으면 두 가지가 같이 일어난다. ① 같은 것을 두 군데서
//   다르게 부른다(한쪽은 "그래프 밖", 한쪽은 "지도 밖"). ② 말을 고치려면 화면 코드를
//   고쳐야 해서, 어색한 문구를 발견해도 아무도 안 고친다.
//   여기 모아 두면 문구 수정이 이 파일 한 줄 고치기가 되고, 검사가 "화면에 나간 말이
//   이 표 안에 있나"를 전수로 볼 수 있다.
//
// 규칙 둘:
//   1) 화면의 모든 값에는 라벨이 붙는다. 값만 있는 칸, 점(·)으로 이어 붙인 무라벨 나열 금지.
//   2) 하네스 내부 용어(그래프 밖·지도 밖·노드·체류·item·blocker)는 화면에 나오지 않는다.
//      기록 파일에서 그대로 실려 오는 값(요청 원문·now·항목 이름)은 이 규칙 밖이다 —
//      사람이 적은 문장을 화면이 고쳐 쓰지 않는다.

/** 라벨 칸(왼쪽)에 쓰는 말. 화면에 라벨로 나가는 문자열은 전부 여기 있어야 한다. */
export const LABEL = {
  // 절 제목
  sec_now: "지금",
  sec_progress: "진행",
  sec_notice: "특이사항",
  sec_subagents: "서브에이전트",
  sec_map: "파이프라인 지도",
  sec_feed: "활동 피드",
  sec_summary: "요약",

  // B-1 지금
  now_doing: "지금 하는 일",
  work_kind: "작업 종류",
  stage: "현재 단계",
  stage_dwell: "이 단계에 머문 시간",
  item_progress: "항목 진행",
  status: "상태",

  // B-3 특이사항
  status_reason: "대기 사유",
  blocker: "대기 항목",
  derived: "요청 밖 작업",
  last_result: "최근 검사 결과",
  subagent: "서브에이전트",
  no_activity: "활동 없음",
  dwell: "머문 시간",
  open_request: "열린 요청",

  // B-6 요약 박스
  goal: "목표",
  request_text: "요청 원문",
  brief: "브리프",
};

/** 값 칸에 쓰는 **고정 문구**. 기록에서 실려 오는 값과 달리 이쪽은 렌더가 만드는 말이다. */
export const TERM = {
  kind_request: "제품 요청",
  kind_kit: "하네스 수리 (제품 파이프라인에 속하지 않음)",
  kind_product: "제품 작업 (열린 요청 없음)",

  // 지도의 「파이프라인 밖」 상자와 피드 줄이 쓰는 이름. 작업 종류 행과 괄호 안이 다른 것은
  // 행에서는 "왜 단계가 없나"를 설명해야 하고, 상자 안에서는 짧아야 하기 때문이다.
  box_kit: "하네스 수리 (제품 파이프라인 밖)",

  stage_none: "없음 — 제품 단계가 아니라서",
  strip_none_kit: "제품 파이프라인 밖 작업이라 단계 띠가 없습니다.",
  strip_none_product: "열린 요청이 없어 단계 띠가 없습니다.",

  running: "진행 중",
  none: "없음",
  no_record: "기록 없음",
  not_installed: "미설치",
  no_open_request: "없음",
  open_request_absent: "없음 — 제품 작업 중",

  item_done: "완료",
  item_doing: "하는 중",
  item_todo: "아직 안 함",
  item_over: "오래 걸리는 중",

  expand: "펼치기",
  all_idle: "전부 대기",
  agent_running: "작업 중",
  agent_idle: "대기",
};

/** 검사 결과(전환 줄의 `result`)의 화면 표기. 표에 없는 값은 기록된 그대로 내보낸다. */
export const RESULT_TEXT = { "통과": "검사 통과", "반려": "검사 반려", "실패": "검사 실패" };

/** 단계 id → 한글 라벨. 없는 id 는 기록된 이름을 그대로 쓴다(자식 단계 등). */
export const NODE_LABEL = {
  product: "제품",
  spec: "스펙",
  design: "설계",
  implement: "구현",
  qa: "검사",
  review: "리뷰",
  deploy: "배포",
};

// ── 값을 끼워 넣는 자리. 형식까지 여기 두는 이유는 하나다 — 문구가 어색할 때
//    고칠 자리가 이 파일이어야 하고, 화면 코드를 읽을 일이 없어야 한다.

export const FMT = {
  /** 「지금 하는 일」 — 무엇을 하는지와 지금 상태를 한 줄로 */
  doing: (what, now) => (now ? `${what} — ${now}` : what),
  /** 「현재 단계」 — 한글 라벨에 id 를 괄호로 병기한다 */
  stage: (label, id) => `${label} (${id})`,
  /** 「항목 진행」 */
  itemProgress: (done, total, current) =>
    current ? `${done}/${total} 완료 · 현재 항목: ${current}` : `${done}/${total} 완료`,
  /** 「상태」 뒤에 붙는 활동 공백 */
  idleSuffix: (text, min) => `${text} (활동 없음 ${min}분)`,
  /** 특이사항 — 요청 밖 작업 */
  derived: (count, duration) => `${count}건 · ${duration}`,
  /** 특이사항 — 최근 검사 결과 */
  lastResult: (text, time) => `${text} (${time})`,
  /** 특이사항 — 실행 중 서브에이전트 */
  agentsRunning: (count) => `실행 중 ${count}개`,
  /** 특이사항 — 활동 없음 */
  idleFor: (min) => `${min}분`,
  /** 특이사항 — 항목이 오래 걸림 */
  overDwell: (item, duration, thresholdMin) => `${item} — ${duration} (기준 ${thresholdMin}분)`,
  /** 접힌 서브에이전트 절 제목 */
  allIdle: (count) => `${TERM.all_idle} (${count})`,
  /** 피드 줄의 단계 표기 */
  feedStage: (label, dwell) => `${label} 단계 · 머문 시간 ${dwell}`,
  feedKit: (dwell) => `하네스 수리 · 머문 시간 ${dwell}`,
  /** 요청 밖 작업 한 줄 — 값 둘이 이어지지만 둘 다 제 라벨을 달고 있다 */
  outsideCount: (count) => `횟수 ${count}회`,
  outsideDuring: (items) => `하던 항목 ${items.join(", ")}`,
};

/** 전수 검사가 보는 목록. 화면에 라벨로 나간 말이 여기 없으면 검사가 잡는다. */
export const ALL_LABELS = Object.values(LABEL);

/**
 * 화면에 나오면 안 되는 내부 용어. 검사가 **렌더가 만든 문자열**에서만 찾는다 —
 * 기록에서 실려 온 값(사람이 적은 문장)은 대상이 아니다.
 */
export const INTERNAL_TERMS = [
  "그래프 밖", "지도 밖", "노드", "체류", "파생", "귀속",
  "item", "blocker", "dwell", "derived", "off_graph", "subagent", "current_node",
];
