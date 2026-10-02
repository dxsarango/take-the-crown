import "server-only";
import { getTranslations } from "next-intl/server";
import { ImageResponse } from "next/og";
import type { CSSProperties, ReactNode } from "react";
import type { Locale } from "@/i18n/routing";
import { RANK_STYLE } from "@/lib/art/frames";
import { portraitPixels } from "@/lib/art/portrait";
import { BRAND_NAME } from "@/lib/config/brand";
import { formatDuration, formatPrice } from "@/lib/format";
import { MEDAL_KEY } from "@/lib/game/achievements";
import { rarityHex } from "@/lib/game/rarity";
import type { Person } from "@/lib/home/data";
import { cardScene, flagPixels, medalPixels } from "./art";
import { CARD_SIZES, type CardModel, type CardSize } from "./data";
import { cardFonts } from "./fonts";
import { dataURL, pixelsPNG, withUploadPixels } from "./raster";

// Share cards from design/share/SHARE.md. Pixel art is drawn to PNG at the exact size it is shown,
// so the renderer never resamples it. Flags use the nearest integer scale to the design's size.


const C = { ink: "#14111C", velvet: "#1E1A29", deep: "#17141E", stone: "#3D3550", text: "#F3EDE2", muted: "#A89FB8", gold: "#F2C14E" };
const PIXEL = "Pixelify Sans";

type Art = { src: string; width: number; height: number };

async function art(pixels: Parameters<typeof pixelsPNG>[0], w: number, h: number, scale: number): Promise<Art> {
  return { src: dataURL(await pixelsPNG(pixels, w, h, scale)), width: w * scale, height: h * scale };
}

function Img({ art: a, style }: { art: Art; style?: CSSProperties }) {
  // eslint-disable-next-line @next/next/no-img-element -- rendered by next/og, not the browser
  return <img src={a.src} width={a.width} height={a.height} alt="" style={{ display: "flex", flexShrink: 0, ...style }} />;
}

/** Big numbers shrink for long values so they stay inside their column. */
function fit(text: string, size: number, room: number): number {
  const estimate = text.length * size * 0.56;
  return estimate <= room ? size : Math.max(Math.floor(size * (room / estimate)), Math.floor(size / 2));
}

function Pill({ label, color, height, pad, swatch, font, border }: { label: string; color: string; height: number; pad: number; swatch: number; font: number; border: string }) {
  return (
    <div style={{ height, padding: `0 ${pad}px`, display: "flex", alignItems: "center", gap: pad - 4, border: `${height > 48 ? 3 : 2}px solid ${border}`, borderRadius: 4 }}>
      <div style={{ width: swatch, height: swatch, background: color }} />
      <div style={{ fontFamily: PIXEL, fontSize: font, fontWeight: 500 }}>{label}</div>
    </div>
  );
}

type Texts = {
  season: string;
  rank: (p: Person) => string;
  duration: (seconds: number) => string;
};

