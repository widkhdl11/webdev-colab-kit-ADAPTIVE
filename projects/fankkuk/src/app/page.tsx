import { TestCheckout } from "@/features/checkout/ui/test-checkout";

// 디자인 국면 전의 유일한 화면 — 지금은 시험 결제를 돌려 보는 자리다.
// 결제 결과를 쿼리로 받아 보여 주므로 요청마다 그린다.
export const dynamic = "force-dynamic";

export default async function Page({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const clientKey = process.env.NEXT_PUBLIC_TOSS_CLIENT_KEY ?? "";
  if (!clientKey) return <main>NEXT_PUBLIC_TOSS_CLIENT_KEY 가 설정되지 않았습니다.</main>;
  return <TestCheckout clientKey={clientKey} result={await searchParams} />;
}
