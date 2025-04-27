import {
	posix as Path
} from 'path'

import traverse from '@babel/traverse';
import type { NodePath } from '@babel/traverse';
import * as t from '@babel/types';
import {
	transformFromAstAsync as babel_transformFromAstAsync,
} from '@babel/core';

import {
	parse as babel_parse,
} from '@babel/parser';


import {
	codeFrameColumns,
} from '@babel/code-frame';

// @ts-ignore (Could not find a declaration file for module '@babel/plugin-transform-modules-commonjs')
import babelPluginTransformModulesCommonjs from '@babel/plugin-transform-modules-commonjs'

import SparkMD5 from 'spark-md5'

import {
	Cache,
	Options,
	ValueFactory,
	ModuleExport,
	PathResolve,
	Module,
	LoadingType,
	Resource,
	PathContext,
	AbstractPath,
} from './types'

import { createSFCModule } from './createVue3SFCModule'


/**
 * Default getPathname implementation
 * remove search string
 */
const getPathname = (path : string) => {

	// alternative: new URL(path, 'file://').pathname
	const searchPos = path.indexOf('?');
	if ( searchPos !== -1 )
		return path.slice(0, searchPos);
	return path;
}


/**
 * Default resolve implementation
 * resolve() should handle 3 situations :
 *  - resolve a relative path ( eg. import './details.vue' )
 *  - resolve an absolute path ( eg. import '/components/card.vue' )
 *  - resolve a module name ( eg. import { format } from 'date-fns' )
 */
const pathResolve : PathResolve = ({ refPath, relPath } : PathContext, options : Options) => {

	// initial resolution: refPath is not defined
	if ( refPath === undefined )
		return relPath;

	const relPathStr = relPath.toString();
	
	// is non-relative path ?
	if ( relPathStr[0] !== '.' )
		return relPath;
		
	// note :
	//  normalize('./test') -> 'test'
	//  normalize('/test') -> '/test'

	return Path.normalize(Path.join(Path.dirname(getPathname(refPath.toString())), relPathStr));
}

/**
 * Default getResource implementation
 * by default, getContent() use the file extension as file type.
 */
export function getResource(pathCx : PathContext, options : Options) : Resource {

	const { getFile, log } = options;
	const path = pathResolve(pathCx, options);
	const pathStr = path.toString();
	return {
		id: pathStr,
		path: path,
		getContent: async () => {

			const res = await getFile(path);

			if ( typeof res === 'string' || res instanceof ArrayBuffer ) {

				return {
					type: Path.extname(getPathname(pathStr)),
					getContentData: async (asBinary) => {

						if ( res instanceof ArrayBuffer !== asBinary )
							log?.('warn', `unexpected data type. ${ asBinary ? 'binary' : 'string' } is expected for "${ path }"`);
						
						return res;
					},
				}
			}
			
			if ( !res ) {
				
				log?.('error', `There is no file avaialable such as "${ path }"`);
			}			

			return {
				type: res.type !== undefined ? res.type : Path.extname(getPathname(pathStr)),
				getContentData: res.getContentData,
			}
		}
	};
}


/**
 * @internal
 */
const genSourcemap : boolean = false;


// tools
/**
 * @internal
 */
export function formatError(message : string, path : string, source : string) : string {
	return path + '\n' + message;
}


/**
 * @internal
 */
export function formatErrorLineColumn(message : string, path : string, source : string, line? : number, column? : number) : string {
	if (!line) {
		return formatError(message, path, source)
	}

  const location = {
    start: { line, column },
  };

  return formatError(codeFrameColumns(source, location, { message }), path, source)
}

/**
 * @internal
 */
 export function hash(...valueList : any[]) : string {

	return valueList.reduce((hashInstance, val) => hashInstance.append(String(val)), new SparkMD5()).end();
}



/**
 * Simple cache helper
 * preventCache usage: non-fatal error
 * @internal
 */
export async function withCache( cacheInstance : Cache|undefined, key : any[], valueFactory : ValueFactory ) : Promise<any> {

	let cachePrevented = false;

	const api = {
		preventCache: () => cachePrevented = true,
	}

	if ( cacheInstance === undefined )
		return await valueFactory(api);

	const hashedKey = hash(...key);
	const valueStr = await cacheInstance.get(hashedKey);
	if ( valueStr !== undefined )
		return JSON.parse(valueStr);

	const value = await valueFactory(api);

	if ( cachePrevented === false )
		await cacheInstance.set(hashedKey, JSON.stringify(value));

	return value;
}

/**
 * @internal
 */
export class Loading {

	promise : Promise<ModuleExport>;

	constructor(promise : Promise<ModuleExport>) {

		this.promise = promise;
	}
}



/**
 * @internal
 */
export function interopRequireDefault(obj : any) : any {

  return obj && obj.__esModule ? obj : { default: obj };
}

// node types: https://babeljs.io/docs/en/babel-types
// handbook: https://github.com/jamiebuilds/babel-handbook/blob/master/translations/en/plugin-handbook.md

/**
 * import is a reserved keyword, then rename
 * @internal
 */
export function renameDynamicImport(fileAst : t.File) : void {

	traverse(fileAst, {
		CallExpression(path : NodePath<t.CallExpression>) {

			if ( t.isImport(path.node.callee) )
				path.replaceWith(t.callExpression(t.identifier('__vsfcl_import__'), path.node.arguments))
		}
	});
}


/**
 * @internal
 */
