import type { ChargeBreakdown } from "@/entities/payment/model/charge";
import { RegisterForm, type CreatorOption } from "@/features/gift-register/ui/register-form";
import { AppHeader } from "@/shared/ui/app-header";
import s from "@/shared/ui/screen.module.css";

// 팬 — 선물 등록. 시각 기준: docs/design/design-rules.md (메인에서 승인된 방향을 물려받음)
export function GiftRegisterPage({ creators, charge }: { creators: readonly CreatorOption[]; charge: ChargeBreakdown }) {
  return (
    <div className={`${s.root} ${s.page}`}>
      <AppHeader link={{ href: "/gifts", label: "내 선물" }} />
      <main className={s.main}>
        <p className={s.eyebrow}>선물 등록</p>
        <h1>어떤 선물을 보낼까요?</h1>
        <p className={s.lead}>등록하면 크리에이터에게 승인 요청이 가요. 승인된 선물만 배송돼요.</p>
        <div className={s.section}>
          <RegisterForm creators={creators} charge={charge} />
        </div>
      </main>
    </div>
  );
}
