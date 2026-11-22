'use strict';

const get = (id) => document.getElementById(id);
const createDialog = get('create-dialog');
const taskDialog = get('task-dialog');
const createForm = get('create-form');
const commentForm = get('comment-form');
const commentName = commentForm.elements.Name;
const editCommentName = get('edit-comment-name');
const nameForm = get('name-form');
const sidebarName = get('sidebar-name');
const editSidebarName = get('edit-sidebar-name');
const saveSidebarName = get('save-sidebar-name');
const nameCookie = 'coulddolist_comment_name';
const millisecondsPerDay = 86_400_000;
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

function daysUntilLabel(date, today) {
  const days = (Date.parse(date) - Date.parse(today)) / millisecondsPerDay;
  if (days < 0) return 'Zieltermin vorbei';
  if (days === 0) return 'Heute';
  return days === 1 ? 'Noch 1 Tag' : 'Noch ' + days + ' Tage';
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

function cover(filename) {
  const image = node('img', 'cover');
  image.src = 'images/' + filename + '.webp';
  image.alt = '';
  image.decoding = 'async';
  return image;
}

function render() {
  const today = calendarDate();
  const list = lists.find((entry) => entry.id === listId) || lists[0];
  listId = list?.id;
  const nav = get('lists');
  nav.replaceChildren();
  for (const entry of lists) {
    const item = button('', 'list-link', () => selectList(entry.id));
    if (entry.id === listId) item.setAttribute('aria-current', 'true');
    const summary = node('span', 'list-summary');
    const metrics = node('span', 'list-metrics');
    metrics.append(node('span', '', completion(entry).percent + ' % erledigt'),
      node('span', '', daysUntilLabel(entry.date, today)));
    summary.append(time(entry.date), metrics);
    const details = node('span', 'list-details');
    details.append(node('strong', '', entry.title), summary);
    const glyph = node('span', 'list-glyph');
    glyph.setAttribute('aria-hidden', 'true');
    item.append(glyph, details);
    nav.append(item);
  }
  const content = get('content');
  content.replaceChildren();
  if (!list) {
    const empty = node('section', 'overview empty');
    const copy = node('div', 'overview-copy');
    copy.append(node('h1', '', 'Deine erste Liste'), node('p', '', 'Lege ein Ereignis mit Zieltermin an und plane die Aufgaben bis dahin.'),
      button('+ Neue Liste', 'primary', () => openCreate('createList')));
    empty.append(copy, cover('list-start'));
    content.append(empty);
    return;
  }

  const { done, percent } = completion(list);
  const hero = node('section', 'overview hero');
  const copy = node('div', 'overview-copy');
  const event = node('p', 'event');
  event.append(node('span', '', list.event), time(list.date));
  const progress = node('progress');
  progress.max = 100;
  progress.value = percent;
  progress.setAttribute('aria-label', 'Erledigte Aufgaben in Prozent');
  const progressText = node('div', 'progress-text');
  const metrics = node('div', 'progress-metrics');
  metrics.append(node('strong', '', percent + ' %'), node('span', '', daysUntilLabel(list.date, today)));
  progressText.append(node('span', '', done + ' von ' + list.tasks.length + ' Aufgaben erledigt'), metrics);
  copy.append(event, node('h1', '', list.title), progressText, progress);
  hero.append(copy, cover('list-plan'));

  const heading = node('div', 'timeline-head');
  const addTask = button('+ Neue Aufgabe', 'primary', () => openCreate('createTask'));
  addTask.id = 'new-task';
  heading.append(node('h2', '', 'Zeitplan'), addTask);
  const timeline = node('ol', 'timeline');
  const sortHint = node('p', 'meta sort-hint', 'Ziehe eine Aufgabe am Griff auf ein Datum oder nutze dort die Pfeiltasten. Das Zieldatum wird zur neuen Fälligkeit.');
  sortHint.id = 'sort-hint';
  let start = today;
  let end = list.date > today ? list.date : today;
  const tasksByDate = new Map();
  for (const task of list.tasks) {
    if (task.date < start) start = task.date;
    if (task.date > end) end = task.date;
    if (!tasksByDate.has(task.date)) tasksByDate.set(task.date, []);
    tasksByDate.get(task.date).push(task);
  }

  const canSort = list.tasks.length > 0 && (start !== end || list.tasks.length > 1);
  // Step through UTC dates so days stay consecutive across daylight saving time changes.
  const endDay = Date.parse(end);
  for (let day = Date.parse(start); day <= endDay; day += millisecondsPerDay) {
    const date = new Date(day).toISOString().slice(0, 10);
    const tasks = tasksByDate.get(date) ?? [];
    const row = node('li', 'timeline-row');
    row.dataset.date = date;

    const label = node('div', date === today ? 'day-label today-label' : 'day-label');
    if (date === today) {
      row.classList.add('timeline-today');
      label.append(node('strong', '', 'Heute'));
    }
    label.append(time(date));
    row.append(label);

    for (const task of tasks) {
      const item = button('', 'task' + (task.done ? ' done' : ''), () => openTask(task.id));
      const mark = node('span', 'mark', task.done ? '✓' : '');
      mark.setAttribute('aria-hidden', 'true');
      const words = node('span', 'task-words');
      words.append(node('strong', '', task.title));
      if (task.description) words.append(node('span', 'task-summary', task.description));
      const properties = node('span', 'task-properties');
      const overdue = !task.done && task.date < today;
      const status = node('span', 'task-status' + (overdue ? ' late' : ''), task.done ? 'Erledigt' : overdue ? 'Überfällig' : 'Offen');
      const comments = node('span', 'meta', task.comments.length + (task.comments.length === 1 ? ' Kommentar' : ' Kommentare'));
      properties.append(status, comments);
      words.append(properties);
      item.id = 'task-' + task.id;
      item.append(mark, words);
      const card = node('div', 'task-card');
      card.dataset.taskId = task.id;
      card.dataset.date = task.date;
      card.append(item);
      if (canSort) {
        const handle = node('button', 'drag-handle secondary', '⠿');
        handle.type = 'button';
        handle.id = 'sort-' + task.id;
        handle.setAttribute('aria-label', 'Aufgabe verschieben: ' + task.title);
        handle.setAttribute('aria-describedby', sortHint.id);
        handle.setAttribute('aria-keyshortcuts', 'ArrowUp ArrowDown');
        card.append(handle);
      }
      row.append(card);
    }

    if (date === list.date) {
      const milestone = node('div', 'milestone');
      const emblem = node('span', 'milestone-emblem', '◎');
      emblem.setAttribute('aria-hidden', 'true');
      const milestoneText = node('div', 'milestone-text');
      milestoneText.append(node('span', '', 'Zieltermin'), node('strong', '', list.event));
      milestone.append(emblem, milestoneText);
      row.append(milestone);
    }
    timeline.append(row);
  }
  content.append(hero, heading);
  if (canSort) {
    content.append(sortHint);
    enableTaskSorting(timeline);
  }
  content.append(timeline);
}

function enableTaskSorting(timeline) {
  let drag;

  function move(source, target, position) {
    const id = source.dataset.taskId;
    const handle = get('sort-' + id);
    const destination = target.dataset.taskId ? { targetId: target.dataset.taskId, position } : { Datum: target.dataset.date };
    save({ action: 'moveTask', listId, taskId: id, ...destination }, handle, get('error'), () => {
      render();
      (get('sort-' + id) || get('task-' + id))?.focus();
      get('status').textContent = source.querySelector('.task-words strong').textContent + ' verschoben. Fällig am ' + dateLabel(target.dataset.date) + '.';
    });
  }

  function markTarget(x, y) {
    drag.target?.classList.remove('drop-before', 'drop-after', 'drop-day');
    const target = document.elementFromPoint(x, y)?.closest('.task-card, .timeline-row');
    drag.target = target && target !== drag.source && timeline.contains(target) ? target : null;
    if (!drag.target) return;
    if (!target.dataset.taskId) {
      target.classList.add('drop-day');
      return;
    }
    const box = target.getBoundingClientRect();
    drag.position = y < box.top + box.height / 2 ? 'before' : 'after';
    target.classList.add('drop-' + drag.position);
  }

  function scrollDuringDrag() {
    if (!timeline.isConnected) return;
    const edge = 64;
    const step = drag.y < edge ? -12 : drag.y > window.innerHeight - edge ? 12 : 0;
    if (step) {
      window.scrollBy(0, step);
      markTarget(drag.x, drag.y);
    }
    drag.frame = requestAnimationFrame(scrollDuringDrag);
  }

  function finish(event, drop = false) {
    if (!drag || drag.pointerId !== event.pointerId) return;
    if (drop && drag.active) markTarget(event.clientX, event.clientY);
    const { source, target, position, frame } = drag;
    drag = null;
    if (frame !== undefined) cancelAnimationFrame(frame);
    source.classList.remove('dragging');
    target?.classList.remove('drop-before', 'drop-after', 'drop-day');
    if (drop && target && timeline.isConnected) move(source, target, position);
  }

  timeline.addEventListener('pointerdown', (event) => {
    const handle = event.target.closest('.drag-handle');
    if (!handle || event.button !== 0 || updating || drag) return;
    drag = { source: handle.closest('.task-card'), pointerId: event.pointerId, x: event.clientX, y: event.clientY };
    handle.setPointerCapture(event.pointerId);
  });
  timeline.addEventListener('pointermove', (event) => {
    if (!drag || drag.pointerId !== event.pointerId) return;
    if (!drag.active) {
      if (Math.hypot(event.clientX - drag.x, event.clientY - drag.y) < 6) return;
      drag.active = true;
      drag.source.classList.add('dragging');
      drag.frame = requestAnimationFrame(scrollDuringDrag);
    }
    drag.x = event.clientX;
    drag.y = event.clientY;
    markTarget(drag.x, drag.y);
  });
  timeline.addEventListener('pointerup', (event) => finish(event, true));
  timeline.addEventListener('lostpointercapture', (event) => finish(event));
  timeline.addEventListener('pointercancel', (event) => finish(event));
  timeline.addEventListener('keydown', (event) => {
    const handle = event.target.closest('.drag-handle');
    if (!handle || updating || drag || !['ArrowUp', 'ArrowDown'].includes(event.key)) return;
    event.preventDefault();
    const source = handle.closest('.task-card');
    const row = source.closest('.timeline-row');
    const up = event.key === 'ArrowUp';
    const sibling = up ? source.previousElementSibling : source.nextElementSibling;
    if (sibling?.dataset.taskId) {
      move(source, sibling, up ? 'before' : 'after');
      return;
    }
    const day = up ? row.previousElementSibling : row.nextElementSibling;
    if (day) move(source, day);
  });
}

function input(labelText, type, max, { value = '', required = true } = {}) {
  const label = node('label', '', required ? labelText : labelText + ' (optional)');
  const control = node(type === 'textarea' ? 'textarea' : 'input');
  if (type === 'textarea') control.rows = 4;
  else control.type = type;
  if (max) control.maxLength = max;
  control.name = labelText;
  control.required = required;
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
    input('Aufgabe', 'text', 120), input('Beschreibung', 'textarea', 3000, { required: false }),
    input('Datum', 'date', null, { value: lists.find((list) => list.id === listId).date }),
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
  detail.replaceChildren(when);
  if (task.description) detail.append(node('p', 'description', task.description));
  detail.append(toggle, error);
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

function savedCommentName() {
  const prefix = nameCookie + '=';
  const cookie = document.cookie.split(';').map((entry) => entry.trim()).find((entry) => entry.startsWith(prefix));
  try {
    return cookie ? decodeURIComponent(cookie.slice(prefix.length)) : '';
  } catch {
    return '';
  }
}

function showName(input, edit, value) {
  input.value = value;
  input.readOnly = Boolean(value);
  edit.hidden = !value;
}

function showSidebarName(value) {
  showName(sidebarName, editSidebarName, value);
  saveSidebarName.hidden = Boolean(value);
}

function startNameEdit(input, edit) {
  input.readOnly = false;
  edit.hidden = true;
  input.focus();
  input.select();
}

function rememberCommentName(value) {
  const maxAge = value ? 31536000 : 0;
  const secure = location.protocol === 'https:' ? '; Secure' : '';
  document.cookie = nameCookie + '=' + encodeURIComponent(value) + '; Max-Age=' + maxAge + '; SameSite=Lax' + secure;
  showName(commentName, editCommentName, value);
  showSidebarName(value);
}

editCommentName.addEventListener('click', () => startNameEdit(commentName, editCommentName));

editSidebarName.addEventListener('click', () => {
  saveSidebarName.hidden = false;
  get('name-status').textContent = '';
  startNameEdit(sidebarName, editSidebarName);
});

nameForm.addEventListener('submit', (event) => {
  event.preventDefault();
  if (sidebarName.readOnly) return;
  const value = sidebarName.value.trim();
  rememberCommentName(value);
  get('name-status').textContent = value ? 'Name gespeichert.' : 'Gespeicherter Name entfernt.';
  (value ? editSidebarName : sidebarName).focus();
});

showSidebarName(savedCommentName());

function openTask(id) {
  taskId = id;
  commentForm.reset();
  showName(commentName, editCommentName, savedCommentName());
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
  const name = commentName.value.trim();
  const payload = { ...Object.fromEntries(new FormData(commentForm)), Name: name, action: 'comment', listId, taskId };
  save(payload, event.submitter, commentForm.querySelector('.form-error'), () => {
    rememberCommentName(name);
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

if (window.isSecureContext && 'serviceWorker' in navigator) {
  navigator.serviceWorker.register('./sw.js').catch((error) => {
    console.error('CouldDoList: Service Worker konnte nicht registriert werden.', error);
  });
}
