import test from 'node:test';
import assert from 'node:assert/strict';
import {renderToStaticMarkup} from 'react-dom/server';
import {AppShell} from './index.js';

test('desktop shell provides one main/nav and page-owned h1 with a single context aside', () => {
  const previous = Object.getOwnPropertyDescriptor(globalThis, 'location');
  Object.defineProperty(globalThis, 'location', {configurable: true, value: {pathname: '/repos/o/r/issues'}});
  try {
    const html = renderToStaticMarkup(<AppShell principal={{alias: 'tt-1-alpha', sid: 's2'}} repo="o/r" session={<p>session</p>}><h1>page</h1></AppShell>);
    assert.equal((html.match(/<main\b/g) ?? []).length, 1); assert.equal((html.match(/<h1\b/g) ?? []).length, 1); assert.equal((html.match(/<nav\b/g) ?? []).length, 1); assert.equal((html.match(/<aside\b/g) ?? []).length, 1);
    assert.ok(html.includes('aria-label="주 탐색"')); assert.ok(html.includes('aria-label="이슈 보조 정보"')); assert.ok(html.includes('aria-current="page"')); assert.ok(html.includes('href="#main-content"'));
  } finally {if (previous) Object.defineProperty(globalThis, 'location', previous); else Reflect.deleteProperty(globalThis, 'location');}
});
