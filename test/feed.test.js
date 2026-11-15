'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { decodeXml, parseFeedTitles } = require('../src/main/lib/feed');

test('decodeXml handles CDATA, tags and entities', () => {
  assert.strictEqual(decodeXml('<![CDATA[Fish &amp; chips]]>'), 'Fish & chips');
  assert.strictEqual(decodeXml('a &lt;b&gt; &quot;c&quot; &#39;d&#39; &#8212; &#x4E2D;'), 'a <b> "c" \'d\' — 中');
  assert.strictEqual(decodeXml('  spaced \n  <i>out</i>  '), 'spaced out');
});

test('parseFeedTitles reads RSS items and skips the channel title', () => {
  const xml = '<rss><channel><title>Channel</title>' +
    '<item><title>One</title><link>x</link></item>' +
    '<item><title><![CDATA[Two &amp; three]]></title></item>' +
    '</channel></rss>';
  assert.deepStrictEqual(parseFeedTitles(xml), ['One', 'Two & three']);
});

test('parseFeedTitles reads Atom entries', () => {
  const xml = '<feed><title>Feed</title><entry><title type="html">Alpha</title></entry>' +
    '<entry><title>Beta</title></entry></feed>';
  assert.deepStrictEqual(parseFeedTitles(xml), ['Alpha', 'Beta']);
});

test('parseFeedTitles honours the limit and tolerates junk', () => {
  const xml = Array.from({ length: 20 }, (_, i) => '<item><title>T' + i + '</title></item>').join('');
  assert.strictEqual(parseFeedTitles(xml, 5).length, 5);
  assert.deepStrictEqual(parseFeedTitles('not xml at all'), []);
  assert.deepStrictEqual(parseFeedTitles('<item><title></title></item>'), []);
});
