import { notFound } from "next/navigation";
import { TestCheckout } from "@/features/checkout/ui/test-checkout";

// 개발용 시험 결제 화면. 운영 환경에서는 없는 주소다.
export const dynamic = "force-dynamic";

export default async function Page({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  if (process.env.NODE_ENV === "production" || process.env.VERCEL_ENV === "production") notFound();
  const clientKey = process.env.NEXT_PUBLIC_TOSS_CLIENT_KEY ?? "";
  if (!clientKey) return <main>NEXT_PUBLIC_TOSS_CLIENT_KEY 가 설정되지 않았습니다.</main>;
  return <TestCheckout clientKey={clientKey} result={await searchParams} />;
}
