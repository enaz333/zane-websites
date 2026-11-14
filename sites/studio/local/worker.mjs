// Local-only entry point. Never upload this config or include this module in the production bundle.
import { createStudio } from '../../../workers/studio.mjs';

export default createStudio(request =>
  new URL(request.url).origin === 'http://127.0.0.1:8793' ? 'local-preview-owner' : null, { queueEdits: true, localBuilder: true });
