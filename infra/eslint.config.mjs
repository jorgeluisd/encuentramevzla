import { base } from "@evzla/config/eslint";

export default [
  ...base,
  {
    ignores: ["cdk.out/**", "test/fixtures/**"],
  },
];
