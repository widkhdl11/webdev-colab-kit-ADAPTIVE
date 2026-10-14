import type { ReactNode } from "react";

// 로그인 후 관리 화면(내 활동·크리에이터 관리)의 본문 틀 — 넓은 틀(글 폭 최대 1200 · 카드 격자·표는 .pane-wide 로 1360, 안쪽 여백 40, 사이드바를 뺀 남은 영역 가운데).
// 메뉴는 왼쪽 앱 사이드바(widgets/site-header)가 맡는다. v11 의 「내 팬꾹」 제목·왼쪽 메뉴는 사이드바와 겹쳐 뺐다(design-rules 00절).
// 사이드바의 현재 칸은 헤더(SiteHeader)의 current 가 정한다.
// 라우트(app)가 이 틀 안에 각 화면 본문 위젯을 끼운다. 위젯끼리 서로 가져다 쓰지 않게 하려는 배치다.

type Props = { children: ReactNode };

export function MyShell({ children }: Props) {
  return (
    <main id="main" className="page-pane my-body my-main">
      {children}
    </main>
  );
}
