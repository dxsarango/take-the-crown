import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { serverEnv } from "@/lib/env.server";
import { type Classifier, ModerationUnavailable, anthropicClassifier, testClassifier } from "./classifier";
import type { ModeratedField, ModerationSubmission } from "./model";
import type { ModerationReason } from "./reasons";
import { linkProblem, messageProblem } from "./rules";

/**
 * Moderation before any lock or charge (SPEC §7): the fixed link and message rules first, then
 * the model. A rejection returns before a lock exists, so rejected content is never charged. If
 * the model cannot give a verdict, moderation fails closed ("unavailable").
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
    if (process.env.VERCEL_ENV === "production") throw new Error("The test moderation provider is disabled in production");
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
  const link = input.link ? linkProblem(input.link) : null;
  if (link) return { verdict: "reject", field: "link", reason: link };
  const message = input.message ? messageProblem(input.message) : null;
  if (message) return { verdict: "reject", field: "message", reason: message };
  return { verdict: "allow" };
}

export async function moderate(input: ModerationInput, classify: Classifier = configuredClassifier()): Promise<ModerationVerdict> {
  const rules = ruleVerdict(input);
  if (rules.verdict !== "allow") return rules;
  try {
    const model = await classify(input);
    return model.verdict === "allow" ? { verdict: "allow" } : { verdict: "reject", field: model.field!, reason: model.reason! };
  } catch (error) {
    if (!(error instanceof ModerationUnavailable)) throw error;
    console.error("moderation unavailable:", error.message);
    return { verdict: "unavailable" };
  }
}
