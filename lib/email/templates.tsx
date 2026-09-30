import { Body } from "@react-email/body";
import { Container } from "@react-email/container";
import { Head } from "@react-email/head";
import { Html } from "@react-email/html";
import { Img } from "@react-email/img";
import { Link } from "@react-email/link";
import { Preview } from "@react-email/preview";
import { render } from "@react-email/render";
import { Section } from "@react-email/section";
import { Text } from "@react-email/text";
import type { ReactNode } from "react";
import { BRAND_NAME } from "@/lib/config/brand";

// Email templates from design/share/SHARE.md ("You were dethroned"): one column, tables and inline
// styles, 600 px on desktop and 375 px on phones, one button. The price drop, season start and
// admin emails reuse the same frame without the portrait image.

const C = { page: "#0E0C14", ink: "#14111C", velvet: "#1E1A29", stone: "#3D3550", text: "#F3EDE2", muted: "#A89FB8", gold: "#F2C14E" };
const SANS = "Manrope, 'Segoe UI', Arial, sans-serif";
const PIXEL = "'Pixelify Sans', Manrope, Arial, sans-serif";

// Phones: 20 px padding, the smaller header image and a full-width button.
const RESPONSIVE = `
@media only screen and (max-width: 480px) {
  .outer { padding: 0 !important; }
  .pad { padding-left: 20px !important; padding-right: 20px !important; }
  .hero { width: 330px !important; height: 132px !important; }
  .cap { width: 132px !important; }
  .btn { display: block !important; text-align: center !important; }
}`;

export type Rendered = { html: string; text: string };

export type Frame = {
  lang: string;
  preview: string;
  season: string;
  foot: string;
  unsubscribe: { label: string; url: string } | null;
};

function Layout({ frame, children }: { frame: Frame; children: ReactNode }) {
  return (
    <Html lang={frame.lang}>
      <Head>
        <meta name="color-scheme" content="dark" />
        <meta name="supported-color-schemes" content="dark" />
        {/* eslint-disable-next-line @next/next/no-page-custom-font -- an email document, not a Next page */}
        <link href="https://fonts.googleapis.com/css2?family=Manrope:wght@500;700&family=Pixelify+Sans:wght@700&display=swap" rel="stylesheet" />
        <style>{RESPONSIVE}</style>
      </Head>
      <Preview>{frame.preview}</Preview>
      <Body style={{ margin: 0, padding: 0, background: C.page, fontFamily: SANS, color: C.text }}>
        <Section className="outer" style={{ padding: "40px 0" }}>
        <Container style={{ width: "100%", maxWidth: 600, background: C.ink }}>
          <Section className="pad" style={{ background: C.velvet, padding: "20px 40px" }}>
            <table role="presentation" width="100%" cellPadding={0} cellSpacing={0}>
              <tbody>
                <tr>
                  <td style={{ fontFamily: PIXEL, fontSize: 24, fontWeight: 700, color: C.text }}>{BRAND_NAME}</td>
                  <td align="right" style={{ fontSize: 12, color: C.muted }}>
                    {frame.season}
                  </td>
                </tr>
              </tbody>
            </table>
          </Section>
          {children}
          <Section className="pad" style={{ padding: "20px 40px 28px", borderTop: `2px solid ${C.velvet}` }}>
            <Text style={{ margin: 0, fontSize: 12, lineHeight: 1.6, color: C.muted }}>
              {frame.foot}{" "}
              {frame.unsubscribe && (
                <Link href={frame.unsubscribe.url} style={{ color: C.text, textDecoration: "underline", textDecorationColor: C.stone }}>
                  {frame.unsubscribe.label}
                </Link>
              )}
            </Text>
          </Section>
        </Container>
        </Section>
      </Body>
    </Html>
  );
}

