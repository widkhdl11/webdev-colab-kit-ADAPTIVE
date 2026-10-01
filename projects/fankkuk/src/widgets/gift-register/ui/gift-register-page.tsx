import { RegisterForm, type CreatorOption } from "@/features/gift-register/ui/register-form";

// 팬 — 선물 보내기 본문. 시안: docs/design/mockups/site/v4/send.html (4단계, 카드 안 이전·다음, PC 오른쪽 요약)
// 헤더·푸터는 라우트(app)가 붙인다 — 위젯끼리 import 하지 않게.
export function GiftRegisterPage({ creators, initialCreatorId }: { creators: readonly CreatorOption[]; initialCreatorId?: string }) {
  return (
    <main id="main">
      <div className="container page-title">
        <h1 className="page-h">선물 보내기</h1>
        <p>누구에게, 무엇을, 몇 상자 보낼지 알려 주세요.</p>
      </div>
      <RegisterForm creators={creators} initialCreatorId={initialCreatorId} />
    </main>
  );
}
