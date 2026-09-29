import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { MODERATION_MODEL, MODERATION_SYSTEM, type ModelVerdict, type ModerationSubmission, submissionText, verdictSchema } from "./model";

export type Classifier = (input: ModerationSubmission) => Promise<ModelVerdict>;

/** The model is unreachable or answered something unusable: moderation fails closed. */
export class ModerationUnavailable extends Error {}

/** claude-haiku-4-5 with a structured JSON verdict, validated again with zod. */
export function anthropicClassifier(client: Pick<Anthropic, "messages">): Classifier {
  return async (input) => {
    let response;
    try {
      response = await client.messages.parse({
        model: MODERATION_MODEL,
        max_tokens: 256,
        temperature: 0,
        system: MODERATION_SYSTEM,
        messages: [{ role: "user", content: submissionText(input) }],
        output_config: { format: zodOutputFormat(verdictSchema) },
      });
    } catch (error) {
      if (error instanceof Anthropic.APIError) throw new ModerationUnavailable(`moderation API error ${error.status}`);
      throw new ModerationUnavailable(error instanceof Error ? error.message : "moderation failed");
    }
    // A refusal or a cut-off answer is not a verdict.
    if (response.stop_reason !== "end_turn") throw new ModerationUnavailable(`moderation stopped: ${response.stop_reason}`);
    const parsed = verdictSchema.safeParse(response.parsed_output);
    if (!parsed.success) throw new ModerationUnavailable("moderation answered outside the schema");
    return parsed.data;
  };
}

/**
 * Local and e2e stand-in, never used in production: rejects a field containing
 * "[moderation:<reason>]" and allows everything else, so tests can reach every rejection state.
 */
export const testClassifier: Classifier = async (input) => {
  for (const field of ["name", "message", "link"] as const) {
    const match = /\[moderation:([a-z_]+)\]/.exec(input[field] ?? "");
    if (match) {
      const parsed = verdictSchema.safeParse({ verdict: "reject", field, reason: match[1] });
      if (parsed.success) return parsed.data;
    }
  }
  return { verdict: "allow", field: null, reason: null };
};
