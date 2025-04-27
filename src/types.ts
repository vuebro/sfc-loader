export type ModuleCacheId = string;
export type AbstractPath = {
	toString() : string,
}
export type PathContext = {
	refPath : AbstractPath | undefined,
	relPath : AbstractPath,
}
export type PathResolve = (pathCx : PathContext, options : Options) => AbstractPath;
export type ContentData = string | ArrayBuffer
export type File = {
	getContentData : (asBinary : Boolean) => Promise<ContentData>,
	type : string,
}
export type Resource = {
	id : ModuleCacheId,
	path : AbstractPath,
	getContent : () => Promise<File>,
}
export type ModuleExport = {} | null
export type Module = {
	exports : ModuleExport,
}
export type LoadingType<T> = {
	promise : Promise<T>,
}
export type Options = {
	moduleCache: Record<ModuleCacheId, LoadingType<ModuleExport> | ModuleExport>,
	getFile(path : AbstractPath) : Promise<File | ContentData>,
	addStyle(style : string, scopeId : string | undefined) : void,
}
