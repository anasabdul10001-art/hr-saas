import "dotenv/config";

function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required env var: ${name}`);
  return value;
}

export const env = {
  port: Number(process.env.PORT ?? 4000),
  databaseUrl: required("DATABASE_URL"),
  jwtAccessSecret: required("JWT_ACCESS_SECRET"),
  jwtRefreshSecret: required("JWT_REFRESH_SECRET"),
  jwtAccessExpiresIn: process.env.JWT_ACCESS_EXPIRES_IN ?? "15m",
  jwtRefreshExpiresIn: process.env.JWT_REFRESH_EXPIRES_IN ?? "30d",
  corsOrigin: process.env.CORS_ORIGIN ?? "http://localhost:5173",
  frontendUrl: process.env.FRONTEND_URL ?? "http://localhost:5173",
  stripeWebhookSecret: process.env.STRIPE_WEBHOOK_SECRET,
  // Optional - avatar uploads fall back to local disk storage (fine for local dev, but Render's
  // free-tier filesystem is wiped on every redeploy) when these aren't all set. See
  // src/lib/cloudinary.ts.
  cloudinaryCloudName: process.env.CLOUDINARY_CLOUD_NAME,
  cloudinaryApiKey: process.env.CLOUDINARY_API_KEY,
  cloudinaryApiSecret: process.env.CLOUDINARY_API_SECRET,
};
