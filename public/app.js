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

// ── HTML escape (XSS guard) ────────────
// Model replies + user-entered titles are untrusted. Escape before innerHTML.
function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
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
    <li data-id="${escapeHtml(t.id)}" class="${currentThread?.id === t.id ? 'active' : ''}">
      ${escapeHtml(t.title || '未命名线程')}
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
  startPolling(); // auto-refresh new messages (e.g. chain-invoke replies)
}

// ── Live polling (auto-refresh without manual reload) ──
let pollTimer = null;
let lastMsgCount = 0;
let isInvoking = false; // true while a dog is "thinking" — pause poll re-render
                        // so the thinking bubble isn't wiped out mid-call

function startPolling() {
  stopPolling();
  // Don't reset lastMsgCount — selectThread already ran loadMessages() which set
  // it to the current count. Resetting to 0 would force a spurious re-render (and
  // scroll-to-bottom, interrupting history reading) on the very first poll.
  // Poll every 3s; only re-render when the message count actually changed.
  pollTimer = setInterval(pollOnce, 3000);
}

function stopPolling() {
  if (pollTimer) { clearInterval(pollTimer); pollTimer = null; }
}

async function pollOnce() {
  if (!currentThread) return;
  if (isInvoking) return;  // a dog is thinking — don't repaint over its bubble
  try {
    const msgs = await api(`/messages?threadId=${currentThread.id}&limit=50`);
    if (msgs.length !== lastMsgCount) {
      lastMsgCount = msgs.length;
      await loadMessages();
      await loadBallState();
    }
  } catch { /* transient error — keep polling */ }
}

