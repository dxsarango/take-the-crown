import createMiddleware from "next-intl/middleware";
import { routing } from "./i18n/routing";

export default createMiddleware(routing);

export const config = {
  matcher: "/((?!api|auth|art|og|avatar|_next|_vercel|.*\\..*).*)",
};
