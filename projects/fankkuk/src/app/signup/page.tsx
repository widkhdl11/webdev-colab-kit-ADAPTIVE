import { SignupPage } from "@/widgets/signup/ui/signup-page";
import { SiteFooter } from "@/widgets/site-footer/ui/site-footer";
import { SiteHeader } from "@/widgets/site-header/ui/site-header";

export default function Page() {
  return (
    <>
      <SiteHeader role="guest" current="/signup" />
      <SignupPage />
      <SiteFooter />
    </>
  );
}
