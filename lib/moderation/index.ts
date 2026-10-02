import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { serverEnv } from "@/lib/env.server";
import { type Classifier, ModerationUnavailable, anthropicClassifier, testClassifier } from "./classifier";
import type { ModeratedField, ModerationSubmission } from "./model";
import type { ModerationReason } from "./reasons";
import { linkProblem, messageProblem, nameProblem } from "./rules";
import { isDeployed } from "@/lib/config/deployment";

/**
 * Moderation before any lock or charge (SPEC §7): the fixed link and message rules first, then
 * the model. A rejection returns before a lock exists, so rejected content is never charged. With
 * no verdict ("unavailable"), a takeover goes ahead with its message and link quarantined until a
 * retry settles them (decision 31); a profile edit is refused.
 */
export type ModerationInput = ModerationSubmission;
export type { ModerationReason } from "./reasons";

export type ModerationVerdict =
  | { verdict: "allow" }
  | { verdict: "reject"; field: ModeratedField; reason: ModerationReason }
  | { verdict: "unavailable" };

let classifier: Classifier | null = null;

function configuredClassifier(): Classifier {
  if (classifier) return classifier;
  const env = serverEnv();
  if (env.MODERATION_PROVIDER === "test") {
    if (isDeployed()) throw new Error("The test moderation provider only runs locally");
    classifier = testClassifier;
  } else {
    classifier = env.ANTHROPIC_API_KEY
      ? anthropicClassifier(new Anthropic({ apiKey: env.ANTHROPIC_API_KEY, maxRetries: 1, timeout: 10_000 }))
      : async () => {
          throw new ModerationUnavailable("ANTHROPIC_API_KEY is not set");
        };
  }
  return classifier;
}

/** The rules alone: no model call. */
export function ruleVerdict(input: ModerationInput): ModerationVerdict {
  const name = nameProblem(input.name);
  if (name) return { verdict: "reject", field: "name", reason: name };
  const link = input.link ? linkProblem(input.link) : null;
  if (link) return { verdict: "reject", field: "link", reason: link };
  const message = input.message ? messageProblem(input.message) : null;
  if (message) return { verdict: "reject", field: "message", reason: message };
  return { verdict: "allow" };
}

/** Tries per check: the SDK already retries transport errors; this also covers unusable answers. */
const MODEL_ATTEMPTS = 2;

/**
 * The rules, then the model. Callers must pass the human check and the rate limits first, so the
 * model can never be called in bulk.
 */
export async function moderate(
  input: ModerationInput,
  { classify, retry = false }: { classify?: Classifier; retry?: boolean } = {},
): Promise<ModerationVerdict> {
  const rules = ruleVerdict(input);
  if (rules.verdict !== "allow") return rules;
  const model = classify ?? configuredClassifier();
  for (let attempt = 1; attempt <= MODEL_ATTEMPTS; attempt++) {
    try {
      const verdict = await model(input, { retry });
      return verdict.verdict === "allow" ? { verdict: "allow" } : { verdict: "reject", field: verdict.field!, reason: verdict.reason! };
    } catch (error) {
      if (!(error instanceof ModerationUnavailable)) throw error;
      console.error(`moderation unavailable (attempt ${attempt}):`, error.message);
    }
  }
  return { verdict: "unavailable" };
}
