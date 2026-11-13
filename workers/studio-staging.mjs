import { createStudio } from './studio.mjs';
import { createAccessVerifier } from './studio-auth.mjs';

export default createStudio(createAccessVerifier(fetch, undefined, 'https://studio-staging.zanegiordano.com'));
