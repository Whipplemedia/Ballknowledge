// The save-the-bar story's names and the developer's plan (public/story.json, also read by server.js).
const FALLBACK = { bar: 'The Dugout', owner: { name: 'Lou', full: 'Lou Marchetti', since: 1987 }, dev: { name: 'Chase', full: 'Chase Whitmore', company: 'Whitmore Development Group' }, bum: { name: 'Dusty' }, plan: { name: 'luxury condos', pitch: 'something with a lot of glass and no TVs' } };
export const STORY = typeof fetch === 'undefined' ? FALLBACK : await fetch('story.json').then((r) => r.json()).catch(() => FALLBACK);
