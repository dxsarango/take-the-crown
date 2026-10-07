import { getTranslations } from "next-intl/server";
import { ErrorScreen, errorAction } from "@/components/error-screen";
import { Link } from "@/i18n/navigation";

/** Any page that does not exist, in the visitor's language. */
export default async function NotFound() {
  const t = await getTranslations("errors");
  return (
    <ErrorScreen title={t("notFoundTitle")} body={t("notFoundBody")} crownAlt={t("crownAlt")}>
      <Link href="/" className={errorAction}>
        {t("home")}
      </Link>
    </ErrorScreen>
  );
}
