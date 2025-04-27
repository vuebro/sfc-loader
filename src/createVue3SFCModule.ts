import type { ParserPlugin } from '@babel/parser';

import {
	parse as sfc_parse,
	compileStyleAsync as sfc_compileStyleAsync,
	compileScript as sfc_compileScript,
	compileTemplate as sfc_compileTemplate,
	SFCTemplateCompileOptions,
} from '@vue/compiler-sfc'

import * as vue_CompilerDOM from '@vue/compiler-dom'

// @ts-ignore (TS7016: Could not find a declaration file for module '@babel/plugin-transform-typescript'.)
import typescript from '@babel/plugin-transform-typescript'

import {
	formatErrorLineColumn,
	formatError,
	hash,
	interopRequireDefault,
	transformJSCode,
	loadDeps,
	createCJSModule,
	getResource,
	log,
} from './tools'

import {
	Options,
	ModuleExport,
	AbstractPath
} from './types'


/**
 * @internal
 */

export async function createSFCModule(source : string, filename : AbstractPath, options : Options) : Promise<ModuleExport> {

	const strFilename = filename.toString();

	const component : { [key: string]: any } = {};

	const {
		addStyle,
	} = options;

	// vue-loader next: https://github.com/vuejs/vue-loader/blob/next/src/index.ts#L91
	const { descriptor, errors } = sfc_parse(source, {
		filename: strFilename,
		sourceMap: false,
	});


	const scopeId = `data-v-${hash(strFilename)}`;

	const hasScoped = descriptor.styles.some(e => e.scoped);

	if ( hasScoped ) {

		// see https://github.com/vuejs/vue-next/blob/4549e65baea54bfd10116241a6a5eba91ec3f632/packages/runtime-core/src/component.ts#L87
		// vue-loader: https://github.com/vuejs/vue-loader/blob/65c91108e5ace3a8c00c569f08e9a847be5754f6/src/index.ts#L223
		component.__scopeId = scopeId;
	}

	const compileTemplateOptions : SFCTemplateCompileOptions|undefined = descriptor.template ? {
		// hack, since sourceMap is not configurable an we want to get rid of source-map dependency. see genSourcemap
		compiler: { ...vue_CompilerDOM, compile: (template, opts) => vue_CompilerDOM.compile(template, { ...opts, sourceMap: false }) },
		source: descriptor.template.src ? (await (await getResource({ refPath: filename, relPath: descriptor.template.src }, options).getContent()).getContentData(false)) as string : descriptor.template.content,
		filename: descriptor.filename,
		isProd: true,
		scoped: hasScoped,
		id: scopeId,
		slotted: descriptor.slotted,
		compilerOptions: {
			scopeId: hasScoped ? scopeId : undefined,
			mode: 'module', // see: https://github.com/vuejs/vue-next/blob/15baaf14f025f6b1d46174c9713a2ec517741d0d/packages/compiler-core/src/options.ts#L160
		},
		//	transformAssetUrls
	} : undefined;

	if ( descriptor.script || descriptor.scriptSetup ) {

		// eg: https://github.com/vuejs/vue-loader/blob/6ed553f70b163031457acc961901313390cde9ef/src/index.ts#L136

		// doc: <script setup> cannot be used with the src attribute.
		// TBD: check if this is the right solution
		if ( descriptor.script?.src )
			descriptor.script.content = (await (await getResource({ refPath: filename, relPath: descriptor.script.src }, options).getContent()).getContentData(false)) as string;

		// TBD: handle <script setup src="...

			const babelParserPlugins : ParserPlugin[] = [descriptor.script?.lang, descriptor.scriptSetup?.lang].includes("ts") ? ['typescript'] : [];
			const babelPlugins: Record<string, any> = [descriptor.script?.lang, descriptor.scriptSetup?.lang].includes("ts") ? { typescript } : {};
			
			// src: https://github.com/vuejs/vue-next/blob/15baaf14f025f6b1d46174c9713a2ec517741d0d/packages/compiler-sfc/src/compileScript.ts#L43
			const scriptBlock = sfc_compileScript(descriptor, {
				isProd: true,
				sourceMap: false,
				id: scopeId,
				babelParserPlugins,
				// doc: https://github.com/vuejs/rfcs/blob/script-setup-2/active-rfcs/0000-script-setup.md#inline-template-mode
				// vue-loader next : https://github.com/vuejs/vue-loader/blob/12aaf2ea77add8654c50c8751bad135f1881e53f/src/resolveScript.ts#L59
				inlineTemplate: false,
				templateOptions: compileTemplateOptions,
			});

			// note:
			//   scriptBlock.content is the script code after vue transformations
			//   scriptBlock.scriptAst is the script AST before vue transformations
			const [bindingMetadata, depsList, transformedScriptSource] =
			[scriptBlock.bindings, ...await transformJSCode(scriptBlock.content, true, strFilename, babelParserPlugins, babelPlugins)];


		// see https://github.com/vuejs/vue-loader/blob/12aaf2ea77add8654c50c8751bad135f1881e53f/src/templateLoader.ts#L54
		if ( compileTemplateOptions?.compilerOptions !== undefined )
			compileTemplateOptions.compilerOptions.bindingMetadata = bindingMetadata;

		await loadDeps(filename, depsList, options);
		Object.assign(component, interopRequireDefault(createCJSModule(filename, transformedScriptSource, options).exports).default);
	}


	if ( descriptor.template !== null ) {
		// compiler-sfc src: https://github.com/vuejs/vue-next/blob/15baaf14f025f6b1d46174c9713a2ec517741d0d/packages/compiler-sfc/src/compileTemplate.ts#L39
		// compileTemplate eg: https://github.com/vuejs/vue-loader/blob/next/src/templateLoader.ts#L33
		

			const template = sfc_compileTemplate(compileTemplateOptions);

			if ( template.errors.length ) {

				for ( const err of template.errors ) {
					if (typeof err === 'object') {
						if (err.loc) {
							log?.('error', 'SFC template', formatErrorLineColumn(err.message, strFilename, source, err.loc.start.line + descriptor.template.loc.start.line - 1, err.loc.start.column) );
						} else {
							log?.('error', 'SFC template', formatError(err.message, strFilename, source) );
						}
					} else {
						log?.('error', 'SFC template', formatError(err, strFilename, source) );
					}
				}
			}

			for ( const err of template.tips )
				log?.('info', 'SFC template', err);

			const [templateDepsList, templateTransformedSource] =
			await transformJSCode(template.code, true, descriptor.filename);

		await loadDeps(filename, templateDepsList, options);
		Object.assign(component, createCJSModule(filename, templateTransformedSource, options).exports);
	}


	for ( const descStyle of descriptor.styles ) {

		const srcRaw = descStyle.src ? (await (await getResource({ refPath: filename, relPath: descStyle.src }, options).getContent()).getContentData(false)) as string : descStyle.content;
		

			const src = srcRaw;

			// src: https://github.com/vuejs/vue-next/blob/15baaf14f025f6b1d46174c9713a2ec517741d0d/packages/compiler-sfc/src/compileStyle.ts#L70
			const compiledStyle = await sfc_compileStyleAsync({
				filename: descriptor.filename,
				source: src,
				isProd: true,
				id: scopeId,
				scoped: descStyle.scoped,
				trim: true,
			});

			if ( compiledStyle.errors.length ) {

				for ( const err of compiledStyle.errors ) {

					// @ts-ignore (Property 'line' does not exist on type 'Error' and Property 'column' does not exist on type 'Error')
					log?.('error', 'SFC style', formatErrorLineColumn(err.message, filename, source, err.line + descStyle.loc.start.line - 1, err.column) );
				}
			}

			const style =
			compiledStyle.code;

		addStyle(style, descStyle.scoped ? scopeId : undefined);
	}

	return component;
}
