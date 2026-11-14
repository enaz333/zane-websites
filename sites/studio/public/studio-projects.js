const endpoint = '/api/workspace-projects';
const list = document.querySelector('#project-list');
const detail = document.querySelector('#project-detail');
const status = document.querySelector('#project-status');
const create = document.querySelector('#project-create');
let selected;
let refreshId = 0;
const keys = new WeakMap();

function element(tag, text) {
  const node = document.createElement(tag);
  if (text !== undefined) node.textContent = text;
  return node;
}

async function api(path, body, key) {
  const response = await fetch(endpoint + path, body === undefined ? {} : {
    method: 'POST', headers: { 'Content-Type': 'application/json', 'Idempotency-Key': key },
    body: JSON.stringify(body),
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error);
  return data;
}

function submit(form, action) {
  form.addEventListener('submit', async event => {
    event.preventDefault();
    const button = form.querySelector('button');
    const body = Object.fromEntries(new FormData(form));
    const snapshot = JSON.stringify(body);
    if (keys.get(form)?.snapshot !== snapshot) keys.set(form, { snapshot, id: crypto.randomUUID() });
    button.disabled = true;
    try {
      await action(body, keys.get(form).id);
      keys.delete(form);
      status.textContent = 'Saved.';
      await refresh();
    } catch (error) {
      status.textContent = error.message;
    } finally {
      button.disabled = false;
    }
  });
}

function action(label, run) {
  const button = element('button', label);
  button.type = 'button';
  button.onclick = async () => {
    button.disabled = true;
    try { await run(); await refresh(); }
    catch (error) { status.textContent = error.message; }
    finally { button.disabled = false; }
  };
  return button;
}

async function refresh() {
  const id = ++refreshId;
  const { projects } = await api('');
  const workspace = selected && await api('/' + selected);
  if (id !== refreshId) return;
  list.replaceChildren(...projects.map(project => {
    const button = action(project.name + ' · /' + project.slug, () => { selected = project.id; });
    button.setAttribute('aria-pressed', String(selected === project.id));
    return button;
  }));
  detail.replaceChildren();
  if (!workspace) return;
  const { project, requests, fixture } = workspace;
  const current = requests.find(run => run.id === project.current_version);
  detail.append(element('h3', project.name), element('p', 'Proposed path /' + project.slug));
  const form = element('form');
  const briefLabel = element('label', 'Application brief');
  const brief = element('textarea');
  brief.name = 'brief';
  brief.required = true;
  brief.maxLength = 4000;
  brief.value = current?.brief ?? project.brief;
  briefLabel.append(brief);
  const messageLabel = element('label', 'Change request');
  const message = element('textarea');
  message.name = 'message';
  message.required = true;
  message.maxLength = 4000;
  messageLabel.append(message);
  const restore = element('input');
  restore.type = 'hidden';
  restore.name = 'restore';
  form.append(briefLabel, messageLabel, restore, element('button', 'Save request'));
  submit(form, (body, key) => api('/' + project.id + '/requests', {
    ...body, parent: project.current_version, restore: body.restore || null,
  }, key));
  if (!fixture) detail.append(element('p', 'Build runner unavailable. You can save and review requests.'));
  detail.append(form, element('h3', 'Request history'));
  for (const run of requests) {
    const section = element('section');
    section.append(element('p', run.message + ' · ' + run.state),
      element('p', run.brief));
    if (run.state === 'queued') {
      const path = '/' + project.id + '/requests/' + run.id;
      if (fixture) section.append(action('Build fixture', () => api(path + '/build', {})));
      section.append(action('Cancel request', () => api(path + '/cancel', {})));
    }
    if (run.state === 'ready') {
      const artifact = element('details');
      artifact.append(element('summary', 'Inspect fixture artifact'),
        element('p', 'SHA-256 ' + run.digest), element('pre', run.artifact));
      const restoreButton = element('button', 'Restore this specification');
      restoreButton.type = 'button';
      restoreButton.onclick = () => {
        restore.value = run.id;
        brief.value = run.brief;
        message.value = 'Restore earlier specification';
        message.focus();
        status.textContent = 'Submit the request to restore this specification.';
      };
      section.append(artifact, restoreButton);
    }
    detail.append(section);
  }
}

submit(create, async (body, key) => {
  const { project } = await api('', body, key);
  selected = project.id;
  create.reset();
});

function loadProjects() {
  if (location.hash === '#projects') refresh().catch(error => { status.textContent = error.message; });
}
window.addEventListener('hashchange', loadProjects);
loadProjects();
