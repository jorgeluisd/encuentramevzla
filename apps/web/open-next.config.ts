import type { OpenNextConfig } from "@opennextjs/aws/types/open-next.js";

// Defaults de OpenNext: wrapper aws-lambda + converter aws-apigw-v2 (API Gateway HTTP o Function URL).
const config = {
  default: {},
} satisfies OpenNextConfig;

export default config;
