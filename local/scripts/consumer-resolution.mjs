import {createRequire} from 'node:module';
import {resolve, dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const require=createRequire(resolve(root,'apps/consumer/package.json'));
/** Deliberately resolve packed artifacts, never ancestor workspaces or TS source aliases. */
export const consumerResolution={name:'packed-consumer',setup(build){
 build.onResolve({filter:/^(@adam[-/]|svelte(?:$|\/))/},args=>({path:args.path==='svelte'?resolve(root,'apps/consumer/node_modules/svelte/src/runtime/index.js'):require.resolve(args.path)}));
}};
