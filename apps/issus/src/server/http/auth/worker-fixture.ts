import {EventStore,PgmqClient} from 'agent/broker';
import {EventUnitOfWork,IntakeService} from 'issus_domain/server';
import {RuntimeAuth,createRuntimePool} from 'issus_runtime/server';
import {QUEUES} from 'issus_domain/common';

// Integration child process: no tokens in argv, environment or logs. The durable queue owns the command.
const databaseUrl=process.env.ISSUS_TEST_DATABASE_URL,schema=process.env.P4_DOMAIN_SCHEMA,broker=process.env.P4_BROKER_SCHEMA,prefix=process.env.P4_QUEUE_PREFIX,stage=process.env.P4_CRASH_STAGE;
if(!databaseUrl||!/^issus_p4_[0-9a-f]+$/.test(schema??'')||!/^issus_p4_b_[0-9a-f]+$/.test(broker??'')||!/^p4_[0-9a-f]+_$/.test(prefix??'')) throw new Error('isolated integration scope required');
const pool=createRuntimePool(databaseUrl,broker),store=new EventStore(pool,undefined,{retentionDays:null}),queue=new PgmqClient(pool);
const uow=new EventUnitOfWork({pool,schema,queueName:n=>prefix+n,queue,reactions:{'issus.comment.posted':[QUEUES.route]},eventStore:{appendManyOn:async(...args)=>{if(stage==='before-commit') process.exit(72);return store.appendManyOn(...args);}}});
const auth=new RuntimeAuth({uow}),intake=new IntakeService({uow,resolvePrincipal:a=>auth.resolveActor(a)});
try {
  const rows=(await pool.query('SELECT msg_id,message FROM pgmq.read($1::text,0,1)',[prefix+QUEUES.intake])).rows;if(rows.length!==1) throw new Error('expected one durable command');
  if(stage==='after-read') process.exit(71);
  await intake.executeIngress(rows[0].message);
  if(stage==='after-commit') process.exit(73);
  await pool.query('SELECT pgmq.delete($1::text,$2::bigint)',[prefix+QUEUES.intake,rows[0].msg_id]);
}finally{await pool.end();}
