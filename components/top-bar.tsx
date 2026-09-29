import { getTranslations } from "next-intl/server";
import { LocaleSwitch } from "./locale-switch";

export async function TopBar() {
  const t = await getTranslations("app");

  return (
    <header className="flex h-14 items-center justify-between gap-2 bg-crown-velvet pr-3 pl-4 shadow-bar-bottom lg:h-18 lg:gap-6 lg:px-12">
      <div className="font-pixel text-20 leading-none font-bold lg:text-28">{t("name")}</div>
      <LocaleSwitch />
    </header>
  );
}
