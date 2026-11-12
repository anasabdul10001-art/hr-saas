import { defineConfig } from "vitest/config";

export default defineConfig({
  // the tests sign up many companies from one address, so the auth rate limits are raised here (one test lowers them again)
  test: {
    include: ["tests/**/*.test.ts"], fileParallelism: false, testTimeout: 30000, hookTimeout: 30000,
    env: { AUTH_LOGIN_RATE_LIMIT: "1000", AUTH_SIGNUP_RATE_LIMIT: "1000", AUTH_FORGOT_RATE_LIMIT: "1000", AUTH_RESET_RATE_LIMIT: "1000", AUTH_REFRESH_RATE_LIMIT: "1000", ACCOUNTING_LINK_RATE_LIMIT: "1000", ACCOUNTING_LINK_ENCRYPTION_KEY: "test-accounting-link-key-123456", DALILACOM_API_URL: "https://dalilacom.test" },
  },
});