// ── Messages ───────────────────────────
async function loadMessages() {
  if (!currentThread) return;
  const msgs = await api(`/messages?threadId=${currentThread.id}&limit=50`);
  lastMsgCount = msgs.length; // keep poll baseline in sync to avoid a redundant refresh
  const container = document.getElementById('chatMessages');
  if (!msgs.length) {
    container.innerHTML = '<div class="chat-empty">发送第一条消息开始对话 🐾</div>';
    const bar = document.getElementById('chainOverview');
    if (bar) bar.innerHTML = '';
    return;
  }
  container.innerHTML = msgs.map(renderMsg).join('');
  container.scrollTop = container.scrollHeight;
  renderChainOverview(msgs);
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

  // Ball-pass trace: reconstruct "who got passed the ball" from the @mention
  // in this dog's own reply (data source is the persisted message, not the
  // lossy chainInvokes field — survives refresh).
  let ballAction = '';
  if (isDog) {
    const target = firstMentionedDog(m.content);
    if (target && target !== m.dogId) {
      const tgt = DOGS[target];
      ballAction = `<div class="ball-action" style="--dog-color:${tgt.color};--dog-bg:${hexToRGBA(tgt.color,0.14)}">
        🐾 传球给 <strong>${tgt.name}</strong></div>`;
    }
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

// Return the dogId of the first LINE-START @mention (a real ball pass), or null.
// Must match the same rule as the backend (parseResponse: /^\s*-?\s*@/) and
// highlightMentions — a mid-sentence @ is just "mentioning", not a pass, so it
// must NOT trigger a ball-pass badge. Reconstructed from the persisted message
// (not the non-persisted chainPath) so the badge survives a page refresh.
function firstMentionedDog(text) {
  const map = { '@牧哥':'collie', '@边牧':'collie', '@短腿':'corgi', '@柯基':'corgi', '@铁铁':'gsd', '@德牧':'gsd' };
  for (const line of text.split('\n')) {
    const lead = line.match(/^(\s*-?\s*)(@\S+)/); // line-start @ only (mirrors backend)
    if (!lead) continue;
    for (const [pat, dogId] of Object.entries(map)) {
      if (lead[2].startsWith(pat)) return dogId;
    }
  }
  return null;
}

// ── Chain overview (协作链概览) ────────
// Walk the message timeline, build the sequence of dogs the ball flowed
// through. Render as a node→arrow→node track at the top of the chat.
function renderChainOverview(msgs) {
  const bar = document.getElementById('chainOverview');
  if (!bar) return;
  // Collect dog speakers in order (collapse immediate repeats)
  const chain = [];
  for (const m of msgs) {
    if (m.dogId && DOGS[m.dogId]) {
      if (chain[chain.length - 1] !== m.dogId) chain.push(m.dogId);
    }
  }
  if (chain.length < 2) { bar.innerHTML = ''; return; }  // need a real chain

  let html = '<span class="chain-label">🔗 协作链</span>';
  chain.forEach((dogId, i) => {
    const dog = DOGS[dogId];
    html += `<span class="chain-node" style="--chain-color:${dog.color};--chain-bg:${hexToRGBA(dog.color,0.12)};animation-delay:${i*0.08}s">
      <span class="node-dot" style="background:${dog.color}">${dog.name[0]}</span>${dog.name}</span>`;
    if (i < chain.length - 1) {
      html += `<span class="chain-arrow"><span class="rolling-ball" style="animation-delay:${i*0.08+0.2}s"></span></span>`;
    }
  });
  bar.innerHTML = html;
}

function hexToRGBA(hex, alpha) {
  const r = parseInt(hex.slice(1,3), 16);
  const g = parseInt(hex.slice(3,5), 16);
  const b = parseInt(hex.slice(5,7), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}

function highlightMentions(text) {
  const patterns = { '@牧哥':'collie', '@边牧':'collie', '@短腿':'corgi', '@柯基':'corgi', '@铁铁':'gsd', '@德牧':'gsd' };
  // WYSIWYG with the backend: only a LINE-START @ is a real ball-pass
  // (backend parseResponse uses /^\s*-?\s*@/). A mid-sentence @ is just the dog
  // *mentioning* a teammate ("确认后我 @柯基 来定视觉"), not passing the ball —
  // so it stays plain text. This way a colored @ badge always means a real pass.
  // Escape FIRST (untrusted model output), then highlight per-line.
  return text.split('\n').map(line => {
    const escaped = escapeHtml(line);
    // Does this line START with an @mention? (optional leading space / list dash)
    const lead = line.match(/^(\s*-?\s*)(@\S+)/);
    if (!lead) return escaped;  // no line-start @ → plain text, no highlight
    // Highlight only the line-start mention; mid-line @ stays plain.
    for (const [pat, dogId] of Object.entries(patterns)) {
      if (lead[2].startsWith(pat)) {
        const prefix = escapeHtml(lead[1]);
        const rest = escapeHtml(line.slice(lead[1].length + pat.length));
        return `${prefix}<span class="mention" style="--dog-color:${DOGS[dogId].color}">${pat}</span>${rest}`;
      }
    }
    return escaped;  // line-start @ but not a known dog → plain text
  }).join('\n');
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

    // Route to @mentioned dogs. If nobody is @mentioned, the architect
    // (牧哥/collie) is the default greeter so a bare request never goes unanswered.
    const mentionedDogs = parseMentions(content);
    const targets = mentionedDogs.length ? mentionedDogs : ['collie'];
    for (const dogId of targets) {
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
  isInvoking = true;    // pause poll re-render so it won't wipe the thinking bubble
  showThinking(dogId);  // real model has latency — show "思考中" feedback
  showChainProgress(0); // "协作进行中…" banner — backend may run a whole chain in one call
  try {
    const result = await api('/a2a/invoke', {
      method: 'POST',
      body: JSON.stringify({ threadId: currentThread.id, dogId, autoRespond: true }),
    });
    // Backend runs the full chain in one call; reflect the real hop count.
    const hops = Array.isArray(result.chainInvokes) ? result.chainInvokes.length : 0;
    if (hops > 0) {
      // A chain actually formed — briefly show "回答中" for the relay + hop count.
      const lastHop = result.chainInvokes[hops - 1];
      const relayId = lastHop?.dogId;
      if (relayId && DOGS[relayId]) showThinking(relayId, 'answering');
      showChainProgress(hops);
      await sleep(700);  // let the user register the chain happened
    }
    if (result.response) toast(`${DOGS[dogId].name} 回复了！`, 'success');
    await loadMessages();
    await loadBallState();
  } catch (e) {
    clearThinking();  // on error, loadMessages won't run — clear manually
  } finally {
    isInvoking = false;     // re-enable polling once this dog is done
    hideChainProgress();
  }
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

// ── Thinking / answering indicator ─────
// phase: 'thinking' (刚唤醒，模型生成中) | 'answering' (链式接力，正在回答)
function showThinking(dogId, phase = 'thinking') {
  const dog = DOGS[dogId];
  if (!dog) return;
  const container = document.getElementById('chatMessages');
  // Remove the "empty" placeholder if present
  const empty = container.querySelector('.chat-empty');
  if (empty) empty.remove();
  clearThinking();  // never stack two bubbles
  const label = phase === 'answering' ? '回答中' : '思考中';
  const el = document.createElement('div');
  el.className = 'msg dog thinking';
  el.id = 'thinkingBubble';
  el.style.setProperty('--dog-color', dog.color);
  el.style.setProperty('--dog-bg', hexToRGBA(dog.color, 0.12));
  el.innerHTML = `
    <div class="msg-meta">
      <span class="msg-avatar-mini" style="background:${dog.color}">${dog.name[0]}</span>
      <strong style="color:${dog.color}">${dog.name}</strong>
      <span class="msg-phase ${phase}" style="--dog-color:${dog.color}">${label}…</span>
    </div>
    <div class="msg-bubble"><span class="typing"><span class="dot"></span><span class="dot"></span><span class="dot"></span></span></div>`;
  container.append(el);
  container.scrollTop = container.scrollHeight;
}

function clearThinking() {
  const el = document.getElementById('thinkingBubble');
  if (el) el.remove();
}

// ── Chain-in-progress banner ───────────
// Long chains take a while; tell the user "协作还在进行，别以为卡住了".
function showChainProgress(hops) {
  const bar = document.getElementById('chainProgress');
  if (!bar) return;
  const txt = bar.querySelector('.cp-text');
  txt.innerHTML = hops > 0
    ? `协作链进行中 · 已传球 <span class="cp-hops">${hops}</span> 跳…`
    : '协作进行中…';
  bar.classList.add('active');
}

function hideChainProgress() {
  const bar = document.getElementById('chainProgress');
  if (bar) bar.classList.remove('active');
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

// ── Quick invoke buttons + dog cards ───
function setupQuickInvokes() {
  const invoke = async (dogId) => {
    if (!currentThread) { toast('请先选择或创建线程', 'error'); return; }
    await invokeDog(dogId);
  };
  document.querySelectorAll('.invoke-btn').forEach(btn => {
    btn.onclick = () => invoke(btn.dataset.dog);
  });
  // Dog cards in sidebar are also clickable to summon
  document.querySelectorAll('.dog-card').forEach(card => {
    card.onclick = () => invoke(card.dataset.dog);
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