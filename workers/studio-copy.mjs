export const repo = 'enaz333/zane-websites';
export const path = 'sites/personal/public/index.html';
export const original = 'A little of everything.';
const slot = '<h2 id="projects-title">' + original + '</h2>';
export const sha = value => typeof value === 'string' && /^[a-f0-9]{40}$/.test(value);

export function eligible(task) {
  return task.kind === 'edit' && task.project === 'personal' &&
    [null, '/', 'https://zanegiordano.com/', 'https://zanegiordano.com'].includes(task.page);
}

export function applyCopy(source, replacement) {
  if (typeof replacement !== 'string' || replacement !== replacement.trim() ||
      !/^[\p{L}\p{N}][\p{L}\p{N} ,.'’!?–—-]{4,79}$/u.test(replacement) || replacement === original ||
      source.split(slot).length !== 2) throw new Error('Copy policy rejected the edit');
  return source.replace(slot, '<h2 id="projects-title">' + replacement + '</h2>');
}

export async function copyDigest(text) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('');
}