export async function renderCard(model: CardModel, size: CardSize, locale: Locale): Promise<ImageResponse> {
  const t = await getTranslations({ locale, namespace: "share" });
  const seasonT = await getTranslations({ locale, namespace: "season" });
  const rankT = await getTranslations({ locale, namespace: "rank" });
  const unitT = await getTranslations({ locale, namespace: "common.units" });
  const units = { h: unitT("h"), m: unitT("m"), s: unitT("s") };
  const texts: Texts = {
    season: seasonT.has(`name.${model.seasonId}` as "name.0") ? seasonT(`name.${model.seasonId}` as "name.0") : String(model.seasonId),
    rank: (p) => rankT(p.rank),
    duration: (seconds) => formatDuration(seconds, units),
  };
  const story = size === "story";
  const person = { ...model.person, avatar: await withUploadPixels(model.person.avatar) };
  const flagScale = story ? 4 : 3;
  const flag = person.countryCode ? await art(await flagPixels(person.countryCode), 12, 8, flagScale) : null;

  const header = (
    <div style={{ display: "flex", alignItems: "baseline", justifyContent: story ? "space-between" : "flex-start", gap: story ? 16 : 14, flexWrap: "wrap" }}>
      <div style={{ fontFamily: PIXEL, fontSize: story ? 40 : 32, fontWeight: 700 }}>{BRAND_NAME}</div>
      <div style={{ fontSize: story ? 24 : 18, color: C.muted }}>{texts.season}</div>
    </div>
  );

  let body: ReactNode;
  if (model.template === "achievement" || model.template === "rank") {
    // A rank-up is the achievement card with the player's portrait, in the new rank's frame, as its medal.
    let ring: string;
    let hero: Art;
    let label: string;
    let name: string;
    let detail: ReactNode;
    let portrait: Art | null = null;
    if (model.template === "achievement") {
      ring = rarityHex(model.rarity, model.achievementSeasonId);
      hero = await art(await medalPixels(model.code), 24, 24, story ? 24 : 16);
      portrait = await art(portraitPixels(person.avatar, person.rank, { season: model.seasonId, crown: false }), 44, 44, story ? 3 : 2);
      const medals = await getTranslations({ locale, namespace: "medals" });
      const rarityT = await getTranslations({ locale, namespace: "rarity" });
      label = t("achLabel");
      name = medals(`${MEDAL_KEY[model.code]}.name` as "regicide.name");
      const pct = t("pctOf", { pct: `${new Intl.NumberFormat(locale === "es" ? "es-ES" : "en-US", { maximumFractionDigits: 1 }).format(model.holderPct)}%` });
      detail = (
        <div style={{ display: "flex", alignItems: "center", gap: story ? 20 : 16, flexWrap: "wrap" }}>
          <Pill
            label={rarityT(model.rarity)}
            color={ring}
            border={ring}
            height={story ? 52 : 40}
            pad={story ? 18 : 14}
            swatch={story ? 18 : 14}
            font={story ? 28 : 20}
          />
          <div style={{ fontSize: story ? 36 : 28, fontWeight: 500 }}>{pct}</div>
        </div>
      );
    } else {
      ring = RANK_STYLE[model.rank].swatch;
      hero = await art(portraitPixels(person.avatar, model.rank, { season: model.seasonId, crown: false }), 44, 44, story ? 12 : 8);
      label = t("rankLabel");
      name = rankT(model.rank);
      detail = <div style={{ fontSize: story ? 36 : 28, fontWeight: 500 }}>{t("rankTotal", { time: texts.duration(model.totalSeconds) })}</div>;
    }
    const owner = (
      <div style={{ display: "flex", alignItems: "center", gap: story ? 20 : 16, marginTop: story ? 12 : 0 }}>
        {portrait && <Img art={portrait} />}
        <div style={{ fontSize: story ? 44 : 28, fontWeight: 700 }}>{person.name}</div>
        {flag && <Img art={flag} />}
      </div>
    );
    body = story ? (
      <div style={{ position: "absolute", left: 0, top: 360, width: 1080, display: "flex", flexDirection: "column", alignItems: "center", gap: 36 }}>
        <div style={{ width: 1080, padding: "64px 0", background: C.velvet, borderTop: `12px solid ${ring}`, display: "flex", justifyContent: "center" }}>
          <Img art={hero} />
        </div>
        <div style={{ fontSize: 36, color: C.muted }}>{label}</div>
        <div style={{ fontSize: fit(name, 112, 920), fontWeight: 700, lineHeight: 1, letterSpacing: "-0.02em" }}>{name}</div>
        {detail}
        {owner}
      </div>
    ) : (
      <div style={{ display: "flex", width: 1200, height: 630 }}>
        <div style={{ width: 560, height: 630, background: C.velvet, borderTop: `12px solid ${ring}`, display: "flex", alignItems: "center", justifyContent: "center" }}>
          <Img art={hero} style={{ marginTop: -12 }} />
        </div>
        <div style={{ flex: 1, padding: "56px 56px 52px 56px", display: "flex", flexDirection: "column", justifyContent: "space-between" }}>
          {header}
          <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
            <div style={{ fontSize: 24, color: C.muted }}>{label}</div>
            <div style={{ fontSize: fit(name, 80, 528), fontWeight: 700, lineHeight: 1, letterSpacing: "-0.02em" }}>{name}</div>
            {detail}
          </div>
          {owner}
        </div>
      </div>
    );
  } else {
    const mood = model.template;
    const scene = story
      ? await art(cardScene(120, 84, { season: model.seasonId, rank: person.rank, avatar: person.avatar, mood }), 120, 84, 9)
      : await art(cardScene(100, 90, { season: model.seasonId, rank: person.rank, avatar: person.avatar, mood }), 100, 90, 7);
    const rankPill = (
      <Pill
        label={texts.rank(person)}
        color={RANK_STYLE[person.rank].swatch}
        border={C.stone}
        height={story ? 44 : 36}
        pad={story ? 14 : 12}
        swatch={story ? 14 : 12}
        font={story ? 22 : 18}
      />
    );
    const room = story ? 920 : 400;
    const bigSize = story ? 160 : 112;

    let head: string;
    let label: string | null = null;
    let labelColor = C.muted;
    let big: string;
    let bigColor = C.text;
    let unit: string | null = null;
    if (model.template === "victory") {
      head = t("vicHead");
      label = t("vicLabel");
      big = texts.duration(model.seconds);
    } else if (model.template === "challenge") {
      head = t("chaHead");
      label = t("chaLabel");
      labelColor = C.text;
      big = formatPrice(model.priceCents, locale);
      bigColor = C.gold;
    } else {
      head = t("dthHead");
      if (model.seconds < 60) {
        big = String(model.seconds);
        unit = t("dthSeconds", { n: model.seconds });
      } else if (model.seconds < 3600) {
        const minutes = Math.floor(model.seconds / 60);
        big = String(minutes);
        unit = t("dthMinutes", { n: minutes });
      } else {
        big = texts.duration(model.seconds);
      }
    }
    const bigNumber = (
      <div style={{ display: "flex", alignItems: "baseline", gap: story ? 20 : 14 }}>
        <div style={{ fontFamily: PIXEL, fontSize: fit(big, bigSize, unit ? room - 220 : room), fontWeight: 700, lineHeight: 1, color: bigColor }}>{big}</div>
        {unit && <div style={{ fontSize: story ? 56 : 40, fontWeight: 700 }}>{unit}</div>}
      </div>
    );

    if (story) {
      body = (
        <>
          <div style={{ position: "absolute", left: 0, top: 820, display: "flex" }}>
            <Img art={scene} />
          </div>
          <div style={{ position: "absolute", left: 0, top: 1576, width: 1080, height: 344, background: C.deep }} />
          <div style={{ position: "absolute", left: 80, top: 260, width: 920, display: "flex", flexDirection: "column", gap: 28 }}>
            {header}
            <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 16, flexWrap: "wrap" }}>
                <div style={{ fontSize: 48, fontWeight: 700 }}>{person.name}</div>
                {flag && <Img art={flag} />}
                {rankPill}
              </div>
              <div style={{ fontSize: 72, fontWeight: 700, lineHeight: 1.08 }}>{head}</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                {label && <div style={{ fontSize: 36, fontWeight: 500, color: labelColor }}>{label}</div>}
                {bigNumber}
              </div>
            </div>
          </div>
        </>
      );
    } else {
      let middle: ReactNode;
      let footer: ReactNode;
      if (model.template === "victory") {
        middle = (
          <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
            <div style={{ fontSize: 44, fontWeight: 700, lineHeight: 1.1 }}>{head}</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              <div style={{ fontSize: 24, color: C.muted }}>{label}</div>
              {bigNumber}
            </div>
          </div>
        );
        footer = (
          <div style={{ display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap" }}>
            <div style={{ fontSize: 32, fontWeight: 700 }}>{person.name}</div>
            {flag && <Img art={flag} />}
            {rankPill}
          </div>
        );
      } else if (model.template === "challenge") {
        const bigFlag = person.countryCode ? await art(await flagPixels(person.countryCode), 12, 8, 4) : null;
        middle = (
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap" }}>
              <div style={{ fontSize: fit(person.name, 44, 330), fontWeight: 700, lineHeight: 1.1 }}>{person.name}</div>
              {bigFlag && <Img art={bigFlag} />}
            </div>
            <div style={{ fontSize: 44, fontWeight: 700, lineHeight: 1.1 }}>{head}</div>
          </div>
        );
        footer = (
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <div style={{ fontSize: 28, fontWeight: 500, color: labelColor }}>{label}</div>
            {bigNumber}
          </div>
        );
      } else {
        const by = model.template === "dethroned" ? model.by : null;
        const byFlag = by?.countryCode ? await art(await flagPixels(by.countryCode), 12, 8, 2) : null;
        middle = (
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <div style={{ fontSize: 44, fontWeight: 700, lineHeight: 1.1 }}>{head}</div>
            {bigNumber}
          </div>
        );
        footer = (
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
              <div style={{ fontSize: 32, fontWeight: 700 }}>{person.name}</div>
              {flag && <Img art={flag} />}
            </div>
            {by && (
              <div style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 22, color: C.muted }}>
                <div>{t("dthBy")}</div>
                <div style={{ fontWeight: 700, color: C.text }}>{by.name}</div>
                {byFlag && <Img art={byFlag} />}
              </div>
            )}
          </div>
        );
      }
      body = (
        <div style={{ display: "flex", width: 1200, height: 630 }}>
          <Img art={scene} />
          <div style={{ flex: 1, padding: "56px 56px 52px 44px", display: "flex", flexDirection: "column", justifyContent: "space-between" }}>
            {header}
            {middle}
            {footer}
          </div>
        </div>
      );
    }
  }

  const { width, height } = CARD_SIZES[size];
  const isStoryAchievement = story && (model.template === "achievement" || model.template === "rank");
  return new ImageResponse(
    (
      <div style={{ width, height, display: "flex", position: "relative", background: C.ink, color: C.text, fontFamily: "Manrope" }}>
        {isStoryAchievement && <div style={{ position: "absolute", left: 80, top: 260, width: 920, display: "flex", flexDirection: "column" }}>{header}</div>}
        {body}
      </div>
    ),
    { width, height, fonts: await cardFonts() },
  );
}
