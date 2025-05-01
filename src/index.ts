import type { PluginObj } from "@babel/core";
import type { ParserPlugin } from "@babel/parser";
import type { NodePath } from "@babel/traverse";
import type {
  CallExpression,
  ExportAllDeclaration,
  ImportDeclaration,
  V8IntrinsicIdentifier,
} from "@babel/types";
import type { SFCTemplateCompileOptions } from "@vue/compiler-sfc";

import { transformFromAstAsync } from "@babel/core";
import babelPluginTransformModulesCommonjs from "@babel/plugin-transform-modules-commonjs";
import typescript from "@babel/plugin-transform-typescript";
import traverse from "@babel/traverse";
import { isStringLiteral } from "@babel/types";
import jsx from "@vue/babel-plugin-jsx";
import {
  babelParse,
  compileScript,
  compileStyleAsync,
  compileTemplate,
  parse,
} from "@vue/compiler-sfc";
import { useStyleTag } from "@vueuse/core";
import hash from "hash-sum";

const moduleCache: Record<string, Record<string, object | string>> = {};
const transformJSCode = async (
  source: string,
  sourceFilename: string,
  additionalBabelParserPlugins?: ParserPlugin[],
  additionalBabelPlugins?: Record<string, PluginObj>,
) => {
  const ast = babelParse(source, {
    plugins: additionalBabelParserPlugins ?? [],
    sourceFilename,
    sourceType: "module",
  });
  const depsList: string[] = [];
  traverse(ast, {
    CallExpression(path: NodePath<CallExpression>) {
      if (
        (path.node.callee as V8IntrinsicIdentifier).name === "require" &&
        path.node.arguments.length === 1 &&
        isStringLiteral(path.node.arguments[0])
      )
        depsList.push(path.node.arguments[0].value);
    },
    ExportAllDeclaration(path: NodePath<ExportAllDeclaration>) {
      depsList.push(path.node.source.value);
    },
    ImportDeclaration(path: NodePath<ImportDeclaration>) {
      depsList.push(path.node.source.value);
    },
  });
  Object.defineProperties(
    moduleCache,
    Object.fromEntries(
      await Promise.all(
        depsList
          .filter((relPath) => !Object.hasOwn(moduleCache, relPath))
          .map(async (relPath) => [
            relPath,
            { value: (await import(relPath)) as object },
          ]),
      ),
    ) as PropertyDescriptorMap,
  );
  const { code } =
    (await transformFromAstAsync(ast, source, {
      plugins: [
        babelPluginTransformModulesCommonjs,
        ...(additionalBabelPlugins !== undefined
          ? Object.values(additionalBabelPlugins)
          : []),
      ],
      sourceType: "module",
    })) ?? {};
  if (!code) throw new Error(`unable to transform script "${sourceFilename}"`);
  return code;
};
const loadModule = async (filename: string) => {
  if (!Object.hasOwn(moduleCache, filename)) {
    moduleCache[filename] = {};
    const { descriptor } = parse(await (await fetch(filename)).text(), {
      filename,
      sourceMap: false,
    });
    const id = `data-v-${hash(filename)}`;
    const scoped = descriptor.styles.some(({ scoped }) => scoped);
    if (scoped) moduleCache[filename].__scopeId = id;
    const templateOptions: SFCTemplateCompileOptions | undefined =
      descriptor.template
        ? {
            compilerOptions: {
              mode: "module",
              scopeId: scoped ? id : null,
            },
            filename: descriptor.filename,
            id,
            isProd: true,
            scoped,
            slotted: descriptor.slotted,
            source: descriptor.template.src
              ? await (await fetch(descriptor.template.src)).text()
              : descriptor.template.content,
          }
        : undefined;
    if (descriptor.script || descriptor.scriptSetup) {
      if (descriptor.script?.src)
        descriptor.script.content = await (
          await fetch(descriptor.script.src)
        ).text();
      const babelParserPlugins: ParserPlugin[] = [
        "jsx",
        ...(([descriptor.script?.lang, descriptor.scriptSetup?.lang].includes(
          "ts",
        )
          ? ["typescript"]
          : []) as ParserPlugin[]),
      ];
      const { bindings, content } = compileScript(descriptor, {
        babelParserPlugins,
        id,
        inlineTemplate: false,
        isProd: true,
        ...(templateOptions && { templateOptions }),
      });
      if (templateOptions?.compilerOptions && bindings)
        templateOptions.compilerOptions.bindingMetadata = bindings;
      const exports: Record<string, object> = {};
      // eslint-disable-next-line @typescript-eslint/no-implied-eval, @typescript-eslint/no-unsafe-call
      Function(
        "exports",
        "require",
        await transformJSCode(content, filename, babelParserPlugins, {
          jsx: jsx as unknown as PluginObj,
          ...([descriptor.script?.lang, descriptor.scriptSetup?.lang].includes(
            "ts",
          )
            ? { typescript: typescript as PluginObj }
            : {}),
        }),
      )(exports, (relPath: string) => moduleCache[relPath]);
      Object.assign(moduleCache[filename], exports.default);
    }
    if (templateOptions) {
      const { code, errors, tips } = compileTemplate(templateOptions);
      errors.forEach((error) => {
        console.error(error);
      });
      tips.forEach((tip) => {
        console.warn(tip);
      });
      const exports = {};
      // eslint-disable-next-line @typescript-eslint/no-implied-eval, @typescript-eslint/no-unsafe-call
      Function(
        "exports",
        "require",
        await transformJSCode(code, descriptor.filename),
      )(exports, (relPath: string) => moduleCache[relPath]);
      Object.assign(moduleCache[filename], exports);
    }
    descriptor.styles.forEach(({ content, scoped = false, src }) => {
      void (async () => {
        const { code, errors } = await compileStyleAsync({
          filename: descriptor.filename,
          id,
          isProd: true,
          scoped,
          source: src ? await (await fetch(src)).text() : content,
        });
        errors.forEach((error) => {
          console.error(error);
        });
        useStyleTag(code, { ...(id && { id }) });
      })();
    });
  }
  if (!moduleCache[filename])
    throw new Error(`unable to load module "${filename}"`);
  return moduleCache[filename];
};
export default loadModule;
