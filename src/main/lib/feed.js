'use strict';

/** Strip CDATA wrappers and tags, decode the common XML entities, collapse whitespace. */
function decodeXml(s) {
  return String(s)
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/<[^>]+>/g, '')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&#(\d+);/g, (m, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-fA-F]+);/g, (m, n) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Extract headline titles from an RSS 2.0 (<item>) or Atom (<entry>) document.
 * This is a deliberately small parser: it only needs titles, so it avoids an XML dependency.
 */
function parseFeedTitles(xml, limit = 12) {
  const items = String(xml).match(/<(item|entry)[\s>][\s\S]*?<\/\1>/g) || [];
  return items
    .map((it) => {
      const t = it.match(/<title[^>]*>([\s\S]*?)<\/title>/);
      return t ? decodeXml(t[1]) : '';
    })
    .filter(Boolean)
    .slice(0, limit);
}

module.exports = { decodeXml, parseFeedTitles };
