import {
	posix as Path
} from 'path'

import {
	loadModuleInternal,
	defaultCreateCJSModule,
} from './tools'

import {
	ModuleExport,
	PathResolve,
	Options,
	Resource,
	PathContext,
	AbstractPath,
} from './types'

export * from './types'


/**
 * @internal
 */
function throwNotDefined(details : string) : never {

	throw new ReferenceError(`${ details } is not defined`);
}


/**
 * Default getPathname implementation
 * remove search string
 */
const defaultGetPathname = (path : string) => {

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
const defaultPathResolve : PathResolve = ({ refPath, relPath } : PathContext, options : Options) => {

	const { getPathname } = options;

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
function defaultGetResource(pathCx : PathContext, options : Options) : Resource {

	const { pathResolve, getPathname, getFile, log } = options;
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


export async function loadModule(path : AbstractPath, options : Options = throwNotDefined('options')) : Promise<ModuleExport> {

	const {
		moduleCache = throwNotDefined('options.moduleCache'),
		getFile = throwNotDefined('options.getFile()'),
		addStyle = throwNotDefined('options.addStyle()'),
		pathResolve = defaultPathResolve,
		getResource = defaultGetResource,
		createCJSModule = defaultCreateCJSModule,
		getPathname = defaultGetPathname,
	} = options;

	// moduleCache should be defined with Object.create(null). require('constructor') etc... should not be a default module
	if ( moduleCache instanceof Object )
		Object.setPrototypeOf(moduleCache, null);

	const normalizedOptions = {
		//@ts-ignore: is specified more than once, so this usage will be overwritten.ts(2783)
		moduleCache,
		//@ts-ignore: is specified more than once, so this usage will be overwritten.ts(2783)
		pathResolve,
		//@ts-ignore: is specified more than once, so this usage will be overwritten.ts(2783)
		getResource,
		//@ts-ignore: is specified more than once, so this usage will be overwritten.ts(2783)
		createCJSModule,
		//@ts-ignore: is specified more than once, so this usage will be overwritten.ts(2783)
		getPathname,
		...options,
	};

	if ( options.devMode ) {

		if ( options.compiledCache === undefined )
			options.log?.('info', 'options.compiledCache is not defined, performance will be affected');
	}

	return await loadModuleInternal( { refPath: undefined, relPath: path }, normalizedOptions);
}
