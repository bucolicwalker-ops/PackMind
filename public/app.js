const API = 'http://localhost:3100/api';
const DOGS = {
  collie: { name: '牧哥', color: '#E8A87C', role: '主架构师' },
  corgi:  { name: '短腿', color: '#F6D365', role: '设计师' },
  gsd:    { name: '铁铁', color: '#8590A6', role: '纪律守护' },
};

let currentThread = null;
let threads = [];

// ── API helpers ────────────────────────
async function api(path, opts = {}) {
  try {
    const res = await fetch(API + path, {
      headers: { 'Content-Type': 'application/json' },
      ...opts,
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || data.message || `HTTP ${res.status}`);
    return data;
  } catch (e) {
    toast(e.message, 'error');
    throw e;
  }
}

// ── Toast ──────────────────────────────
function toast(msg, type = 'success') {
  const el = document.createElement('div');
  el.className = `toast ${type}`;
  el.textContent = msg;
  document.getElementById('toastContainer').append(el);
  setTimeout(() => el.remove(), 3000);
}

// ── Thread list ────────────────────────
async function loadThreads() {
  threads = await api('/threads');
  const list = document.getElementById('threadList');
  if (!threads.length) {
    list.innerHTML = '<li class="thread-empty">暂无线程，点击 + 创建</li>';
    return;
  }
  list.innerHTML = threads.map(t => `
    <li data-id="${t.id}" class="${currentThread?.id === t.id ? 'active' : ''}">
      ${t.title || '未命名线程'}
      <br><span class="thread-time">${fmtTime(t.lastActiveAt)}</span>
    </li>
  `).join('');
  list.querySelectorAll('li[data-id]').forEach(li => {
    li.onclick = () => selectThread(li.dataset.id);
  });
}

function fmtTime(ts) {
  const d = new Date(ts);
  return `${d.getMonth()+1}/${d.getDate()} ${d.getHours()}:${String(d.getMinutes()).padStart(2,'0')}`;
}

async function selectThread(id) {
  currentThread = threads.find(t => t.id === id);
  document.getElementById('chatHeader').querySelector('.chat-title').textContent =
    currentThread?.title || '未命名线程';
  document.getElementById('btnSend').disabled = false;
  await loadMessages();
  await loadBallState();
  loadThreads(); // refresh active state
}

// ── Messages ───────────────────────────
async function loadMessages() {
  if (!currentThread) return;
  const msgs = await api(`/messages?threadId=${currentThread.id}&limit=50`);
  const container = document.getElementById('chatMessages');
  if (!msgs.length) {
    container.innerHTML = '<div class="chat-empty">发送第一条消息开始对话 🐾</div>';
    return;
  }
  container.innerHTML = msgs.map(renderMsg).join('');
  container.scrollTop = container.scrollHeight;
}

function renderMsg(m) {
  const isDog = m.dogId && DOGS[m.dogId];
  const dog = isDog ? DOGS[m.dogId] : null;
  const cls = isDog ? 'dog' : 'human';
  const avatarChar = isDog ? dog.name[0] : '你';
  const avatarBg = isDog ? dog.color : '#4ECDC4';
  const dogBg = isDog ? hexToRGBA(dog.color, 0.12) : 'rgba(78,205,196,0.15)';
  const content = highlightMentions(m.content);
  const time = fmtTime(m.timestamp);

  let ballAction = '';
  if (isDog && (m.content.includes('传球给') || m.content.includes('传给'))) {
    ballAction = `<div class="ball-action">⚡ 球权转移</div>`;
  }

  return `<div class="msg ${cls}" style="--dog-color:${dog?.color || '#4ECDC4'};--dog-bg:${dogBg}">
    <div class="msg-meta">
      <span class="msg-avatar-mini" style="background:${avatarBg}">${avatarChar}</span>
      <strong style="color:${dog?.color || '#4ECDC4'}">${isDog ? dog.name : '铲屎官'}</strong>
      <span>${time}</span>
    </div>
    <div class="msg-bubble">${content}</div>
    ${ballAction}
  </div>`;
}

function hexToRGBA(hex, alpha) {
  const r = parseInt(hex.slice(1,3), 16);
  const g = parseInt(hex.slice(3,5), 16);
  const b = parseInt(hex.slice(5,7), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}

function highlightMentions(text) {
  const patterns = { '@牧哥':'collie', '@边牧':'collie', '@短腿':'corgi', '@柯基':'corgi', '@铁铁':'gsd', '@德牧':'gsd' };
  let result = text;
  for (const [pat, dogId] of Object.entries(patterns)) {
    result = result.replace(new RegExp(pat, 'g'), `<span class="mention" style="--dog-color:${DOGS[dogId].color}">${pat}</span>`);
  }
  return result;
}

// ── Send message ───────────────────────
async function sendMessage() {
  if (!currentThread) return;
  const input = document.getElementById('messageInput');
  const content = input.value.trim();
  if (!content) return;

  input.value = '';  // Clear immediately before async work

  try {
    await api('/messages', {
      method: 'POST',
      body: JSON.stringify({ content, threadId: currentThread.id }),
    });

    const mentionedDogs = parseMentions(content);
    for (const dogId of mentionedDogs) {
      await invokeDog(dogId);
    }

    await loadMessages();
    await loadBallState();
  } finally {
    // Safety net: ensure input is cleared even on error
    input.value = '';
    input.focus();
  }
}

function parseMentions(text) {
  const map = { '@牧哥':'collie', '@边牧':'collie', '@短腿':'corgi', '@柯基':'corgi', '@铁铁':'gsd', '@德牧':'gsd' };
  const found = [];
  for (const [pat, dogId] of Object.entries(map)) {
    if (text.includes(pat) && !found.includes(dogId)) found.push(dogId);
  }
  return found;
}

// ── Invoke dog ─────────────────────────
async function invokeDog(dogId) {
  if (!currentThread) return;
  try {
    const result = await api('/a2a/invoke', {
      method: 'POST',
      body: JSON.stringify({ threadId: currentThread.id, dogId, autoRespond: true }),
    });
    if (result.response) toast(`${DOGS[dogId].name} 回复了！`, 'success');
    await loadMessages();
    await loadBallState();
  } catch (e) { /* toast already shown */ }
}

// ── Ball state ─────────────────────────
async function loadBallState() {
  if (!currentThread) return;
  try {
    const state = await api(`/a2a/ball-state/${currentThread.id}`);
    const indicator = document.getElementById('ballIndicator');
    if (state.holder) {
      const dog = DOGS[state.holder] || { name: state.holderName || state.holder, color: '#8590A6' };
      indicator.classList.add('active');
      indicator.querySelector('.ball-orb').style.background = dog.color;
      indicator.querySelector('.ball-text').textContent = `${dog.name} 持球`;
    } else {
      indicator.classList.remove('active');
      indicator.querySelector('.ball-orb').style.background = '';
      indicator.querySelector('.ball-text').textContent = '球在地上';
    }
  } catch { /* ignore ball state errors */ }
}

// ── New thread ─────────────────────────
function showNewThreadDialog() {
  document.getElementById('newThreadDialog').showModal();
}

async function createThread(e) {
  e.preventDefault();
  const title = document.getElementById('newThreadTitle').value.trim();
  const thread = await api('/threads', {
    method: 'POST',
    body: JSON.stringify({ title: title || undefined }),
  });
  document.getElementById('newThreadDialog').close();
  document.getElementById('newThreadTitle').value = '';
  toast('线程创建成功！', 'success');
  await loadThreads();
  await selectThread(thread.id);
}

// ── Quick invoke buttons ───────────────
function setupQuickInvokes() {
  document.querySelectorAll('.invoke-btn').forEach(btn => {
    btn.onclick = async () => {
      if (!currentThread) { toast('请先选择线程', 'error'); return; }
      await invokeDog(btn.dataset.dog);
    };
  });
}

// ── Event bindings ─────────────────────
function setupEvents() {
  document.getElementById('btnNewThread').onclick = showNewThreadDialog;
  document.getElementById('newThreadDialog').querySelector('form').onsubmit = createThread;
  document.getElementById('btnCancelThread').onclick = () => document.getElementById('newThreadDialog').close();
  document.getElementById('btnSend').onclick = sendMessage;
  document.getElementById('messageInput').onkeydown = (e) => {
    // Don't send during IME composition (Chinese input)
    if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) { e.preventDefault(); sendMessage(); }
  };
  setupQuickInvokes();
}

// ── Init ───────────────────────────────
async function init() {
  setupEvents();
  await loadThreads();
  // Auto-select first thread if exists
  if (threads.length) await selectThread(threads[0].id);
}

init();