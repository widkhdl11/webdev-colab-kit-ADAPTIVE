"use client";

import { Component, type ErrorInfo, type ReactNode } from "react";

/**
 * 자식이 그리다 던지면 그 자리만 대신 그린다.
 *
 * **지연 경계(`Suspense`)는 이것을 안 해 준다.** 그쪽이 잡는 것은 던져진 약속이고,
 * 오류는 위로 계속 올라가 라우트 전체를 죽인다. 화면 한 구역이 곁다리인데 그것 때문에
 * 화면 전체가 안 뜨는 자리에 이 경계를 둔다.
 *
 * `fallback` 을 `null` 로 주면 그 구역이 조용히 사라진다 — 곁다리 구역에서는 그것이
 * 「무슨 일이 있었습니다」를 그리는 것보다 낫다. 무엇이 없어졌는지 사용자가 원래 몰랐고,
 * 오류 문구를 그리면 그 자리가 오히려 눈에 띈다.
 *
 * 이 레포에서 클래스를 쓰는 유일한 자리다. React 의 오류 경계는 함수 컴포넌트로 만들 수
 * 없다 — `componentDidCatch` 에 해당하는 훅이 없다.
 */
type Props = {
  readonly children: ReactNode;
  readonly fallback: ReactNode;
  /** 로그에 남길 이름. 어느 구역이 죽었는지 알아야 고칠 수 있다 */
  readonly label: string;
};

type State = { readonly failed: boolean };

export class ErrorBoundary extends Component<Props, State> {
  state: State = { failed: false };

  static getDerivedStateFromError(): State {
    return { failed: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    // 서버 로그로만 보낸다. 여기 담기는 것에는 데이터베이스 원문이 섞일 수 있다.
    console.warn(`[${this.props.label}] 구역을 그리지 못해 비운다`, error, info.componentStack);
  }

  render(): ReactNode {
    return this.state.failed ? this.props.fallback : this.props.children;
  }
}
