// The SVG digest uses LF line endings, so Windows and Linux share the same
// content-addressed URLs. Tests and the generator enforce this source digest.
export const brandIconSourceSHA256 = '02836998b64e81fec4ceae7fea60430b04b716888d40d5f87af0a3fa583c5d06';
const prefix = `/brand/icons/ssg-blue-${brandIconSourceSHA256.slice(0, 12)}`;
export const brandIcons = Object.freeze({
  svg: `${prefix}.svg`,
  ico: `${prefix}.ico`,
  png96: `${prefix}-96.png`,
  apple: `${prefix}-apple.png`,
  png192: `${prefix}-192.png`,
  png512: `${prefix}-512.png`,
  manifest: `${prefix}.webmanifest`,
});

// Keep established root URLs as compatible copies for crawlers and old tabs.
export const brandIconCopies = Object.freeze([
  ['favicon.svg', brandIcons.svg],
  ['favicon.ico', brandIcons.ico],
  ['favicon-96x96.png', brandIcons.png96],
  ['apple-touch-icon.png', brandIcons.apple],
  ['web-app-manifest-192x192.png', brandIcons.png192],
  ['web-app-manifest-512x512.png', brandIcons.png512],
  ['site.webmanifest', brandIcons.manifest],
]);
