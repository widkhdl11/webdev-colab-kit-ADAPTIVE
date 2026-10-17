"use client";

import { useEffect, useState } from "react";
import { useLastHeader } from "../model/header-memory";
import { RememberedSiteHeader } from "./site-header";
import s from "./page-loading.module.css";

// 페이지를 옮기는 동안 보이는 화면(app 의 loading.tsx). 상단 바·사이드바는 마지막으로 그린 그대로 두고,
// 본문 자리만 회색 뼈대 — 누르는 순간 화면이 바뀌고, 새 페이지가 도착하면 통째로 바뀐다.
// 본문 틀은 로그인 전이면 1152 선(pub-inner), 로그인 후면 사이드바 옆 본문 틀(page-pane)과 같은 자리.
// 기억이 없으면(주소를 직접 열어 처음 들어온 순간) 뼈대를 그리지 않는다 — 로그인했는지 몰라 폭을 정할 수 없고,
// 틀린 폭으로 그렸다가 사이드바 화면으로 바뀌면 화면이 크게 밀린다.
// withHeader=false: 자기 틀(레이아웃)이 따로 있는 운영자 화면 — 뼈대만.

/** 화면 읽기 프로그램용 「불러오는 중」 — 안내 칸을 먼저 붙이고 글자는 한 박자 뒤에 넣어야 새 안내로 읽힌다. busy 영역 밖에 둔다. */
function LoadingStatus() {
  const [text, setText] = useState("");
  useEffect(() => setText("불러오는 중"), []);
  return (
    <p className="sr-only" role="status">
      {text}
    </p>
  );
}

function Skeleton() {
  return (
    <div className={s.sk} aria-hidden="true">
      <div className={`${s.bar} ${s.title}`} />
      <div className={`${s.bar} ${s.line}`} />
      <div className={s.cards}>
        <div className={s.card} />
        <div className={s.card} />
        <div className={s.card} />
      </div>
    </div>
  );
}

export function PageLoading({ withHeader = true }: { withHeader?: boolean }) {
  const last = useLastHeader();
  if (!withHeader) {
    return (
      <>
        <LoadingStatus />
        <Skeleton />
      </>
    );
  }
  if (last === null) return <LoadingStatus />;
  const signedIn = last.role !== "guest";
  return (
    <>
      <RememberedSiteHeader />
      <LoadingStatus />
      <main id="main" className={signedIn ? "page-pane my-body my-main" : s.pub} data-loading="">
        {signedIn ? <Skeleton /> : <div className="pub-inner"><Skeleton /></div>}
      </main>
    </>
  );
}
