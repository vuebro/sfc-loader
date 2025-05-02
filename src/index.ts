import type {
  SFCDescriptor,
  SFCStyleBlock,
  SFCTemplateCompileOptions,
} from "@vue/compiler-sfc";

import {
  compileScript,
  compileStyleAsync,
  compileTemplate,
  parse,
} from "@vue/compiler-sfc";
import { useStyleTag } from "@vueuse/core";
import hash from "hash-sum";

const addStyle = async (
  id: string,
  { filename }: SFCDescriptor,
  { content, scoped = false, src }: SFCStyleBlock,
) => {
  const { code, errors } = await compileStyleAsync({
    filename,
    id,
    isProd: true,
    scoped,
    source: src ? await (await fetch(src)).text() : content,
  });
  errors.forEach((error) => {
    console.error(error);
  });
  useStyleTag(code, { ...(id && { id }) });
};
const loadModule = async (filename: string) => {
  const module: Record<string, object | string> = {};
  const { descriptor } = parse(await (await fetch(filename)).text(), {
    filename,
    sourceMap: false,
  });
  const id = `data-v-${hash(filename)}`;
  const scoped = descriptor.styles.some(({ scoped }) => scoped);
  if (scoped) module.__scopeId = id;
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
    const { bindings, content } = compileScript(descriptor, {
      // babelParserPlugins: ["jsx", "typescript"],
      id,
      inlineTemplate: false,
      isProd: true,
      ...(templateOptions && { templateOptions }),
    });
    if (templateOptions?.compilerOptions && bindings)
      templateOptions.compilerOptions.bindingMetadata = bindings;
    Object.assign(
      module,
      (
        (await import(
          `data:text/javascript;base64,${btoa(
            Array.from(new TextEncoder().encode(content), (byte) =>
              String.fromCodePoint(byte),
            ).join(""),
          )}`
        )) as Record<string, object>
      ).default,
    );
  }
  if (templateOptions) {
    const { code, errors, tips } = compileTemplate(templateOptions);
    errors.forEach((error) => {
      console.error(error);
    });
    tips.forEach((tip) => {
      console.warn(tip);
    });
    Object.assign(
      module,
      (await import(
        `data:text/javascript;base64,${btoa(
          Array.from(new TextEncoder().encode(code), (byte) =>
            String.fromCodePoint(byte),
          ).join(""),
        )}`
      )) as object,
    );
  }
  descriptor.styles.forEach((style) => {
    void addStyle(id, descriptor, style);
  });
  return module;
};
export default loadModule;
