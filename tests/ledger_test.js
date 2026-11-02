'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { parseWire, mergeEvents, summarize } = require('../store');

const LUA = [
  'AuctionAssistantDB = {',
  '\t["ledgerWire"] = "10-1|1700000000|post|13463|20|50000|Dave|Nightslayer|Dreamfoil\\n10-2|1700000100|buy|13463|5|8000|Dave|Nightslayer|Dreamfoil\\n10-3|1700000200|sold|13463|0|47500|Dave|Nightslayer|Dreamfoil",',
  '}',
].join('\n');

test('reads the saved-variable wire', () => {
  const events = parseWire(LUA);
  assert.equal(events.length, 3);
  assert.deepEqual(events[0], {
    id: '10-1', t: 1700000000, kind: 'post', itemId: 13463, count: 20,
    copper: 50000, character: 'Dave', realm: 'Nightslayer', name: 'Dreamfoil',
  });
  assert.equal(events[2].kind, 'sold');
  assert.equal(events[2].copper, 47500);
});

test('a short buy barcode is the same purchase as the saved line', () => {
  const { parseLine } = require('../store');
  const barcode = parseLine('10-2|b|13463|5|8000|Dreamfoil');
  assert.equal(barcode.kind, 'buy');
  assert.equal(barcode.t, 10);
  assert.equal(barcode.copper, 8000);
  assert.equal(barcode.name, 'Dreamfoil');
  const saved = parseWire(LUA);
  const liveFirst = mergeEvents([barcode], saved);
  const row = liveFirst.find(event => event.id === '10-2');
  assert.equal(row.character, 'Dave');
  assert.equal(row.realm, 'Nightslayer');
  const savedFirst = mergeEvents(saved, [barcode]);
  const kept = savedFirst.find(event => event.id === '10-2');
  assert.equal(kept.character, 'Dave');
  assert.equal(savedFirst.length, 3);
  const posted = parseLine('10-1|p|13463|20|50000|86400|Dreamfoil');
  assert.equal(posted.kind, 'post');
  assert.equal(posted.copper, 50000);
  assert.equal(posted.duration, 86400);
  const withPost = mergeEvents(saved, [posted]);
  assert.equal(withPost.length, 3);
  assert.equal(withPost.find(event => event.id === '10-1').character, 'Dave');
  assert.equal(withPost.find(event => event.id === '10-1').duration, 86400);
  const full = parseLine('10-1|1700000000|post|13463|20|50000|Dave|Nightslayer|86400|Dreamfoil');
  assert.equal(full.duration, 86400);
  assert.equal(full.name, 'Dreamfoil');
  assert.equal(full.t, 1700000000);
});

test('merge keeps one row per id and totals sales against purchases', () => {
  const first = parseWire(LUA);
  const again = mergeEvents(first, first);
  assert.equal(again.length, 3);
  const added = mergeEvents(again, [{
    id: '10-4', t: 1700000300, kind: 'buy', itemId: 1, count: 1,
    copper: 1000, character: 'Dave', realm: 'Nightslayer', name: 'Linen Cloth',
  }]);
  assert.equal(added.length, 4);
  assert.equal(added[0].name, 'Linen Cloth');
  const totals = summarize(added);
  assert.equal(totals.posted, 50000);
  assert.equal(totals.bought, 9000);
  assert.equal(totals.sold, 47500);
  assert.equal(totals.net, 38500);
});

test('the ledger token is the bearer header', () => {
  const { bearerOk } = require('../api/shared');
  assert.equal(bearerOk('Bearer secret', 'secret'), true);
  assert.equal(bearerOk('Bearer no', 'secret'), false);
  assert.equal(bearerOk('Bearer secret', ''), false);
});

test('wowhead tooltip names the item icon', () => {
  const { iconFromTooltip } = require('../icons');
  assert.equal(iconFromTooltip('{"name":"Fish Oil","icon":"INV_Potion_64"}'), 'inv_potion_64');
  assert.equal(iconFromTooltip('{"icon":"../nope"}'), null);
  assert.equal(iconFromTooltip('not json'), null);
});
