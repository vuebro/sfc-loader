import typescript from '@rollup/plugin-typescript';
import replace from '@rollup/plugin-replace';
import terser from '@rollup/plugin-terser'

import pkg from '../package.json' with { type: 'json' };

const genSourcemap = false;
const vueVersion = (await import('@vue/compiler-sfc/package.json', { with: { type: 'json' } })).default.version; // expected vue version

export default {
    input: './src/index.ts',
    output: {
        file: 'dist/vue3-sfc-loader-node.mjs',
        format: 'module',
    },
    plugins: [
        replace({
            preventAssignment: true,
            values: {
                'process.env.GEN_SOURCEMAP': JSON.stringify(genSourcemap),
                'process.env.VERSION': JSON.stringify(pkg.version),
                'process.env.VUE_VERSION': JSON.stringify(vueVersion),
            },
        }),
        typescript({
            compilerOptions: {
                target: 'ES2017', // keep async/await
                allowSyntheticDefaultImports: true,
            }
        }), // beware: order is important !
        terser({
            compress: false,
            mangle: false,
            output: {
                comments: false,
                beautify: true,
            },
        }),
    ],
};
