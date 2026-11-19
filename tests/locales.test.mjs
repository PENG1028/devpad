import assert from 'node:assert/strict';
import { test } from 'node:test';
import { sourceRevision, validateMessages } from '../scripts/locale-validation.mjs';

const base={'已选 {count} 条':'Selected {count} notes','复制 {{content}}':'Copy {{content}}'};
test('each catalog must cover every source message, without blank or obsolete entries',()=>{
 assert.deepEqual(validateMessages(base,{...base}),[]);
 assert.equal(validateMessages(base,{'已选 {count} 条':'  ',old:'Old'}).length,3);
});
test('UI arguments and export variables can move within a sentence but may not be lost or renamed',()=>{
 assert.deepEqual(validateMessages(base,{'已选 {count} 条':'{count} éléments','复制 {{content}}':'Copier {{content}}'}),[]);
 assert.equal(validateMessages(base,{'已选 {count} 条':'{amount} éléments','复制 {{content}}':'Copier {content}'}).length,2);
});
test('an English wording change reopens translation review regardless of key order',()=>{
 assert.equal(sourceRevision(base),sourceRevision(Object.fromEntries(Object.entries(base).reverse())));
 assert.notEqual(sourceRevision(base),sourceRevision({...base,'已选 {count} 条':'Deleted {count} notes'}));
});
