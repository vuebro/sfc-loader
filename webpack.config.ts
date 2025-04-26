import NodePolyfillPlugin from "node-polyfill-webpack-plugin";
import { fileURLToPath } from 'url';
import { join } from 'path';

const dirname = fileURLToPath(new URL('.', import.meta.url));

export default {
  entry: [join(dirname, "src/index.ts")],
  experiments: { outputModule: true },
  externals: ["@vue/compiler-sfc", "@vue/shared"],
  mode: "production",
  module: {
    rules: [
      {
        test: /\.ts$/,
        use: { loader: "ts-loader" },
      },
    ],
  },
  output: {
    clean: true,
    filename: "index.js",
    libraryTarget: "module",
    path: join(dirname, "dist"),
  },
  plugins: [new NodePolyfillPlugin({ additionalAliases: ["process"] })],
  resolve: {
    conditionNames: ["require", "node"],
    extensions: [".ts", ".js"],
  },
};
