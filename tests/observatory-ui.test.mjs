/** DOM regressions complement real-browser acceptance without making any network requests. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { Observatory } from '../ui-dist/observatory.js';
const job = (id = 'one') => ({ id, result: { pages: { 'https://fixture.example/a': { url: 'https://fixture.example/a', title: '', description: '', internal_links: [] } }, errors: [] } });
function fixture(run) {
  const dom = new JSDOM('<main id="result"></main>', { url:'http://localhost', pretendToBeVisual:true });
  const saved = new Map(['document','AbortController','CSS'].map(name => [name,Object.getOwnPropertyDescriptor(globalThis,name)]));
  Object.defineProperty(globalThis,'document',{value:dom.window.document,configurable:true});
  Object.defineProperty(globalThis,'AbortController',{value:dom.window.AbortController,configurable:true});
  // Attribute selectors in these tests need quoted-string escaping only.
  Object.defineProperty(globalThis,'CSS',{value:{escape:value => value.replace(/[\\"]/g,'\\$&')},configurable:true});
  const root = dom.window.document.querySelector('main'); let opened = 0;
  const view = new Observatory({openPage:() => { opened++; },notify:() => {}});
  const control = id => root.querySelector('#'+id);
  try { run({dom,root,view,control,opened:() => opened}); }
  finally { view.leave(); dom.window.close(); for(const [name,descriptor] of saved) { if(descriptor) Object.defineProperty(globalThis,name,descriptor); else delete globalThis[name]; } }
}
test('switching captures resets both filter state and visible controls', () => fixture(({dom,view,control}) => {
  view.render(control('result') ?? dom.window.document.querySelector('main'), job());
  const query=control('obs-query');query.value='unmatched';query.dispatchEvent(new dom.window.Event('input',{bubbles:true}));
  assert.match(control('obs-findings-count').textContent,/0 matching/);
  const root=dom.window.document.querySelector('main');view.render(root,job('two'));
  assert.equal(control('obs-query').value,'');assert.equal(control('obs-category').value,'all');assert.match(control('obs-findings-count').textContent,/2 matching/);
}));
test('live result updates preserve focus on the same page row', () => fixture(({root,view,control}) => {
  view.render(root,job());control('obs-ranking-list').querySelector('button').focus();view.render(root,job());
  assert.equal(document.activeElement.dataset.obsPage,'https://fixture.example/a');assert.ok(control('obs-ranking-list').contains(document.activeElement));
}));
test('live result updates preserve chart disclosure focus and open state', () => fixture(({root,view,control}) => {
  view.render(root,job());const details=control('obs-data-coverage');details.open=true;details.querySelector('summary').focus();view.render(root,job());
  assert.equal(document.activeElement.tagName,'SUMMARY');assert.equal(document.activeElement.parentElement.id,'obs-data-coverage');assert.equal(control('obs-data-coverage').open,true);
}));
test('live result updates preserve focus in the evidence list', () => fixture(({root,view,control}) => {
  view.render(root,job());control('obs-findings-list').querySelector('button').focus();view.render(root,job());
  assert.equal(document.activeElement.dataset.obsPage,'https://fixture.example/a');assert.ok(control('obs-findings-list').contains(document.activeElement));
}));
test('leaving and remounting does not duplicate delegated actions', () => fixture(({root,view,control,opened}) => {
  view.render(root,job());view.leave();root.replaceChildren();view.render(root,job());control('obs-ranking-list').querySelector('button').click();assert.equal(opened(),1);
}));
test('hostile captured strings are rendered as text, not elements', () => fixture(({root,view}) => {
  const capture=job();capture.result.pages['https://fixture.example/a'].title='<img src=x onerror=alert(1)>';view.render(root,capture);assert.equal(root.querySelectorAll('img,script').length,0);assert.match(root.textContent,/<img src=x/);
}));

test('chart geometry uses SVG attributes compatible with the strict style policy', () => fixture(({root,view}) => {
  const capture=job();capture.result.pages['https://fixture.example/a'].status_code=200;capture.result.pages['https://fixture.example/a'].duration_ms=400;
  view.render(root,capture);
  assert.equal(root.querySelectorAll('#obs-charts [style]').length,0);
  const bars=Array.from(root.querySelectorAll('.obs-hbars rect'));
  assert.equal(Number(bars[0].getAttribute('width')),100);
  assert.equal(Number(bars[1].getAttribute('width')),0);
  assert.equal(root.querySelectorAll('.obs-histogram rect').length,5);
}));
