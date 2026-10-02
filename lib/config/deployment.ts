/**
 * Any Vercel deployment, production or preview. The test stand-ins for payments, email and
 * moderation run only locally: on a deployment the test payment provider would hand out free crowns.
 */
export function isDeployed(): boolean {
  return process.env.VERCEL_ENV === "production" || process.env.VERCEL_ENV === "preview";
}
