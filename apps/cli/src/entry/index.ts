#!/usr/bin/env node
import {run} from './run/index.js';
const controller=new AbortController();
process.once('SIGINT',()=>controller.abort(new Error('INTERRUPTED')));
process.once('SIGTERM',()=>controller.abort(new Error('TERMINATED')));
process.stdout.on('error',error=>{if((error as NodeJS.ErrnoException).code==='EPIPE') controller.abort();});
process.exitCode=await run(process.argv.slice(2),{signal:controller.signal});
