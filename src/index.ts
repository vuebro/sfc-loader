import type {
  CompilerError,
  CompilerOptions,
  SFCDescriptor,
  SFCScriptBlock,
  SFCStyleBlock,
} from "@vue/compiler-sfc";
import type { Transform } from "sucrase";

import {
  compileScript,
  compileStyleAsync,
  compileTemplate,
  parse,
} from "@vue/compiler-sfc";
import { useStyleTag } from "@vueuse/core";
import hash from "hash-sum";
import { transform } from "sucrase";

const log = (msgs: (CompilerError | Error | string)[]) => {
  msgs.forEach((msg) => {
    console.log(msg);
  });
};
const addStyle = async (
    id: string,
    { filename }: SFCDescriptor,
    { content, module, scoped = false, src }: SFCStyleBlock,
  ) => {
    const { code, errors } = await compileStyleAsync({
      filename,
      id,
      modules: !!module,
      scoped,
      source: src ? await (await fetch(src)).text() : content,
    });
    log(errors);
    useStyleTag(code, scoped ? { id } : undefined);
  },
  inject = (code: string) =>
    import(
      `data:text/javascript;base64,${btoa(Array.from(new TextEncoder().encode(code), (byte) => String.fromCodePoint(byte)).join(""))}`
    ),
  loadModule = async (filename: string) => {
    const { descriptor, errors } = parse(await (await fetch(filename)).text(), {
      filename,
    });
    const compilerOptions: CompilerOptions = { expressionPlugins: [] },
      scriptBlocks = ["script", "scriptSetup"],
      contents = await Promise.all(
        scriptBlocks.map(async (key) => {
          const { lang = "js", src } = (descriptor[
            key as keyof SFCDescriptor
          ] ?? {}) as SFCScriptBlock;
          if (/[jt]sx$/.test(lang))
            compilerOptions.expressionPlugins?.push("jsx");
          if (/tsx?$/.test(lang))
            compilerOptions.expressionPlugins?.push("typescript");
          return src && (await (await fetch(src)).text());
        }),
      ),
      id = `data-v-${hash(filename)}`,
      jsxRuntime = "preserve",
      module: Record<string, object | string> = {},
      scoped = descriptor.styles.some(({ scoped }) => scoped),
      { expressionPlugins: transforms } = compilerOptions as {
        expressionPlugins: Transform[];
      };
    log(errors);
    if (scoped) module.__scopeId = id;
    if (descriptor.script || descriptor.scriptSetup) {
      scriptBlocks.forEach((key, i) => {
        const scriptBlock = descriptor[key as keyof SFCDescriptor] as
          | SFCScriptBlock
          | undefined;
        if (scriptBlock && contents[i] !== undefined)
          scriptBlock.content = contents[i];
      });
      const {
        bindings,
        content,
        warnings = [],
      } = compileScript(descriptor, { id, inlineTemplate: false });
      log(warnings);
      if (bindings) compilerOptions.bindingMetadata = bindings;
      Object.assign(
        module,
        (
          (await inject(
            transforms.length
              ? transform(content, { jsxRuntime, transforms }).code
              : content,
          )) as Record<string, object>
        ).default,
      );
    }
    if (descriptor.template) {
      const { code, errors, tips } = compileTemplate({
        ast: descriptor.template.ast,
        compilerOptions,
        filename: descriptor.filename,
        id,
        scoped,
        slotted: descriptor.slotted,
        source: descriptor.template.src
          ? await (await fetch(descriptor.template.src)).text()
          : descriptor.template.content,
        // @ts-expect-error TODO remove expect-error after 3.6
        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
        vapor: descriptor.vapor,
      });
      log(errors);
      log(tips);
      Object.assign(
        module,
        await inject(
          transforms.length
            ? transform(code, { jsxRuntime, transforms }).code
            : code,
        ),
      );
    }
    descriptor.styles.forEach((style) => {
      void addStyle(id, descriptor, style);
    });
    return module;
  };
export default loadModule;
