import type { ReactNode } from "react";

// 로그인 후 관리 화면(내 활동·크리에이터 관리)의 본문 틀 — 안쪽 여백 40, 사이드바를 뺀 남은 영역 가운데.
// 폭은 내용 종류로 고른다(design-rules 00절 「본문 틀」, 카드 d89 · 시안 v22-width):
//   list  = 목록형(한 줄 목록·카드 목록)·홈 880
//   form  = 입력·설정형 720
//   broad = 표·여러 열 카드 격자·오른쪽 칸이 붙는 두 단 1200 (카드 격자는 안에서 .pane-wide 로 1360 까지)
// 메뉴는 왼쪽 앱 사이드바(widgets/site-header)가 맡는다. 사이드바의 현재 칸은 헤더(SiteHeader)의 current 가 정한다.
// 라우트(app)가 이 틀 안에 각 화면 본문 위젯을 끼운다. 위젯끼리 서로 가져다 쓰지 않게 하려는 배치다.

export type PaneWidth = "list" | "form" | "broad";

const PANE_CLASS: Record<PaneWidth, string> = { list: "", form: " pane-form", broad: " pane-broad" };

type Props = { width: PaneWidth; children: ReactNode };

export function MyShell({ width, children }: Props) {
  return (
    <main id="main" className={`page-pane${PANE_CLASS[width]} my-body my-main`}>
      {children}
    </main>
  );
}
