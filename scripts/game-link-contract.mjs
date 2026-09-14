import assert from 'node:assert/strict';

export const googlePlayLinks = Object.freeze({
  shapedash: 'https://play.google.com/store/apps/details?id=com.SimplyShapedGames.ShapeDash',
  pieceperfect: 'https://play.google.com/store/apps/details?id=com.SimplyShapedGames.PiecePerfect',
  slide: 'https://play.google.com/store/apps/details?id=com.SimplyShapedGames.Slide_',
});

export const retainedModLinks = Object.freeze({
  'copycat-expansion': 'https://www.curseforge.com/minecraft/mc-mods/create-copycat-expansion',
  'the-witch-who-laughs': 'https://steamcommunity.com/sharedfiles/filedetails/?id=3559560048',
});

// User-requested video-promotion removal applies only to the Games website.
// A company YouTube channel link is not a game showcase and remains allowed.
export function assertNoShowcaseMedia(content, context) {
  assert.doesNotMatch(content, /\bshowcase\b/i, `${context}: remove showcase calls to action and associated copy`);
  assert.doesNotMatch(content, /<video\b|<iframe\b[^>]*(?:youtube|youtu\.be|vimeo)/i, `${context}: no video showcase embeds`);
  assert.doesNotMatch(content, /(?:https?:)?\/\/(?:(?:www|m)\.)?(?:youtube(?:-nocookie)?\.com\/(?:watch[/?#]|shorts\/|embed\/)|youtu\.be\/|(?:player\.)?vimeo\.com\/(?:video\/)?\d)/i, `${context}: no promotional video links`);
}

export function assertGameStoreActions(html, id) {
  const expected = googlePlayLinks[id];
  if (!expected) return;
  const actions = html.match(/<div\b[^>]*\bclass="project-actions"[^>]*>([\s\S]*?)<\/div>/)?.[1];
  assert(actions, `${id}: the game detail page needs its Google Play action`);
  const hrefs = [...actions.matchAll(/<a\b[^>]*\bhref="([^"]+)"/g)].map(match => match[1].replaceAll('&amp;', '&'));
  assert.deepEqual(hrefs, [expected], `${id}: Google Play must be the only game-detail external action`);
  assert.match(actions, />\s*Google Play\b/, `${id}: preserve the visible Google Play label`);
}
