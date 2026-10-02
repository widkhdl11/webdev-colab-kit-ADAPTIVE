import { countTestOrders, deleteTestOrders } from "./helpers";

// 시험마다 새 주문을 만든다. 남겨 두면 쌓여서 「최근 n 건」 목록에서 시드 주문을 밀어낸다.
// 시작 전에 한 번(지난 실행이 중간에 죽어 남은 것), 끝난 뒤에 한 번 지운다.
function cleanup(): void {
  deleteTestOrders();
  const left = countTestOrders();
  if (left !== 0) throw new Error(`시험 주문 ${left}건이 지워지지 않았다`);
}

export default function setup(): () => void {
  cleanup();
  return cleanup;
}
