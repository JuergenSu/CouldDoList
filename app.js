'use strict';

const get = (id) => document.getElementById(id);
const createDialog = get('create-dialog');
const taskDialog = get('task-dialog');
const createForm = get('create-form');
const commentForm = get('comment-form');
const dateFormat = new Intl.DateTimeFormat('de-DE', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'UTC' });
const commentFormat = new Intl.DateTimeFormat('de-DE', { dateStyle: 'medium', timeStyle: 'short' });
let lists = [];
let listId = new URL(location.href).searchParams.get('liste');
let taskId;
let updating = false;
let loaded = false;

function node(tag, className, text) {
  const element = document.createElement(tag);
  if (className) element.className = className;
  if (text !== undefined) element.textContent = text;
  return element;
}

function button(label, className, action) {
  const element = node('button', className, label);
  element.type = 'button';
  element.addEventListener('click', action);
  return element;
}

function dateLabel(value) {
  return dateFormat.format(new Date(value + 'T00:00:00Z'));
}

function calendarDate() {
  const now = new Date();
  return [now.getFullYear(), now.getMonth() + 1, now.getDate()].map((part) => String(part).padStart(2, '0')).join('-');
}

function time(value) {
  const element = node('time', '', dateLabel(value));
  element.dateTime = value;
  return element;
}

function showError(element, message = '') {
  element.textContent = message;
  element.hidden = !message;
}

async function api(payload) {
  const response = await fetch('api.php', payload ? {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  } : { cache: 'no-store' });
  const result = await response.json().catch(() => null);
  if (!response.ok || !result) throw new Error(result?.error || 'Verbindung zum Datenspeicher fehlgeschlagen.');
  return result.lists;
}

function selectList(id) {
  listId = id;
  const url = new URL(location.href);
  url.searchParams.set('liste', id);
  history.replaceState(null, '', url);
  render();
}

function completion(list) {
  const done = list.tasks.filter((task) => task.done).length;
  const percent = list.tasks.length ? Math.round(done / list.tasks.length * 100) : 0;
  return { done, percent };
}

function render() {
  const list = lists.find((entry) => entry.id === listId) || lists[0];
  listId = list?.id;
  const nav = get('lists');
  nav.replaceChildren();
  for (const entry of lists) {
    const item = button('', 'list-link', () => selectList(entry.id));
    if (entry.id === listId) item.setAttribute('aria-current', 'true');
    const summary = node('span', 'list-summary');
    summary.append(time(entry.date), node('span', '', completion(entry).percent + ' % erledigt'));
    item.append(node('strong', '', entry.title), summary);
    nav.append(item);
  }
  const content = get('content');
  content.replaceChildren();
  if (!list) {
    const empty = node('section', 'empty');
    empty.append(node('h1', '', 'Alles bereit für deine erste Liste'), node('p', '', 'Lege ein Ereignis mit Zieltermin an und plane die Aufgaben bis dahin.'),
      button('+ Neue Liste', 'primary', () => openCreate('createList')));
    content.append(empty);
    return;
  }

  const { done, percent } = completion(list);
  const hero = node('section', 'hero');
  const event = node('p', 'event');
  event.append(document.createTextNode(list.event + ' · '), time(list.date));
  const progress = node('progress');
  progress.max = 100;
  progress.value = percent;
  progress.setAttribute('aria-label', 'Erledigte Aufgaben in Prozent');
  const progressText = node('div', 'progress-text');
  progressText.append(node('span', '', done + ' von ' + list.tasks.length + ' Aufgaben erledigt'), node('strong', '', percent + ' %'));
  hero.append(event, node('h1', '', list.title), progressText, progress);

  const heading = node('div', 'timeline-head');
  const addTask = button('+ Neue Aufgabe', 'primary', () => openCreate('createTask'));
  addTask.id = 'new-task';
  heading.append(node('h2', '', 'Zeitplan'), addTask);
  const timeline = node('ol', 'timeline');
  const entries = [
    ...list.tasks.map((task) => ({ date: task.date, task })),
    { date: list.date },
  ].sort((a, b) => a.date.localeCompare(b.date));
  let lastDate;
  const today = calendarDate();
  for (const entry of entries) {
    const row = node('li', 'timeline-row');
    if (entry.date !== lastDate) {
      row.append(time(entry.date));
      lastDate = entry.date;
    }
    const task = entry.task;
    if (!task) {
      const milestone = node('div', 'milestone');
      milestone.append(node('span', '', 'Zieltermin'), node('strong', '', list.event));
      row.append(milestone);
    } else {
      const item = button('', 'task' + (task.done ? ' done' : ''), () => openTask(task.id));
      const mark = node('span', 'mark', task.done ? '✓' : '○');
      mark.setAttribute('aria-hidden', 'true');
      const words = node('span', 'task-words');
      words.append(node('strong', '', task.title), node('span', !task.done && task.date < today ? 'late' : 'meta',
        (task.done ? 'Erledigt' : task.date < today ? 'Überfällig' : 'Offen') + ' · ' +
        task.comments.length + (task.comments.length === 1 ? ' Kommentar' : ' Kommentare')));
      item.id = 'task-' + task.id;
      item.append(mark, words);
      row.append(item);
    }
    timeline.append(row);
  }
  content.append(hero, heading, timeline);
}

