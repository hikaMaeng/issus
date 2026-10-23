import {StdioServerTransport} from '@modelcontextprotocol/sdk/server/stdio.js';
import {loadConfig,parseOptions} from '../config/index.js';
import {Connection} from '../connection/index.js';
import {BridgeTools} from '../tools/index.js';
import {createMcpServer} from '../transport/index.js';

/** stdio is exclusively MCP JSON-RPC. No credentials or raw exceptions reach stdout/stderr. */
async function main():Promise<void>{
  const config=await loadConfig(process.env,parseOptions(process.argv.slice(2))),connection=new Connection(config),bridge=new BridgeTools(connection);
  const server=createMcpServer(bridge);
  const transport=new StdioServerTransport();
  let closing:Promise<void>|undefined;
  const close=()=>closing??=(async()=>{await bridge.close();await server.close();})();
  server.onclose=()=>{void close().catch(()=>{process.exitCode=1;});};
  server.onerror=()=>{process.stderr.write('issus-mcp: protocol error\n');};
  process.once('SIGINT',()=>{void close();});process.once('SIGTERM',()=>{void close();});
  process.stdin.once('end',()=>{void close();});
  await server.connect(transport);
}
main().catch(error=>{
  const code=error instanceof Error&&/^BRIDGE_[A-Z_]+$/u.test(error.message)?error.message:'BRIDGE_STARTUP_FAILED';
  process.stderr.write(`issus-mcp: ${code}\n`);process.exitCode=1;
});
