function getRequiredEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    console.error(
      `Error: Missing required environment variable: ${name}\n` +
        "  MESSAGEBIRD_API_KEY is required.\n" +
        "  Get your API key at: https://dashboard.messagebird.com → Developers → API access"
    );
    process.exit(1);
  }
  return value;
}

export const API_KEY = getRequiredEnv("MESSAGEBIRD_API_KEY");

export const CONVERSATIONS_BASE_URL = "https://conversations.messagebird.com/v1";
export const INTEGRATIONS_BASE_URL = "https://integrations.messagebird.com";
export const REST_BASE_URL = "https://rest.messagebird.com";
