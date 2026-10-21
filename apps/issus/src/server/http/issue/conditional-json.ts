import {createHash} from 'node:crypto';
import type {Response} from 'express';

/** Hash the exact JSON representation; Express evaluates If-None-Match after authenticated reads. */
export function sendConditionalJson(res:Response,data:unknown):void {
  const body=JSON.stringify(data);
  const etag=`"sha256-${createHash('sha256').update(body).digest('hex')}"`;
  res.setHeader('ETag',etag);
  res.setHeader('Cache-Control','private, no-cache');
  res.vary('Authorization');res.vary('Cookie');
  res.type('json').send(body);
}
