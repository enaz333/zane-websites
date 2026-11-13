// Cloudflare Access signs application JWTs. Treat every claim as untrusted until verified.
const teamOrigin = /^https:\/\/[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.cloudflareaccess\.com$/;
const decoder = new TextDecoder('utf-8', { fatal: true });

function bytes(part) {
  if (!/^[A-Za-z0-9_-]+$/.test(part)) throw new Error('Invalid JWT encoding');
  return Uint8Array.from(atob(part.replaceAll('-', '+').replaceAll('_', '/')), c => c.charCodeAt(0));
}

export function createAccessVerifier(fetchKeys = fetch) {
  let cache;
  return async (request, env) => {
    const { ACCESS_TEAM_ORIGIN: issuer, ACCESS_AUD: audience, STUDIO_OWNER_EMAIL: owner,
      STUDIO_ORIGIN: origin } = env;
    if (!teamOrigin.test(issuer ?? '') || !audience || !owner ||
        origin !== 'https://studio.zanegiordano.com' || new URL(request.url).origin !== origin) {
      return null;
    }
    const token = request.headers.get('Cf-Access-Jwt-Assertion');
    if (!token || token.length > 8192) return null;
    try {
      const parts = token.split('.');
      if (parts.length !== 3) return null;
      const [head, body, signature] = parts;
      const { alg, kid } = JSON.parse(decoder.decode(bytes(head)));
      const claims = JSON.parse(decoder.decode(bytes(body)));
      const now = Math.floor(Date.now() / 1000);
      if (alg !== 'RS256' || typeof kid !== 'string' || !kid ||
          claims.iss !== issuer || claims.type !== 'app' ||
          !Array.isArray(claims.aud) || !claims.aud.includes(audience) ||
          !Number.isSafeInteger(claims.exp) || claims.exp <= now ||
          (claims.nbf !== undefined && (!Number.isSafeInteger(claims.nbf) || claims.nbf > now)) ||
          typeof claims.email !== 'string' || claims.email.toLowerCase() !== owner.toLowerCase() ||
          typeof claims.sub !== 'string' || !claims.sub || claims.sub.length > 255) return null;

      if (cache?.issuer !== issuer || cache.until <= now) {
        const response = await fetchKeys(issuer + '/cdn-cgi/access/certs', {
          redirect: 'error', signal: AbortSignal.timeout(5000),
        });
        if (!response.ok) return null;
        const { keys } = await response.json();
        if (!Array.isArray(keys)) return null;
        // Store settled data only: Workers cannot share request-scoped I/O.
        cache = { issuer, until: now + 60, keys };
      }
      const jwk = cache.keys.find(key => key.kid === kid && key.kty === 'RSA' &&
        (!key.alg || key.alg === 'RS256') && (!key.use || key.use === 'sig'));
      if (!jwk) return null;
      const key = await crypto.subtle.importKey('jwk', jwk,
        { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['verify']);
      const verified = await crypto.subtle.verify('RSASSA-PKCS1-v1_5', key, bytes(signature),
        new TextEncoder().encode(head + '.' + body));
      return verified ? issuer + '#' + claims.sub : null;
    } catch {
      return null;
    }
  };
}
