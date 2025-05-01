import eslint from "@eslint/js";
import { flatConfigs } from "eslint-plugin-import-x";
import perfectionist from "eslint-plugin-perfectionist";
import eslintPluginPrettierRecommended from "eslint-plugin-prettier/recommended";
import tseslint, { configs } from "typescript-eslint";
export default tseslint.config(
  { ignores: ["**/dist"] },
  {
    rules: {
      "@typescript-eslint/no-use-before-define": ["error", "nofunc"],
      "import-x/no-extraneous-dependencies": [
        "error",
        {
          devDependencies: ["**/eslint.config.ts"],
          optionalDependencies: false,
        },
      ],
      "no-use-before-define": "off",
    },
  },
  {
    languageOptions: {
      parserOptions: {
        projectService: { allowDefaultProject: ["eslint.config.ts"] },
        tsconfigRootDir: import.meta.dirname,
      },
    },
  },
  eslint.configs.recommended,
  flatConfigs.recommended,
  flatConfigs.typescript,
  configs.strictTypeChecked,
  configs.stylisticTypeChecked,
  perfectionist.configs["recommended-natural"],
  eslintPluginPrettierRecommended,
);
