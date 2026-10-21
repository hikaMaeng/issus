import {EventUnitOfWork,type EventTransaction} from 'issus_domain/server';

/** Receipt-producing RR reads can race worker terminal appends after the owner lock is released. */
export class BrokerUnitOfWork extends EventUnitOfWork {
  override async snapshot<T>(work:(tx:EventTransaction)=>Promise<T>):Promise<T> {
    const deadline=Date.now()+8000;
    for(let retry=0;;retry++) {
      try {return await super.snapshot(work);}
      catch(error) {
        const code=(error as {code?:string}).code;
        // Each super call retries and rolls back the entire transaction, including cursor, receipts and facts.
        if(!['40001','40P01'].includes(code??'')||retry>=2||Date.now()>=deadline) throw error;
        console.warn(JSON.stringify({event:'snapshot.contention.retry',retry:retry+1,code}));
        await new Promise(resolve=>setTimeout(resolve,100*(retry+1)));
      }
    }
  }
}
