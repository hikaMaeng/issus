import type {RunnerOptions} from '../../options/index.js';
/** Pipe prompt via stdin; clear child MCP configuration without assuming an issus server exists. */
export const codexArguments=(o:RunnerOptions,dir:string):string[]=>['exec','-m',o.model,'-c',`model_reasoning_effort="${o.effort}"`,'-c','windows.sandbox="unelevated"','-c','sandbox_workspace_write.network_access=true','-c','approval_policy="never"','-c','mcp_servers={}','-s',o.sandbox,'-C',o.cwd,'--json','-o',dir+'/result.md','-'];
