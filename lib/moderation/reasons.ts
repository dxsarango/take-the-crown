import type { ModelReason } from "./model";
import type { RuleReason } from "./rules";

/** Why moderation rejected a field, shared with client code (no server imports). */
export type ModerationReason = RuleReason | ModelReason;
