"use client";

import { useTranslations } from "next-intl";
import { playerName } from "@/lib/game/former";

/** Shows a player's public name; a deleted player reads as "Former king". */
export function usePlayerName(): (name: string) => string {
  const t = useTranslations("common");
  return (name) => playerName(name, t("formerKing"));
}

export function PlayerName({ name }: { name: string }) {
  return usePlayerName()(name);
}
