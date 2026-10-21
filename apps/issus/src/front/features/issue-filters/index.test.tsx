import test from 'node:test';
import assert from 'node:assert/strict';
import {renderToStaticMarkup} from 'react-dom/server';
import {readFilters, filterIssues, filterSearch, issueListPath, IssueFilterForm} from './index.js';

const items = [{number: 1, title: 'Beta', state: 'running', isOpen: true}, {number: 3, title: 'Alpha', state: 'done', isOpen: true}, {number: 12, title: 'Alpha', state: 'running', isOpen: true}];
test('list model combines complete-page STATE and title/number search with deterministic sorting', () => {
  const filters = readFilters('?state=all&workState=running&q=Alpha&sort=number-asc');
  assert.deepEqual(filterIssues(items, filters).map(item => item.number), [12]);
  assert.deepEqual(filterIssues(items, readFilters('?q=%231&sort=number-desc')).map(item => item.number), [12,1]);
  assert.deepEqual(filterIssues(items, readFilters('?sort=title-asc')).map(item => item.number), [3,12,1]);
  assert.deepEqual(items.map(item => item.number), [1,3,12]);
});
test('URL round trip preserves unrelated scope and validates unsupported enum values', () => {
  const filters = readFilters('?state=all&workState=hold&q=%ED%95%9C&sort=title-asc&owner=x');
  assert.deepEqual(readFilters(filterSearch('?keep=1', filters)), filters);
  assert.equal(new URLSearchParams(filterSearch('?keep=1', filters)).get('keep'), '1');
  assert.equal(readFilters('?state=bad&workState=bad&sort=bad').state, 'open');
});
test('Q2 unavailable controls have a visible reason and semantic disabled state', () => {
  const html = renderToStaticMarkup(<IssueFilterForm advanced={false} filters={readFilters('')} onChange={() => {}} onRefresh={() => {}}/>);
  assert.ok(html.includes('aria-label="이슈 필터"')); assert.ok(html.includes('id="owner-alias" disabled="" aria-describedby="q2-reason"')); assert.ok(html.includes('id="participant-alias" disabled=""')); assert.ok(html.includes('value="updated" disabled=""'));
});
test('Q2 query forwards only approved keys and preserves updated server order', () => {
  const filters = readFilters('?state=all&owner=a&alias=b&q=%231&workState=running&sort=updated');
  const url = new URL(issueListPath('o/r', filters), 'http://test.invalid');
  assert.equal(url.searchParams.get('sort'), 'updated'); assert.equal(url.searchParams.get('order'), 'desc'); assert.equal(url.searchParams.get('owner'), 'a'); assert.equal(url.searchParams.get('alias'), 'b'); assert.equal(url.searchParams.has('workState'), false);
  assert.deepEqual(filterIssues(items, {...filters, q: '', workState: ''}).map(item => item.number), [1,3,12]);
  assert.equal(new URL(issueListPath('o/r', filters, false), 'http://test.invalid').searchParams.has('owner'), false);
});
