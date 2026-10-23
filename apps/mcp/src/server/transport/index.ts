import {Server} from '@modelcontextprotocol/sdk/server/index.js';
import {CallToolRequestSchema,ListToolsRequestSchema} from '@modelcontextprotocol/sdk/types.js';
import type {BridgeTools} from '../tools/index.js';
import {toolDefinitions} from '../tools/schema.js';

/** Low-level SDK server preserves closed native JSON schemas and cancellation signals. */
export function createMcpServer(bridge:BridgeTools):Server {
  const server=new Server({name:'issus',version:'0.1.0'},{capabilities:{tools:{}}});
  server.setRequestHandler(ListToolsRequestSchema,async()=>({tools:toolDefinitions()}));
  server.setRequestHandler(CallToolRequestSchema,async(request,extra)=>bridge.call(request.params.name,request.params.arguments,extra.signal));
  return server;
}
