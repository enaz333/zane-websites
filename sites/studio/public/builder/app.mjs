const form = document.querySelector('form');
const status = document.querySelector('#status');
const projects = document.querySelector('#projects');
let requestId = crypto.randomUUID();
form.addEventListener('input', () => { requestId = crypto.randomUUID(); });
form.elements.slug.addEventListener('input', () => { form.elements.parent.value = '0'; });
async function refresh() {
  const response = await fetch('/api/projects');
  if (!response.ok) throw new Error('Project list unavailable');
  const data = await response.json();
  projects.replaceChildren();
  for (const project of data) {
    const spec = JSON.parse(project.specification);
    const card = document.createElement('article');
    const heading = document.createElement('h2');
    heading.textContent = spec.name;
    const description = document.createElement('p');
    description.textContent = spec.description;
    const state = document.createElement('p');
    state.textContent = 'Version ' + project.version + ' · /' + spec.slug;
    const edit = document.createElement('button');
    edit.textContent = 'Continue project';
    edit.onclick = () => {
      for (const field of ['slug','name','description']) form.elements[field].value = spec[field];
      form.elements.parent.value = project.version;
      form.elements.template.value = spec.template || 'collection';
      requestId = crypto.randomUUID();
      form.elements.description.focus();
    };
    card.append(heading, description, state, edit);
    if (project.version) {
      const preview = document.createElement('a');
      preview.textContent = 'Open version preview';
      preview.href = 'http://127.0.0.1:8795/' + spec.slug + '/' + project.version + '/index.html';
      preview.target = '_blank';
      preview.rel = 'noopener noreferrer';
      card.append(document.createElement('br'), preview);
    }
    for (const run of project.runs) {
      const detail = document.createElement('p');
      detail.textContent = 'From version ' + run.parent + ' · ' + run.created_at + ' · ' + run.state + (run.diagnostic ? ' · ' + run.diagnostic : '');
      card.append(detail);
      const message = document.createElement('p');
      message.textContent = run.message || 'Initial specification';
      card.append(message);
      if (run.state === 'review_ready') {
        const link = document.createElement('a');
        link.href = 'http://127.0.0.1:8795/' + spec.slug + '/' + (run.parent + 1) + '/index.html';
        link.textContent = 'Preview version ' + (run.parent + 1);
        link.target = '_blank';
        link.rel = 'noopener noreferrer';
        const restore = document.createElement('button');
        restore.textContent = 'Use version ' + (run.parent + 1) + ' specification';
        restore.onclick = () => {
          const prior = JSON.parse(run.request);
          for (const field of ['slug','name','description']) form.elements[field].value = prior[field];
          form.elements.template.value = prior.template || 'collection';
          form.elements.parent.value = project.version;
          form.elements.message.value = 'Restore specification from version ' + (run.parent + 1);
          requestId = crypto.randomUUID();
          form.elements.message.focus();
        };
        card.append(link, restore);
      }
    }
    projects.append(card);
  }
}
form.onsubmit = async event => {
  event.preventDefault();
  const button = form.querySelector('button');
  button.disabled = true;
  status.textContent = 'Submitting fixture build…';
  try {
    const data = new FormData(form);
    const response = await fetch('/api/build', {method:'POST',headers:{'Content-Type':'application/json'},
      body:JSON.stringify({request_id:requestId,parent:Number(data.get('parent')),message:data.get('message'),specification:{
        slug:data.get('slug'),name:data.get('name'),description:data.get('description'),template:data.get('template'),capabilities:['interactive']}})});
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || 'Build unavailable');
    status.textContent = result.state + (result.diagnostic ? ' · ' + result.diagnostic : '');
    if (result.state === 'review_ready') {
      form.elements.parent.value = Number(data.get('parent')) + 1;
      requestId = crypto.randomUUID();
    }
    await refresh();
  } catch(error) { status.textContent = error.message; }
  finally { button.disabled = false; }
};
refresh().catch(error => {status.textContent = error.message;});