/** The crown action: gold, with the relief drawn as solid borders (clients drop box-shadow). */
function GoldButton({ label, url }: { label: string; url: string }) {
  return (
    <Link
      href={url}
      className="btn"
      style={{
        display: "inline-block",
        margin: "12px 4px 4px",
        padding: "0 28px",
        lineHeight: "44px",
        background: C.gold,
        color: C.ink,
        fontSize: 16,
        fontWeight: 700,
        textDecoration: "none",
        borderTop: "4px solid #F7D57F",
        borderLeft: "4px solid #F7D57F",
        borderBottom: "4px solid #C9962C",
        borderRight: "4px solid #C9962C",
      }}
    >
      {label}
    </Link>
  );
}

export type DethronedEmail = {
  frame: Frame;
  title: string;
  image: { url: string; alt: string; you: string; newKing: string };
  m1: string;
  duration: string;
  m2: string;
  king: { name: string; flagUrl: string | null };
  m3: string;
  price: string;
  button: { label: string; url: string };
  note: string;
};

export function Dethroned(p: DethronedEmail) {
  return (
    <Layout frame={p.frame}>
      <Section className="pad" style={{ padding: "32px 40px 8px", textAlign: "center" }}>
        <Img className="hero" src={p.image.url} width={440} height={176} alt={p.image.alt} style={{ display: "block", margin: "0 auto", imageRendering: "pixelated" }} />
        <table role="presentation" align="center" cellPadding={0} cellSpacing={0} style={{ margin: "10px auto 0" }}>
          <tbody>
            <tr>
              <td className="cap" width={176} align="center" style={{ fontSize: 12, color: C.muted }}>
                {p.image.you}
              </td>
              <td width={88} />
              <td className="cap" width={176} align="center" style={{ fontSize: 12, color: C.muted }}>
                {p.image.newKing}
              </td>
            </tr>
          </tbody>
        </table>
      </Section>
      <Section className="pad" style={{ padding: "20px 40px 32px" }}>
        <Text style={{ margin: "0 0 16px", fontSize: 28, fontWeight: 700, lineHeight: 1.2 }}>{p.title}</Text>
        <Text style={{ margin: 0, fontSize: 16, lineHeight: 1.6, color: C.text }}>
          {p.m1} <span style={{ fontFamily: PIXEL, fontWeight: 700 }}>{p.duration}</span>
          {p.m2}
          <strong>{p.king.name}</strong>
          {p.king.flagUrl && (
            <>
              {" "}
              <Img src={p.king.flagUrl} width={24} height={16} alt="" style={{ display: "inline-block", verticalAlign: -2, imageRendering: "pixelated" }} />
            </>
          )}
          . {p.m3} <span style={{ fontFamily: PIXEL, fontWeight: 700, color: C.gold }}>{p.price}</span>.
        </Text>
        <GoldButton {...p.button} />
        <Text style={{ margin: "16px 0 0", fontSize: 14, lineHeight: 1.5, color: C.muted }}>{p.note}</Text>
      </Section>
    </Layout>
  );
}

export type NoticeEmail = {
  frame: Frame;
  title: string;
  body: string;
  button: { label: string; url: string };
  note: string | null;
};

/** Price drop, season start and admin alerts: title, one paragraph, the button. */
export function Notice(p: NoticeEmail) {
  return (
    <Layout frame={p.frame}>
      <Section className="pad" style={{ padding: "32px 40px" }}>
        <Text style={{ margin: "0 0 16px", fontSize: 28, fontWeight: 700, lineHeight: 1.2 }}>{p.title}</Text>
        <Text style={{ margin: 0, fontSize: 16, lineHeight: 1.6, color: C.text }}>{p.body}</Text>
        <GoldButton {...p.button} />
        {p.note && <Text style={{ margin: "16px 0 0", fontSize: 14, lineHeight: 1.5, color: C.muted }}>{p.note}</Text>}
      </Section>
    </Layout>
  );
}

export async function renderEmail(element: ReactNode): Promise<Rendered> {
  const [html, text] = await Promise.all([render(element), render(element, { plainText: true })]);
  return { html, text };
}
