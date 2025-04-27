import {
	loadModuleInternal,
} from './tools'

import {
	ModuleExport,
	Options,
	AbstractPath,
} from './types'

export * from './types'

export const loadModule = async(path : AbstractPath, options : Options) : Promise<ModuleExport> => await loadModuleInternal( { refPath: undefined, relPath: path }, options);
