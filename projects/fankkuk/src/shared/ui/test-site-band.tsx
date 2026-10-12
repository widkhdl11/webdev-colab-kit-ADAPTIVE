import { isTestSite } from "@/shared/lib/env/test-site";
import styles from "./test-site-band.module.css";

// 시험 사이트 띠(test-site INV-TS3). 가짜 확인으로 만든 계정·승인을 실제로 믿지 않게, 시험 사이트의 모든 화면 맨 위에 둔다.
// 서버 부품이다 — 설정은 여기서 직접 읽고 속성으로 받지 않는다(설정 전체를 속성으로 넘기면 화면 쪽 데이터로 실릴 수 있다).
export function TestSiteBand() {
  if (!isTestSite(process.env)) return null;
  return (
    <div className={styles.band} role="note">
      <strong>시험 사이트</strong> · 본인 확인과 승인 서명이 가짜예요. 실제 선물이나 돈을 보내지 마세요.
    </div>
  );
}
