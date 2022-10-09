import { CodegenConfig } from "@graphql-codegen/cli";
import { config as loadDotenv } from "dotenv";

loadDotenv({
  path: ".dev.vars",
});

const config: CodegenConfig = {
  schema: [
    {
      "https://api.github.com/graphql": {
        headers: {
          Authorization: `Bearer ${process.env.GH_BOT_TOKEN}`,
        },
      },
    },
  ],
  documents: "src/**/*.ts",
  generates: {
    "src/types.ts": {
      config: {
        scalars: {
          URI: "string",
        },
      },
      plugins: ["typescript", "typescript-operations"],
    },
  },
};

export default config;
