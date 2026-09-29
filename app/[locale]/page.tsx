import { hasLocale } from "next-intl";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { notFound } from "next/navigation";
import { TopBar } from "@/components/top-bar";
import { routing } from "@/i18n/routing";

export default async function HomePage({ params }: PageProps<"/[locale]">) {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) notFound();
  setRequestLocale(locale);
  const t = await getTranslations("app");

  return (
    <>
      <TopBar />
      <main className="flex flex-col gap-4 px-4 py-10 lg:px-12 lg:py-20">
        <h1 className="text-28 leading-tight font-bold lg:text-40">{t("placeholderTitle")}</h1>
        <p className="text-16 text-crown-muted">{t("placeholderBody")}</p>
      </main>
    </>
  );
}
