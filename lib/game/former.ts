/** Deleted profiles keep their reigns under a reserved name (migration 0017) nobody can type. */
export function isFormerName(name: string): boolean {
  return name.startsWith("former~");
}

/** The name to show: a deleted player reads as "Former king" in the reader's language. */
export function playerName(name: string, formerLabel: string): string {
  return isFormerName(name) ? formerLabel : name;
}

/** A player's profile page; deleted players have none. */
export function profileHref(name: string): string | undefined {
  return isFormerName(name) ? undefined : `/u/${name.toLowerCase()}`;
}