export function parseDeps(fileAst : t.File) : string[] {

	const requireList : string[] = [];

	traverse(fileAst, {
		ExportAllDeclaration(path: NodePath<t.ExportAllDeclaration>) {

			requireList.push(path.node.source.value);
		},		
		ImportDeclaration(path : NodePath<t.ImportDeclaration>) {

			requireList.push(path.node.source.value);
		},
		CallExpression(path : NodePath<t.CallExpression>) {

			if (
				   // @ts-ignore (Property 'name' does not exist on type 'ArrayExpression')
				   path.node.callee.name === 'require'
				&& path.node.arguments.length === 1
				&& t.isStringLiteral(path.node.arguments[0])
			) {

				requireList.push(path.node.arguments[0].value)
			}
		}
	});

	return requireList;
}


/**
 * @internal
 */
export async function transformJSCode(source : string, moduleSourceType : boolean, filename : AbstractPath, additionalBabelParserPlugins : Options['additionalBabelParserPlugins'], additionalBabelPlugins : Options['additionalBabelPlugins'], log : Options['log'], devMode : boolean = false) : Promise<[string[], string]> {

	let ast: t.File;
	try {

		ast = babel_parse(source, {
			// doc: https://babeljs.io/docs/en/babel-parser#options
			sourceType: moduleSourceType ? 'module' : 'script',
			sourceFilename: filename.toString(),
			plugins:  [
//				'optionalChaining',
//				'nullishCoalescingOperator',
				...additionalBabelParserPlugins !== undefined ? additionalBabelParserPlugins : [],
			],
		});
	} catch(ex) {

		log?.('error', 'parse script', formatErrorLineColumn(ex.message, filename.toString(), source, ex.loc.line, ex.loc.column + 1) );
		throw ex;
	}

	renameDynamicImport(ast);
	const depsList = parseDeps(ast);

	const transformedScript = await babel_transformFromAstAsync(ast, source, {
		sourceMaps: genSourcemap, // doc: https://babeljs.io/docs/en/options#sourcemaps
		plugins: [ // https://babeljs.io/docs/en/options#plugins
			...moduleSourceType ? [ babelPluginTransformModulesCommonjs ] : [], // https://babeljs.io/docs/en/babel-plugin-transform-modules-commonjs#options
			...additionalBabelPlugins !== undefined ? Object.values(additionalBabelPlugins) : [],
		],
		babelrc: false,
		configFile: false,
		highlightCode: false,
		compact: !devMode, // doc: All optional newlines and whitespace will be omitted when generating code in compact mode.
		comments: devMode,
		retainLines: devMode,
		//envName: devMode ? 'development' : 'production', see 'process.env.BABEL_ENV': JSON.stringify(mode),

		//minified,
		sourceType: moduleSourceType ? 'module' : 'script',
	});

	if ( transformedScript === null || transformedScript.code == null ) { // == null or undefined

		const msg = `unable to transform script "${filename.toString()}"`;
		log?.('error', msg);
		throw new Error(msg)
	}

	return [ depsList, transformedScript.code ];
}



// module tools


export async function loadModuleInternal(pathCx : PathContext, options : Options) : Promise<ModuleExport> {

	const { moduleCache, loadModule, addStyle } = options;

	const { id, path, getContent } = getResource(pathCx, options);

	if ( id in moduleCache ) {

		if ( moduleCache[id] instanceof Loading )
			return await (moduleCache[id] as Loading).promise;
		else
			return moduleCache[id];
	}


	moduleCache[id] = new Loading((async () => {

		// note: null module is accepted
		let module : ModuleExport | undefined | null = undefined;

		if ( loadModule )
			module = await loadModule(id, options);

		if ( module === undefined ) {

			const { getContentData, type } = await getContent();

			switch (type) {
				case '.vue': 
					module = await createSFCModule((await getContentData(false)) as string, path, options);
					break;
				case ".css":
					addStyle((await getContentData(false)) as string, path.toString());
					break;
				// case "css": {
				//   const { default: css } = (await getContentData(false)) as unknown as {
				//     default: CSSStyleSheet;
				//   };
				//   document.adoptedStyleSheets = [...document.adoptedStyleSheets, css];
				//   break;
				// }
				case ".js":
				case '.mjs':
					module = await getContentData(false);
					break;
				default:
					throw new TypeError(`Unable to handle ${ type } files (${ path })`);
			}

		}

		return moduleCache[id] = module;

	})());

	return await (moduleCache[id] as LoadingType<ModuleExport>).promise;
}




/**
 * Create a cjs module
 * @internal
 */
export function createCJSModule(refPath : AbstractPath, source : string, options : Options) : Module {

	const { moduleCache } = options;

	const require = function(relPath : string) {

		const { id } = getResource({ refPath, relPath }, options);
		if ( id in moduleCache )
			return moduleCache[id];

		throw new Error(`require(${ JSON.stringify(id) }) failed. module not found in moduleCache`);
	}

	const importFunction = async function(relPath : string) {

		return await loadModuleInternal({ refPath, relPath }, options);
	}

	const module = {
		exports: {}
	}

	// see https://github.com/nodejs/node/blob/a46b21f556a83e43965897088778ddc7d46019ae/lib/internal/modules/cjs/loader.js#L195-L198
	// see https://github.com/nodejs/node/blob/a46b21f556a83e43965897088778ddc7d46019ae/lib/internal/modules/cjs/loader.js#L1102
	const moduleFunction = Function('exports', 'require', 'module', '__filename', '__dirname', '__vsfcl_import__', source);
	moduleFunction.call(module.exports, module.exports, require, module, refPath, pathResolve({ refPath, relPath: '.' }, options), importFunction);

	return module;
}


/**
 * Just load and cache given dependencies.
 * @internal
 */
export async function loadDeps(refPath : AbstractPath, deps : AbstractPath[], options : Options) : Promise<void> {

	await Promise.all(deps.map(relPath => loadModuleInternal({ refPath, relPath }, options)))
}