/* ═══════════════════════════════════════════
   HACKOS — app.js
   Gemini AI + All Platform Logic
═══════════════════════════════════════════ */

// ════════════════════════════════════════
//  CURSOR
// ════════════════════════════════════════
const cursor    = document.getElementById('cursor');
const cursorDot = document.getElementById('cursor-dot');

document.addEventListener('mousemove', e => {
  cursor.style.left    = e.clientX + 'px';
  cursor.style.top     = e.clientY + 'px';
  cursorDot.style.left = e.clientX + 'px';
  cursorDot.style.top  = e.clientY + 'px';
});
document.addEventListener('mousedown', () => document.body.classList.add('cursor-clicking'));
document.addEventListener('mouseup',   () => document.body.classList.remove('cursor-clicking'));
document.addEventListener('mouseover', e => {
  if (e.target.matches('button,a,input,textarea,select,.sb-item,.qa-btn,.ctf-card,.mode-btn,.pt-cat,.ctf-filter,.pt-chip,.nav-btn'))
    document.body.classList.add('cursor-hovering');
});
document.addEventListener('mouseout', e => {
  if (e.target.matches('button,a,input,textarea,select,.sb-item,.qa-btn,.ctf-card,.mode-btn,.pt-cat,.ctf-filter,.pt-chip,.nav-btn'))
    document.body.classList.remove('cursor-hovering');
});

// ════════════════════════════════════════
//  ADMIN AUTH  (hashed — not plain text)
// ════════════════════════════════════════
// Credentials are SHA-256 hashed — plaintext never stored anywhere
const _AU = '18fd6c2170076f85e3c49dfa6e929596d1e9e0bebcf6ece9d30aaf1ce5cd98ff';
const _AP = 'eafe9f60b9238c85f316e42644ffa57afa34e7c83ffe52b044cd294c04b9de49';

async function _h(str) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(str));
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2,'0')).join('');
}

let adminAuthed = false;

async function adminLogin() {
  const u = document.getElementById('admin-user').value.trim();
  const p = document.getElementById('admin-pass').value;
  const err = document.getElementById('admin-login-err');

  if (!u || !p) { err.textContent = '⚠ Fill in both fields.'; err.style.display='block'; return; }

  const [uh, ph] = await Promise.all([_h(u), _h(p)]);

  if (uh === _AU && ph === _AP) {
    adminAuthed = true;
    document.getElementById('admin-login-screen').style.display = 'none';
    document.getElementById('admin-dashboard').style.display    = 'flex';
    toast('🛡️ Admin access granted!');
  } else {
    err.textContent = '❌ Invalid credentials.';
    err.style.display = 'block';
    document.getElementById('admin-pass').value = '';
    // Shake animation
    const form = document.getElementById('admin-login-form');
    form.classList.add('shake');
    setTimeout(() => form.classList.remove('shake'), 500);
  }
}

function adminLogout() {
  adminAuthed = false;
  document.getElementById('admin-login-screen').style.display = 'flex';
  document.getElementById('admin-dashboard').style.display    = 'none';
  document.getElementById('admin-user').value = '';
  document.getElementById('admin-pass').value = '';
  document.getElementById('admin-login-err').style.display = 'none';
}

// Block inspect on admin panel (makes it harder, not impossible)
document.addEventListener('keydown', e => {
  // Block F12, Ctrl+Shift+I, Ctrl+Shift+J, Ctrl+U
  if (
    e.key === 'F12' ||
    (e.ctrlKey && e.shiftKey && ['I','J','C'].includes(e.key.toUpperCase())) ||
    (e.ctrlKey && e.key.toLowerCase() === 'u')
  ) {
    e.preventDefault();
    toast('⚠ DevTools disabled on this platform.');
    return false;
  }
});
document.addEventListener('contextmenu', e => {
  e.preventDefault();
  toast('⚠ Right-click disabled.');
});

// Detect devtools open (size-based trick)
setInterval(() => {
  if (window.outerWidth - window.innerWidth > 160 || window.outerHeight - window.innerHeight > 160) {
    if (adminAuthed) {
      adminLogout();
      toast('⚠ DevTools detected — logged out for security.');
    }
  }
}, 1000);

