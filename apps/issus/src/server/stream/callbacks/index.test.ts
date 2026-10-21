import test from 'node:test';
import assert from 'node:assert/strict';
import type {IncomingMessage} from 'node:http';
import {readStreamToken,selectStreamProtocol} from './index.js';
const request=(headers:IncomingMessage['headers'],url='/ws')=>({headers,url}) as IncomingMessage;
test('Monitor subprotocol credential is read only with version and never negotiated back',()=>{
 const token='fixture-opaque-token';
 assert.equal(readStreamToken(request({'sec-websocket-protocol':`issus.v1, issus.bearer.${token}`})),token);
 assert.equal(selectStreamProtocol(new Set([`issus.bearer.${token}`,'issus.v1'])),'issus.v1');
 assert.equal(selectStreamProtocol(new Set([`issus.bearer.${token}`])),false);
 assert.equal(readStreamToken(request({'sec-websocket-protocol':`issus.bearer.${token}`})),undefined);
 assert.equal(readStreamToken(request({'sec-websocket-protocol':'issus.v1, issus.bearer.'})),undefined);
 assert.equal(readStreamToken(request({'sec-websocket-protocol':`issus.v1, issus.bearer.${token}, issus.bearer.other`})),undefined);
});
test('query credentials and conflicting bearer/protocol identities are rejected',()=>{
 const headers={authorization:'Bearer header-token','sec-websocket-protocol':'issus.v1, issus.bearer.other-token'};
 assert.equal(readStreamToken(request(headers)),undefined);
 assert.equal(readStreamToken(request({authorization:'Bearer header-token'},'/ws?token=anything')),undefined);
 assert.equal(readStreamToken(request({authorization:'Bearer header-token'},'/ws?access_token=anything')),undefined);
 assert.equal(readStreamToken(request({authorization:'Bearer header-token'},'/ws?subscription=opaque&cursor=opaque')),'header-token');
});
