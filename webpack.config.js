const path = require('path');
const NodePolyfillPlugin = require('node-polyfill-webpack-plugin');

module.exports = {
		mode: 'production',
		experiments: { outputModule: true },
		externals: ['@vue/compiler-sfc'],
		entry: [ path.resolve(__dirname, 'src/index.ts') ],
		output: {
			path: path.resolve(__dirname, 'dist'),
			filename: 'index.js',
			libraryTarget: 'module',
			clean: true
		},
		plugins: [new NodePolyfillPlugin({additionalAliases: ['process']})],
		resolve: {
			extensions: [".ts", ".js"],
			conditionNames: ['require', 'node'],
		},
		module: {
			rules: [
				{
					test: /\.ts$/,
					use: { loader: 'ts-loader' }
				},
			]
		}
	};