// ════════════════════════════════════════
//  STATE
// ════════════════════════════════════════
let credits     = 250;
let currentMode = 'fix';
let ptCategory  = 'Reconnaissance';
let geminiKey   = '';
let ptHistory   = [];

// ════════════════════════════════════════
//  API KEY
// ════════════════════════════════════════
function saveKey() {
  const key = document.getElementById('apikey-input').value.trim();
  if (!key.startsWith('AIza')) {
    alert('⚠ Invalid Gemini key. Should start with "AIza".');
    return;
  }
  geminiKey = key;
  localStorage.setItem('hackos_gk', btoa(key));
  document.getElementById('apikey-overlay').style.display = 'none';
  toast('🔑 API key saved! AI features active.');
}

function toggleKeyVis() {
  const inp = document.getElementById('apikey-input');
  inp.type = inp.type === 'password' ? 'text' : 'password';
}

window.addEventListener('DOMContentLoaded', () => {
  const saved = localStorage.getItem('hackos_gk');
  if (saved) {
    try { geminiKey = atob(saved); } catch(e) {}
    document.getElementById('apikey-overlay').style.display = 'none';
    toast('🔑 API key loaded. Welcome back!');
  }
  renderCTF();
  renderUsers();
  initPtChips();

  // Enter key on admin login
  document.getElementById('admin-pass')?.addEventListener('keydown', e => {
    if (e.key === 'Enter') adminLogin();
  });
});

