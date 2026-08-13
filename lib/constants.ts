import { generateDummyPassword } from "./db/utils";

export const isProductionEnvironment = process.env.NODE_ENV === "production";
export const isDevelopmentEnvironment = process.env.NODE_ENV === "development";
export const isTestEnvironment = Boolean(
  process.env.PLAYWRIGHT_TEST_BASE_URL ||
    process.env.PLAYWRIGHT ||
    process.env.CI_PLAYWRIGHT
);

export const guestRegex = /^guest-\d+$/;

export const DUMMY_PASSWORD = generateDummyPassword();

export const suggestions = [
  "Qualify this lead: B2B SaaS startup, 80 employees, $3M ARR, needs CRM",
  "Write a cold outreach email to a VP of Sales at a mid-market company",
  "Summarize my meeting notes and extract all action items",
  "Research the AI-powered customer support market — key players and gaps",
  "Write a proposal for a 3-month digital transformation consulting project",
];
