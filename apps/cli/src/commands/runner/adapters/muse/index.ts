import type {RunnerOptions} from '../../options/index.js';
/** Mirrors the installed Muse wrapper; unknown read-only flags are deliberately absent. */
export const museArguments=(o:RunnerOptions,dir:string):string[]=>['exec','--prompt-file',dir+'/prompt.md','--json','--model',o.model,'--reasoning-effort',o.effort,'--workspace',o.cwd,'--no-session-log','--disable-shell','--approval-mode','never','--trust-workspace'];
