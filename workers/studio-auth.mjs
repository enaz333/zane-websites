// Cloudflare Access signs application JWTs. Treat every claim as untrusted until verified.
const teamOrigin = /^https:\/\/[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.cloudflareaccess\.com$/;
const decoder = new TextDecoder('utf-8', { fatal: true });

function bytes(part) {
  if (!/^[A-Za-z0-9_-]+$/.test(part)) throw new Error('Invalid JWT encoding');
  return Uint8Array.from(atob(part.replaceAll('-', '+').replaceAll('_', '/')), c => c.charCodeAt(0));
}

export function createAccessVerifier(fetchKeys = fetch, reportFailure = () => {}) {
  let cache;
  function deny(stage, status) {
    // Pass only fixed stage names and HTTP status codes. Never pass the request, JWT, claims or exceptions.
    if (status === undefined) reportFailure(stage);
    else reportFailure(stage, status);
    return null;
  }

  return async (request, env) => {
    const { ACCESS_TEAM_ORIGIN: issuer, ACCESS_AUD: audience, STUDIO_OWNER_EMAIL: owner,
      STUDIO_ORIGIN: origin } = env;
    if (!teamOrigin.test(issuer ?? '') || !audience || !owner ||
        origin !== 'https://studio.zanegiordano.com') return deny('runtime_config');
    if (new URL(request.url).origin !== origin) return deny('request_origin');

    const token = request.headers.get('Cf-Access-Jwt-Assertion');
    if (!token) return deny('assertion_missing');
    if (token.length > 8192) return deny('assertion_size');

    let header, claims, signedInput, signature;
    try {
      const parts = token.split('.');
      if (parts.length !== 3) return deny('jwt_format');
      const [head, body, encodedSignature] = parts;
      header = JSON.parse(decoder.decode(bytes(head)));
      claims = JSON.parse(decoder.decode(bytes(body)));
      signature = bytes(encodedSignature);
      signedInput = new TextEncoder().encode(head + '.' + body);
      if (!header || !claims || typeof header !== 'object' || typeof claims !== 'object') {
        return deny('jwt_format');
      }
    } catch {
      return deny('jwt_format');
    }

    const { alg, kid } = header;
    const now = Math.floor(Date.now() / 1000);
    if (alg !== 'RS256' || typeof kid !== 'string' || !kid) return deny('jwt_header');
    if (claims.iss !== issuer) return deny('issuer');
    if (claims.type !== 'app') return deny('token_type');
    if (!Array.isArray(claims.aud) || !claims.aud.includes(audience)) return deny('audience');
    if (!Number.isSafeInteger(claims.exp) || claims.exp <= now ||
        (claims.nbf !== undefined && (!Number.isSafeInteger(claims.nbf) || claims.nbf > now))) {
      return deny('token_time');
    }
    if (typeof claims.email !== 'string' || claims.email.toLowerCase() !== owner.toLowerCase()) {
      return deny('owner_email');
    }
    if (typeof claims.sub !== 'string' || !claims.sub || claims.sub.length > 255) {
      return deny('subject');
    }

    if (cache?.issuer !== issuer || cache.until <= now) {
      const signal = AbortSignal.timeout(5000);
      let response;
      try {
        // Workers support manual redirects. Reject them without contacting the destination.
        response = await fetchKeys(issuer + '/cdn-cgi/access/certs', { redirect: 'manual', signal });
      } catch {
        return deny(signal.aborted ? 'jwks_timeout' : 'jwks_fetch_exception');
      }
      if (response.status >= 300 && response.status < 400) {
        return deny('jwks_redirect', response.status);
      }
      if (response.status !== 200) return deny('jwks_http_status', response.status);

      let keys;
      try {
        keys = (await response.json())?.keys;
      } catch {
        return deny(signal.aborted ? 'jwks_timeout' : 'jwks_format');
      }
      if (!Array.isArray(keys)) return deny('jwks_format');
      // Store settled data only: Workers cannot share request-scoped I/O.
      cache = { issuer, until: now + 60, keys };
    }
    const jwk = cache.keys.find(key => key?.kid === kid && key.kty === 'RSA' &&
      (!key.alg || key.alg === 'RS256') && (!key.use || key.use === 'sig'));
    if (!jwk) return deny('signing_key');

    let key;
    try {
      key = await crypto.subtle.importKey('jwk', jwk,
        { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['verify']);
    } catch {
      return deny('signing_key_import');
    }

    try {
      if (await crypto.subtle.verify('RSASSA-PKCS1-v1_5', key, signature, signedInput)) {
        return issuer + '#' + claims.sub;
      }
    } catch {
      // Verification errors and signature mismatches both fail closed.
    }
    return deny('signature');
  };
}