function input(labelText, type, max, value = '') {
  const label = node('label', '', labelText);
  const control = node(type === 'textarea' ? 'textarea' : 'input');
  if (type === 'textarea') control.rows = 4;
  else control.type = type;
  if (max) control.maxLength = max;
  control.name = labelText;
  control.required = true;
  control.value = value;
  label.append(control);
  return label;
}

function openCreate(action) {
  if (!loaded || updating) return;
  const isList = action === 'createList';
  createForm.dataset.action = action;
  get('create-title').textContent = isList ? 'Neue Liste' : 'Neue Aufgabe';
  get('fields').replaceChildren(...(isList ? [
    input('Liste', 'text', 100), input('Ereignis', 'text', 100), input('Datum', 'date'),
  ] : [
    input('Aufgabe', 'text', 120), input('Beschreibung', 'textarea', 3000),
    input('Datum', 'date', null, lists.find((list) => list.id === listId).date),
  ]));
  showError(createForm.querySelector('.form-error'));
  createDialog.showModal();
}

function drawTask() {
  const task = lists.find((list) => list.id === listId).tasks.find((entry) => entry.id === taskId);
  get('task-title').textContent = task.title;
  const detail = get('task-detail');
  const when = node('p', 'meta');
  when.append(document.createTextNode((task.done ? 'Erledigt · ' : 'Fällig · ')), time(task.date));
  const toggle = button(task.done ? 'Wieder öffnen' : 'Als erledigt markieren', 'secondary', () => {
    save({ action: 'setDone', listId, taskId, done: !task.done }, toggle, get('task-error'), () => {
      drawTask();
      get('task-toggle').focus();
    });
  });
  toggle.id = 'task-toggle';
  const error = node('p', 'form-error');
  error.id = 'task-error';
  error.hidden = true;
  error.setAttribute('role', 'alert');
  detail.replaceChildren(when, node('p', 'description', task.description), toggle, error);
  const comments = get('comments');
  comments.replaceChildren();
  if (!task.comments.length) comments.append(node('p', 'meta', 'Noch keine Kommentare.'));
  for (const comment of task.comments) {
    const article = node('article', 'comment');
    const head = node('div', 'comment-head');
    const stamp = node('time', '', commentFormat.format(new Date(comment.createdAt)));
    stamp.dateTime = comment.createdAt;
    head.append(node('strong', '', comment.author), stamp);
    article.append(head, node('p', '', comment.text));
    comments.append(article);
  }
}

function openTask(id) {
  taskId = id;
  commentForm.reset();
  showError(commentForm.querySelector('.form-error'));
  drawTask();
  taskDialog.showModal();
}

async function save(payload, trigger, error, after) {
  if (updating) return;
  updating = true;
  trigger.disabled = true;
  showError(error);
  try {
    lists = await api(payload);
    after();
  } catch (failure) {
    showError(error, failure.message);
  } finally {
    trigger.disabled = false;
    updating = false;
  }
}

createForm.addEventListener('submit', (event) => {
  event.preventDefault();
  const action = createForm.dataset.action;
  const payload = { ...Object.fromEntries(new FormData(createForm)), action, listId };
  save(payload, event.submitter, createForm.querySelector('.form-error'), () => {
    createDialog.close();
    if (action === 'createList') selectList(lists.at(-1).id);
    else render();
    get(action === 'createList' ? 'new-list' : 'new-task').focus();
  });
});

commentForm.addEventListener('submit', (event) => {
  event.preventDefault();
  save({ ...Object.fromEntries(new FormData(commentForm)), action: 'comment', listId, taskId },
    event.submitter, commentForm.querySelector('.form-error'), () => {
      commentForm.elements.Kommentar.value = '';
      drawTask();
      commentForm.elements.Kommentar.focus();
    });
});

get('new-list').addEventListener('click', () => openCreate('createList'));
taskDialog.addEventListener('close', () => {
  render();
  get('task-' + taskId)?.focus();
});
for (const dialog of [createDialog, taskDialog]) {
  dialog.querySelector('.close').addEventListener('click', () => {
    if (!updating) dialog.close();
  });
  dialog.addEventListener('cancel', (event) => {
    if (updating) event.preventDefault();
  });
}

async function load() {
  get('new-list').disabled = true;
  showError(get('error'));
  try {
    lists = await api();
    loaded = true;
    get('new-list').disabled = false;
    render();
  } catch (failure) {
    showError(get('error'), failure.message);
    get('content').replaceChildren(button('Erneut laden', 'secondary', load));
  }
}
load();
