const $ = selector => document.querySelector(selector);
const tabs = [...document.querySelectorAll('.tabs a')];
const forms = [...document.forms];
const history = $('#history');
const notice = $('#notice');
const empty = $('#empty');
const refresh = $('#refresh');
const more = $('#more');
let projectsReady = false;
let next = null;
let loading = false;
let reloadHistory = false;
const names = {
  personal: 'Personal site', 'photo-notes': 'Photo Notes', club: 'Cool Strangers Club',
  acl: 'ACL Schedule Creator', coachella: 'Coachella Schedule Maker',
};

async function api(path, options) {
  const response = await fetch(path, { cache: 'no-store', redirect: 'error', ...options });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || 'Something went wrong. Try again.');
  return data;
}

async function loadProjects() {
  try {
    const { projects } = await api('/api/projects');
    for (const form of forms) {
      form.elements.project.replaceChildren(new Option('Choose a website', ''));
      for (const slug of projects) form.elements.project.add(new Option(names[slug] || slug, slug));
      form.querySelector('button').disabled = false;
    }
    projectsReady = true;
    syncProject();
  } catch {
    notice.textContent = 'Could not load websites. Reload Studio to try again.';
  }
}

const newForm = $('[data-kind=new]');
function syncProject() {
  const standalone = newForm.elements.kind.value === 'app';
  newForm.querySelector('[data-project]').hidden = standalone;
  newForm.elements.project.disabled = !projectsReady || standalone;
  forms[0].elements.project.disabled = !projectsReady;
}
newForm.elements.kind.addEventListener('change', syncProject);

function currentTab() {
  return tabs.find(tab => tab.hash === location.hash)?.hash || '#edit';
}
function selectTab() {
  const selected = currentTab();
  for (const tab of tabs) {
    $(tab.hash).hidden = tab.hash !== selected;
    if (tab.hash === selected) tab.setAttribute('aria-current', 'page');
    else tab.removeAttribute('aria-current');
  }
  if (selected === '#activity') loadHistory();
}
window.addEventListener('hashchange', selectTab);

function node(tag, text) {
  const el = document.createElement(tag);
  el.textContent = text;
  return el;
}

const labels = {
  submitted: 'Submitted', queued: 'Queued', running: 'Running', validating: 'Validating',
  pr_ready: 'PR ready', failed: 'Failed', cancelled: 'Cancelled',
};
const progress = {
  submitted: 'Saved for review.',
  queued: 'Waiting for an executor.',
  running: 'Claimed by the executor.',
  validating: 'Checking the proposed changes.',
  pr_ready: 'Ready for GitHub review.',
};
const failures = {
  execution_failed: 'The executor could not complete the request.',
  checks_failed: 'Validation checks failed.',
  lease_expired: 'The execution timed out.',
};
const formatTime = value => new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' })
  .format(new Date(value));

function taskRow(task) {
  const row = document.createElement('li');
  const project = names[task.project] || task.project;
  const status = labels[task.status] || 'Unknown state';
  row.append(node('h3', task.title || `Edit · ${project}`));
  const destination = task.slug ? `zanegiordano.com/${task.slug} · ${project || 'Independent application'}` : task.page;
  if (destination) row.append(node('small', destination));
  row.append(node('small', `${status} · ${task.asap ? 'As soon as possible' : 'Economy preferred'} · ${formatTime(task.updated_at)}`));
  row.append(node('p', task.description));
  const phase = {
    prepare: 'Loading the reviewed source revision.',
    model_sent: 'Waiting for the model response.',
    check: 'Waiting for repository checks.',
    publish: 'Preparing or checking for the draft pull request.',
  };
  const detail = phase[task.execution_phase] || progress[task.status] || failures[task.failure_code];
  if (detail) row.append(node('small', detail));
  if (task.started_at) row.append(node('small', `Started ${formatTime(task.started_at)}`));
  if (task.finished_at) row.append(node('small', `Finished ${formatTime(task.finished_at)}`));
  if (task.check_summary) row.append(node('small', task.check_summary));
  else if (task.check_status) row.append(node('small', task.check_status === 'passed' ? 'Checks passed' : 'Checks failed'));
  if (task.status === 'pr_ready' && Number.isSafeInteger(task.pr_number) && task.pr_number > 0) {
    const link = node('a', `Open pull request #${task.pr_number}`);
    link.href = `https://github.com/enaz333/zane-websites/pull/${task.pr_number}`;
    row.append(link);
  }
  if (['submitted', 'queued'].includes(task.status)) {
    const cancel = node('button', 'Cancel request');
    cancel.type = 'button';
    cancel.className = 'quiet';
    cancel.addEventListener('click', async () => {
      cancel.disabled = true;
      notice.textContent = '';
      try {
        const { task: updated } = await api(`/api/tasks/${task.id}/cancel`, { method: 'POST' });
        row.replaceWith(taskRow(updated));
        $('#activity-heading').tabIndex = -1;
        $('#activity-heading').focus();
        notice.textContent = 'Request cancelled.';
      } catch (err) {
        cancel.disabled = false;
        notice.textContent = err.message;
      }
    });
    row.append(cancel);
  }
  return row;
}

async function loadHistory(append = false) {
  if (loading) {
    if (!append) reloadHistory = true;
    return;
  }
  loading = true;
  more.disabled = refresh.disabled = true;
  if (!append && !history.children.length) empty.textContent = 'Loading requests…';
  try {
    const { tasks, next: cursor } = await api('/api/tasks' + (append && next ? `?before=${next}` : ''));
    if (!append) history.replaceChildren();
    history.append(...tasks.map(taskRow));
    empty.textContent = history.children.length ? '' : 'No requests yet. Use Edit or Add New to save your first one.';
    next = cursor;
    more.hidden = !next;
  } catch (err) {
    empty.textContent = `Could not load requests. ${err.message}`;
  } finally {
    loading = false;
    more.disabled = refresh.disabled = false;
    if (reloadHistory) {
      reloadHistory = false;
      loadHistory();
    }
  }
}
refresh.addEventListener('click', () => loadHistory());
more.addEventListener('click', () => loadHistory(true));

for (const form of forms) {
  let pending;
  form.addEventListener('submit', async event => {
    event.preventDefault();
    const submit = form.querySelector('button');
    if (submit.disabled) return;
    const values = Object.fromEntries(new FormData(form));
    const body = JSON.stringify({
      ...values, kind: form.dataset.kind === 'edit' ? 'edit' : values.kind, asap: values.asap === 'on',
    });
    if (pending?.body !== body) pending = { body, key: crypto.randomUUID() };
    submit.disabled = true;
    notice.textContent = 'Saving request…';
    try {
      await api('/api/tasks', {
        method: 'POST', body,
        headers: { 'Content-Type': 'application/json', 'Idempotency-Key': pending.key },
      });
      pending = null;
      form.reset();
      syncProject();
      notice.textContent = 'Request saved.';
      if (currentTab() === '#activity') loadHistory();
      else location.hash = '#activity';
    } catch (err) {
      notice.textContent = err.message;
    } finally {
      submit.disabled = false;
    }
  });
}

selectTab();
loadProjects();

// Only the loopback entry point advertises the local builder.
api('/api/builder').then(({ local_url }) => {
  if (local_url !== 'http://127.0.0.1:8794/' || location.origin !== 'http://127.0.0.1:8793') return;
  const link = document.createElement('a');
  link.href = local_url;
  link.textContent = 'Projects (local)';
  document.querySelector('.tabs').append(link);
}).catch(() => {});