// ════════════════════════════════════════
//  GEMINI API
// ════════════════════════════════════════
async function callGemini(systemPrompt, userMessage, history = []) {
  if (!geminiKey) {
    document.getElementById('apikey-overlay').style.display = 'flex';
    throw new Error('No API key set');
  }
  const contents = [];
  if (systemPrompt) {
    contents.push({ role:'user',  parts:[{ text: systemPrompt }] });
    contents.push({ role:'model', parts:[{ text: 'Understood.' }] });
  }
  for (const h of history)
    contents.push({ role: h.role === 'assistant' ? 'model' : 'user', parts:[{ text: h.content }] });
  contents.push({ role:'user', parts:[{ text: userMessage }] });

  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${geminiKey}`,
    { method:'POST', headers:{'Content-Type':'application/json'},
      body: JSON.stringify({
        contents,
        generationConfig:{ temperature:0.7, maxOutputTokens:2048 },
        safetySettings:[
          {category:'HARM_CATEGORY_HARASSMENT',        threshold:'BLOCK_ONLY_HIGH'},
          {category:'HARM_CATEGORY_HATE_SPEECH',       threshold:'BLOCK_ONLY_HIGH'},
          {category:'HARM_CATEGORY_SEXUALLY_EXPLICIT', threshold:'BLOCK_ONLY_HIGH'},
          {category:'HARM_CATEGORY_DANGEROUS_CONTENT', threshold:'BLOCK_ONLY_HIGH'},
        ]
      })
    }
  );
  if (!res.ok) {
    const err = await res.json().catch(()=>({}));
    throw new Error(err.error?.message || `HTTP ${res.status}`);
  }
  const data = await res.json();
  if (data.promptFeedback?.blockReason) throw new Error('Blocked: ' + data.promptFeedback.blockReason);
  const c = data.candidates?.[0];
  if (!c) throw new Error('No response from Gemini');
  if (c.finishReason === 'SAFETY') throw new Error('Response blocked by safety filter.');
  return c.content.parts.map(p => p.text||'').join('');
}

// ════════════════════════════════════════
//  PANEL SWITCHING
// ════════════════════════════════════════
function showPanel(id) {
  document.querySelectorAll('.panel').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
  document.querySelectorAll('.sb-item').forEach(b => b.classList.remove('active'));
  document.getElementById('panel-' + id)?.classList.add('active');
  document.getElementById('nav-' + id)?.classList.add('active');
  document.querySelectorAll('.sb-item').forEach(b => {
    if ((b.getAttribute('onclick')||'').includes(`'${id}'`)) b.classList.add('active');
  });
}

// ════════════════════════════════════════
//  CREDITS
// ════════════════════════════════════════
function useCredits(n) {
  credits = Math.max(0, credits - n);
  document.getElementById('top-credits').textContent    = credits;
  document.getElementById('credit-display').textContent = credits;
}
function earnCredits(n) {
  credits += n;
  document.getElementById('top-credits').textContent    = credits;
  document.getElementById('credit-display').textContent = credits;
  toast(`⚡ +${n} credits earned!`);
}

// ════════════════════════════════════════
//  TOAST
// ════════════════════════════════════════
function toast(msg, duration=3000) {
  const c = document.getElementById('toast-container');
  const t = document.createElement('div');
  t.className = 'toast'; t.textContent = msg;
  c.appendChild(t);
  setTimeout(() => { t.style.opacity='0'; t.style.transform='translateY(10px)'; t.style.transition='all .3s'; setTimeout(()=>t.remove(),300); }, duration);
}

// ════════════════════════════════════════
//  MESSAGE HELPERS
// ════════════════════════════════════════
function addMsg(cid, role, html) {
  const c = document.getElementById(cid);
  const d = document.createElement('div');
  d.className = 'msg';
  d.innerHTML = `<div class="msg-avatar ${role}">${role==='ai'?'AI':'YOU'}</div><div class="msg-bubble ${role}">${html}</div>`;
  c.appendChild(d);
  c.scrollTop = c.scrollHeight;
  return d;
}
function addThinking(cid) {
  return addMsg(cid,'ai','<span class="loader"></span>&nbsp; thinking with Gemini...');
}
function escHtml(s) {
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}
function formatAIReply(text) {
  return text
    .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
    .replace(/```(\w*)\n?([\s\S]*?)```/g,(_,l,c)=>`<pre><code>${c.trim()}</code></pre>`)
    .replace(/`([^`\n]+)`/g,'<code>$1</code>')
    .replace(/\*\*(.+?)\*\*/g,'<strong>$1</strong>')
    .replace(/\*(.+?)\*/g,'<em>$1</em>')
    .replace(/\n/g,'<br>');
}

// ════════════════════════════════════════
//  AI CODE
// ════════════════════════════════════════
const CODE_MODES = {
  fix:      { label:'FIX CODE',          system:'You are an expert programmer. Find ALL bugs, explain each briefly, then return the complete fixed code in a code block.' },
  explain:  { label:'EXPLAIN CODE',      system:'You are a programming teacher. Explain the code clearly, section by section, in simple language.' },
  generate: { label:'GENERATE CODE',     system:'You are an expert programmer. Generate clean, well-commented, production-ready code based on the description. Include error handling.' },
  review:   { label:'CODE REVIEW',       system:'You are a senior engineer. Review for bugs, security issues, performance problems. Give specific actionable feedback.' },
  optimize: { label:'OPTIMIZE CODE',     system:'You are a performance expert. Analyze and optimize for speed and memory. Show the optimized version with explanations.' },
  convert:  { label:'CONVERT CODE',      system:'You are a polyglot programmer. Convert the code to the target language while maintaining identical functionality.' },
  docs:     { label:'ADD DOCUMENTATION', system:'You are a technical writer. Add comprehensive docstrings, comments, and documentation in the appropriate style for the language.' },
  test:     { label:'WRITE TESTS',       system:'You are a QA engineer. Write comprehensive unit tests covering happy paths, edge cases, and error cases.' },
};

function setMode(mode) {
  currentMode = mode;
  document.querySelectorAll('.mode-btn').forEach(b=>b.classList.remove('active'));
  document.getElementById('mode-'+mode)?.classList.add('active');
  document.getElementById('mode-label').textContent = 'MODE: '+(CODE_MODES[mode]?.label||mode.toUpperCase());
  const extMap={Python:'py',JavaScript:'js',TypeScript:'ts','Bash/Shell':'sh',C:'c','C++':'cpp',Java:'java',Go:'go',Rust:'rs',PHP:'php',Ruby:'rb',SQL:'sql'};
  const lang = document.getElementById('lang-select').value;
  document.getElementById('file-tab-name').textContent = 'main.'+(extMap[lang]||'txt');
}

async function runAICode() {
  const code = document.getElementById('code-editor').value.trim();
  if (!code) { toast('⚠ Paste some code first!'); return; }
  if (credits < 5) { toast('❌ Not enough credits!'); showPanel('credits'); return; }
  const mode = CODE_MODES[currentMode];
  const lang = document.getElementById('lang-select').value;
  addMsg('code-chat-messages','user',`<strong>[${mode.label}]</strong> — ${lang}<br><pre><code>${escHtml(code.slice(0,200))}${code.length>200?'\n...':''}</code></pre>`);
  const thinking = addThinking('code-chat-messages');
  try {
    const reply = await callGemini(mode.system, `Language: ${lang}\n\n${code}`);
    thinking.remove(); useCredits(5);
    addMsg('code-chat-messages','ai',formatAIReply(reply));
  } catch(e) {
    thinking.remove();
    addMsg('code-chat-messages','ai',`<span style="color:var(--red)">❌ ${escHtml(e.message)}</span>`);
  }
}

async function sendCodeChat() {
  const input = document.getElementById('code-chat-input');
  const msg = input.value.trim();
  if (!msg) return;
  if (credits < 5) { toast('❌ Need 5 credits!'); return; }
  input.value = '';
  const code = document.getElementById('code-editor').value;
  const lang = document.getElementById('lang-select').value;
  addMsg('code-chat-messages','user',escHtml(msg));
  const thinking = addThinking('code-chat-messages');
  const context = code ? `Language: ${lang}\nCode:\n\`\`\`\n${code}\n\`\`\`\n\nQuestion: ${msg}` : msg;
  try {
    const reply = await callGemini('You are an expert programming assistant. Be helpful and concise. Use code blocks for examples.', context);
    thinking.remove(); useCredits(5);
    addMsg('code-chat-messages','ai',formatAIReply(reply));
  } catch(e) {
    thinking.remove();
    addMsg('code-chat-messages','ai',`<span style="color:var(--red)">❌ ${escHtml(e.message)}</span>`);
  }
}

function copyCode() {
  const code = document.getElementById('code-editor').value;
  if (!code) { toast('Nothing to copy!'); return; }
  navigator.clipboard.writeText(code).then(()=>toast('📋 Copied!'));
}
function loadExample() {
  const ex = {
    fix:`def calculate_stats(data):\n    total = 0\n    for item in data:\n        total += item\n    average = total / len(data)  # Bug: ZeroDivisionError!\n    pritn(f"Average: {average}")  # Bug: typo\n    return {"avg": average, "max": maximun}  # Bug: undefined var`,
    generate:`# Create a Python class for a task manager that:\n# - Adds tasks with title, priority (1-5), due date\n# - Marks tasks complete\n# - Lists tasks sorted by priority\n# - Saves/loads from JSON`,
    review:`import os, sys\n\ndef run_cmd(user_input):\n    os.system("ls " + user_input)  # Security issue!\n\nrun_cmd(sys.argv[1])`,
  };
  document.getElementById('code-editor').value = ex[currentMode] || ex.fix;
  toast('📂 Example loaded!');
}

// ════════════════════════════════════════
//  PENTEST AI
// ════════════════════════════════════════
const PENTEST_SYSTEM = `You are HackOS Pentest AI — an ethical cybersecurity education assistant.
Help users LEARN penetration testing, security concepts, CTF challenges, and defensive security.
RULES: Only assist with authorized/legal activities. Never provide working malware or attack tools for real unauthorized targets. Always emphasize legal authorization. For CTFs give hints not direct answers.
Current category: `;

const PT_CHIPS_DATA = {
  'Reconnaissance':       ['How does nmap work?','Passive vs active recon','OSINT techniques','Subdomain enumeration','Banner grabbing','DNS reconnaissance'],
  'Web Security':         ['What is XSS?','SQL injection explained','CSRF breakdown','How to test IDOR','Burp Suite basics','HTTP security headers'],
  'Network Security':     ['TCP/IP fundamentals','Wireshark analysis','ARP explained','SSL/TLS handshake','Common protocols','Firewall types'],
  'Cryptography':         ['Symmetric vs asymmetric','Hash functions','Cipher weaknesses','PKI and certificates','JWT security','Password hashing'],
  'Privilege Escalation': ['Linux privesc basics','SUID binaries','Sudo misconfigs','Cron job abuse','Windows privesc','Kernel exploits'],
  'Forensics':            ['File carving','Steganography detection','Memory forensics','Log analysis','Network forensics','Metadata extraction'],
  'CTF Help':             ['How to approach CTFs','Essential CTF tools','Common CTF patterns','Stego in CTFs','Crypto in CTFs','Pwn basics'],
};

function initPtChips() { setPtChips('Reconnaissance'); }
function setPtChips(cat) {
  document.getElementById('pt-chips').innerHTML =
    (PT_CHIPS_DATA[cat]||[]).map(c=>`<span class="pt-chip" onclick="setPtPrompt(this)">${c}</span>`).join('');
}
function setPtCat(el, cat) {
  document.querySelectorAll('.pt-cat').forEach(c=>c.classList.remove('active'));
  el.classList.add('active'); ptCategory = cat;
  document.getElementById('pt-cat-title').textContent = el.querySelector('.pt-cat-name').textContent;
  document.getElementById('pt-cat-desc').textContent  = el.querySelector('.pt-cat-desc').textContent;
  setPtChips(cat);
}
function setPtPrompt(el) {
  document.getElementById('pt-input').value = el.textContent;
  document.getElementById('pt-input').focus();
}
async function sendPtMessage() {
  const input = document.getElementById('pt-input');
  const msg = input.value.trim();
  if (!msg) return;
  if (credits < 8) { toast('❌ Need 8 credits!'); showPanel('credits'); return; }
  input.value = '';
  addMsg('pt-messages','user',escHtml(msg));
  const thinking = addThinking('pt-messages');
  ptHistory.push({role:'user',content:msg});
  try {
    const reply = await callGemini(PENTEST_SYSTEM+ptCategory, msg, ptHistory.slice(-8));
    ptHistory.push({role:'assistant',content:reply});
    thinking.remove(); useCredits(8);
    addMsg('pt-messages','ai',formatAIReply(reply));
  } catch(e) {
    thinking.remove();
    addMsg('pt-messages','ai',`<span style="color:var(--red)">❌ ${escHtml(e.message)}</span>`);
  }
}

// ════════════════════════════════════════
//  CTF
// ════════════════════════════════════════
const CHALLENGES = [
  {id:1, name:'SQL Injection 101',    cat:'web',      icon:'🌐',iconCls:'web',      diff:'easy',  pts:50,  solved:true,  desc:'A login form is vulnerable to SQL injection. Bypass authentication without knowing the password.',hint:'Try: username = \' OR 1=1 -- with any password.',flag:'HackOS{sq1_1nj3ct10n_byp4ss}'},
  {id:2, name:'Caesar Speaks',        cat:'crypto',   icon:'🔐',iconCls:'crypto',   diff:'easy',  pts:25,  solved:true,  desc:'Decode this: "UnpxBF{ebg13_vf_sha}". Named after a Roman emperor.',hint:'ROT13: each letter shifts 13 positions.',flag:'HackOS{rot13_is_fun}'},
  {id:3, name:'Hidden in Plain Sight',cat:'forensics',icon:'🔬',iconCls:'forensics',diff:'easy',  pts:50,  solved:false, desc:'A secret message is hidden inside an image file. Use steganography tools to extract the flag.',hint:'Run: strings image.png | grep HackOS, then try steghide.',flag:'HackOS{st3g0_m4st3r}'},
  {id:4, name:'Buffer Overflow Basic',cat:'pwn',      icon:'💥',iconCls:'pwn',      diff:'medium',pts:150, solved:false, desc:'A C program uses gets(). Overflow the buffer to overwrite the return address and call win().',hint:'Use a cyclic pattern to find the offset. Non-PIE binary.',flag:'HackOS{buff3r_0v3rfl0w_w1n}'},
  {id:5, name:'XSS Playground',       cat:'web',      icon:'🌐',iconCls:'web',      diff:'medium',pts:100, solved:false, desc:'Inject a script to steal the admin cookie containing the flag from this vulnerable web app.',hint:'Try <script>alert(document.cookie)</script> — check what gets reflected.',flag:'HackOS{xss_c00k13_st3al}'},
  {id:6, name:'RSA Tiny Key',         cat:'crypto',   icon:'🔐',iconCls:'crypto',   diff:'medium',pts:150, solved:false, desc:'RSA with a very small n. Factor it, derive the private key, decrypt the message.',hint:'Factor n with trial division. phi(n)=(p-1)(q-1), d=e^-1 mod phi(n).',flag:'HackOS{rsa_sm4ll_k3y_br0k3n}'},
  {id:7, name:'Reverse Me',           cat:'reverse',  icon:'⚙️',iconCls:'reverse',  diff:'medium',pts:100, solved:false, desc:'A binary checks a password before printing the flag. Reverse engineer it.',hint:'Use Ghidra or radare2. Look for strcmp() in main(). Try strings first.',flag:'HackOS{r3v3rs3d_b1n4ry}'},
  {id:8, name:'Log Analysis',         cat:'forensics',icon:'🔬',iconCls:'forensics',diff:'easy',  pts:50,  solved:false, desc:'Find the flag hidden in the User-Agent field of web server logs.',hint:'grep -i "HackOS" access.log or look for base64 in User-Agent.',flag:'HackOS{l0g_4n4lys1s_pr0}'},
  {id:9, name:'Heap Overflow',        cat:'pwn',      icon:'💥',iconCls:'pwn',      diff:'hard',  pts:300, solved:false, desc:'Corrupt heap metadata to achieve arbitrary write and get a shell.',hint:'Study tcache poisoning. Draw the heap layout. glibc 2.31.',flag:'HackOS{h34p_m4st3r_1337}'},
  {id:10,name:'Blockchain Puzzle',    cat:'misc',     icon:'🎯',iconCls:'misc',     diff:'hard',  pts:250, solved:false, desc:'A Solidity smart contract has a subtle vulnerability. Exploit it to retrieve the flag.',hint:'Check for reentrancy or integer overflow in withdraw().',flag:'HackOS{sm4rt_c0ntr4ct_h4ck}'},
  {id:11,name:'OSINT Recon',          cat:'misc',     icon:'🎯',iconCls:'misc',     diff:'easy',  pts:50,  solved:false, desc:'Find info about fictional "AcmeCorp Ltd". The CEO leaked the flag publicly.',hint:'Check GitHub, LinkedIn, Pastebin for "AcmeCorp" and their CEO.',flag:'HackOS{0s1nt_3xp3rt}'},
  {id:12,name:'Format String',        cat:'pwn',      icon:'💥',iconCls:'pwn',      diff:'insane',pts:500, solved:false, desc:'Format string vulnerability — leak stack, bypass ASLR, achieve RCE.',hint:'Start with %p%p%p%p to leak addresses. Then use %n writes.',flag:'HackOS{f0rm4t_str1ng_g0d}'},
];

let ctfFilter = 'all';
let currentChallenge = null;

function renderCTF() {
  const grid = document.getElementById('ctf-grid');
  if (!grid) return;
  const filtered = CHALLENGES.filter(c => ctfFilter==='all' || c.cat===ctfFilter);
  grid.innerHTML = filtered.map(c=>`
    <div class="ctf-card" onclick="openCTF(${c.id})">
      ${c.solved?'<div class="ctf-solved-badge">✓</div>':''}
      <div class="ctf-card-top">
        <div class="ctf-icon ${c.iconCls}">${c.icon}</div>
        <div><div class="ctf-name">${c.name}</div><div class="ctf-cat">${c.cat.toUpperCase()} · ${c.solved?'✓ SOLVED':'UNSOLVED'}</div></div>
      </div>
      <div class="ctf-desc">${c.desc.slice(0,100)}...</div>
      <div class="ctf-footer"><span class="diff-badge ${c.diff}">${c.diff.toUpperCase()}</span><span class="ctf-pts">⚡ ${c.pts} pts</span></div>
    </div>`).join('');
}

function filterCTF(el, cat) {
  document.querySelectorAll('.ctf-filter').forEach(f=>f.classList.remove('active'));
  el.classList.add('active'); ctfFilter = cat; renderCTF();
}

function openCTF(id) {
  currentChallenge = CHALLENGES.find(c=>c.id===id);
  if (!currentChallenge) return;
  const c = currentChallenge;
  document.getElementById('modal-icon').textContent  = c.icon;
  document.getElementById('modal-icon').className    = `modal-icon ${c.iconCls}`;
  document.getElementById('modal-title').textContent = c.name;
  document.getElementById('modal-sub').textContent   = `${c.cat.toUpperCase()} · ${c.diff.toUpperCase()} · ${c.pts} pts`;
  document.getElementById('modal-desc').textContent  = c.desc;
  document.getElementById('modal-hint-text').textContent = c.solved ? c.hint : '🔒 Reveal hint (costs 10 credits)';
  document.getElementById('modal-hint-text').onclick = c.solved ? null : revealHint;
  document.getElementById('flag-input').value = '';
  document.getElementById('flag-result').style.display = 'none';
  document.getElementById('ctf-modal').classList.add('show');
}
function revealHint() {
  if (credits < 10) { toast('❌ Need 10 credits for a hint!'); return; }
  useCredits(10);
  document.getElementById('modal-hint-text').textContent = currentChallenge.hint;
  document.getElementById('modal-hint-text').onclick = null;
}
function closeModal() { document.getElementById('ctf-modal').classList.remove('show'); }
function submitFlag() {
  const input  = document.getElementById('flag-input').value.trim();
  const result = document.getElementById('flag-result');
  if (!input) return;
  if (input === currentChallenge.flag) {
    result.className = 'flag-result correct';
    result.textContent = `✓ Correct! +${currentChallenge.pts} points!`;
    result.style.display = 'block';
    if (!currentChallenge.solved) {
      currentChallenge.solved = true;
      earnCredits(Math.floor(currentChallenge.pts/5));
      renderCTF();
    }
  } else {
    result.className = 'flag-result wrong';
    result.textContent = '✗ Wrong flag. Keep trying!';
    result.style.display = 'block';
  }
}

// ════════════════════════════════════════
//  ADMIN USERS TABLE
// ════════════════════════════════════════
const USERS = [
  {name:'root',      email:'root@hackos.io',    plan:'ELITE',credits:9999,status:'active', joined:'2024-01-01'},
  {name:'h4cker99',  email:'h4ck@proton.me',    plan:'PRO',  credits:4200,status:'premium',joined:'2024-01-15'},
  {name:'ctfplayer', email:'ctf@gmail.com',     plan:'FREE', credits:180, status:'active', joined:'2024-02-03'},
  {name:'ghost_sec', email:'ghost@darkweb.net', plan:'PRO',  credits:3800,status:'premium',joined:'2024-02-10'},
  {name:'n00bh4x0r', email:'noob@yahoo.com',    plan:'FREE', credits:420, status:'active', joined:'2024-03-01'},
  {name:'sp4mbot',   email:'spam@spam.com',     plan:'FREE', credits:0,   status:'banned', joined:'2024-03-05'},
  {name:'sec_elite', email:'elite@secops.io',   plan:'ELITE',credits:8500,status:'premium',joined:'2024-03-12'},
];
function renderUsers(list=USERS) {
  const tbody = document.getElementById('user-tbody');
  if (!tbody) return;
  tbody.innerHTML = list.map(u=>`
    <tr>
      <td style="color:var(--green);font-weight:700">${u.name}</td>
      <td style="color:var(--dim)">${u.email}</td>
      <td><span class="u-status ${u.plan==='FREE'?'active':'premium'}">${u.plan}</span></td>
      <td style="color:var(--yellow)">⚡ ${u.credits}</td>
      <td><span class="u-status ${u.status}">${u.status.toUpperCase()}</span></td>
      <td style="color:var(--dim)">${u.joined}</td>
      <td><div class="u-actions">
        <button class="u-act-btn" onclick="toast('Editing ${u.name}')">Edit</button>
        <button class="u-act-btn" onclick="toast('Credits adjusted')">Credits</button>
        <button class="u-act-btn danger" onclick="toast('${u.name} banned!')">Ban</button>
      </div></td>
    </tr>`).join('');
}
function filterUsers(q) {
  renderUsers(USERS.filter(u=>u.name.toLowerCase().includes(q.toLowerCase())||u.email.toLowerCase().includes(q.toLowerCase())));
}
function upgradePlan(plan) {
  toast(`🚀 Upgrading to ${plan}... (demo)`);
  setTimeout(()=>{
    document.getElementById('plan-badge').textContent = plan;
    document.getElementById('plan-badge').className   = 'badge-premium';
    earnCredits(plan==='ELITE'?99750:4750);
    document.querySelector('.sb-plan-name').textContent = plan+' PLAN';
  },1200);
}
