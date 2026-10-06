import { removeTestAccounts } from "./account-fixtures";
import { countTestOrders, deleteTestBlocks, deleteTestOrders, psql, SEED } from "./helpers";
import { removeTestCreator } from "./test-creator";

// 시험마다 새 주문을 만든다. 남겨 두면 쌓여서 「최근 n 건」 목록에서 시드 주문을 밀어낸다.
// 시작 전에 한 번(지난 실행이 중간에 죽어 남은 것), 끝난 뒤에 한 번 지운다.
function cleanup(): void {
  deleteTestOrders();
  deleteTestBlocks();
  removeTestCreator(); // 주소 시험 전용 크리에이터 — 지난 실행이 끊겨 남았으면 주소째 지운다
  removeTestAccounts(); // 비밀번호·번호 바꾸기 시험 계정(it_)과 그 기록 — 지난 실행이 끊겨 남았으면 지운다
  const left = countTestOrders();
  if (left !== 0) throw new Error(`시험 주문 ${left}건이 지워지지 않았다`);
}

/** 시드 크리에이터(하루)의 주소 칸 — 사람이 화면에서 등록한 진짜 봉투다. 시험은 이 칸을 건드리면 안 된다. */
function haruAddressFingerprint(): string {
  return psql(
    `select coalesce((select updated_at::text || ':' || md5(envelope::text) from pii.creator_addresses where creator_id = '${SEED.haruCreatorId}'), 'none')`,
  );
}

export default function setup(): () => void {
  cleanup();
  const haruBefore = haruAddressFingerprint();
  return () => {
    cleanup();
    const haruAfter = haruAddressFingerprint();
    if (haruAfter !== haruBefore) throw new Error(`시험이 하루의 주소 칸을 바꿨다: ${haruBefore} → ${haruAfter}`);
  };
}
