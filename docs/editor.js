/**
 * GLUCO AI — Message Editor v2
 * Edição via modal. Nenhum elemento é injetado dentro das mensagens.
 * Visual feedback apenas via CSS outline + cursor.
 */
;(function () {
  'use strict';

  // ─────────────────────────────────────────────
  //  CONFIG
  // ─────────────────────────────────────────────
  var PAGE_KEY = 'glucoai_edits::' + location.pathname;

  // Seletores e como extrair/definir o texto de cada tipo
  var TARGETS = [
    { sel: '.wa-text',        type: 'full'   },  // onboarding
    { sel: '.wa-bot',         type: 'direct' },  // saas-funnel, conversion, pre-event
    { sel: '.wa-user',        type: 'direct' },
    { sel: '.msg-item-body',  type: 'direct' },  // playbook
    { sel: '.msg-block-body', type: 'direct' },  // outros
    { sel: '.tu-message',     type: 'full'   },  // saas-funnel trigger msgs
    { sel: '.seq-text',       type: 'full'   },  // upgrade flow sequences
    { sel: '.msg',            type: 'full'   },  // upgrade flow inline msgs
  ];

  // Elementos filhos que NÃO fazem parte do texto editável (labels, opções, etc.)
  var PROTECTED_SEL = '.wa-label, .wa-label-small, .wa-options, .wa-time, .wa-meta';

  // ─────────────────────────────────────────────
  //  STORAGE
  // ─────────────────────────────────────────────
  function load() {
    try { return JSON.parse(localStorage.getItem(PAGE_KEY) || '{}'); } catch (e) { return {}; }
  }
  function persist(data) {
    try { localStorage.setItem(PAGE_KEY, JSON.stringify(data)); } catch (e) {}
  }
  function countSaved() { return Object.keys(load()).length; }

  // ─────────────────────────────────────────────
  //  ELEMENT COLLECTION
  // ─────────────────────────────────────────────
  var _items = null; // cached after first call

  function collectElements() {
    if (_items) return _items;
    var seen = new Set();
    var list = [];
    TARGETS.forEach(function (t) {
      document.querySelectorAll(t.sel).forEach(function (el) {
        if (seen.has(el)) return;
        if (el.closest && el.closest('#gai-modal')) return;
        if (el.closest && el.closest('#gai-bar')) return;
        var txt = getPlainText(el, t.type).trim();
        if (txt.length < 4) return;
        seen.add(el);
        list.push({ el: el, type: t.type });
      });
    });
    _items = list;
    return list;
  }

  // ─────────────────────────────────────────────
  //  TEXT EXTRACT / APPLY
  // ─────────────────────────────────────────────

  // Retorna texto limpo sem os labels protegidos
  function getPlainText(el, type) {
    if (type === 'full') {
      return el.innerText || '';
    }
    // type 'direct': clonar, remover filhos protegidos, pegar innerText
    var clone = el.cloneNode(true);
    clone.querySelectorAll(PROTECTED_SEL).forEach(function (n) { n.remove(); });
    return (clone.innerText || '').trim();
  }

  // Define texto no elemento sem mexer nos filhos protegidos
  function applyText(el, type, text) {
    if (type === 'full') {
      el.innerText = text;
      return;
    }
    // type 'direct': identificar os nós protegidos, remover o resto, reinserir texto
    var protectedNodes = Array.from(el.querySelectorAll(PROTECTED_SEL));

    // Nós a remover: filhos diretos que não são protegidos
    var toRemove = [];
    el.childNodes.forEach(function (node) {
      var isProtected = protectedNodes.some(function (p) {
        return p === node || p.contains(node);
      });
      if (!isProtected) toRemove.push(node);
    });
    toRemove.forEach(function (n) { el.removeChild(n); });

    // Inserir novo texto como nó de texto
    el.appendChild(document.createTextNode(text));
  }

  // ─────────────────────────────────────────────
  //  APPLY SAVED ON LOAD
  // ─────────────────────────────────────────────
  function applySaved() {
    var saved = load();
    if (!Object.keys(saved).length) return;
    collectElements().forEach(function (item, i) {
      if (saved[i] !== undefined) applyText(item.el, item.type, saved[i]);
    });
    updateBadge();
  }

  // ─────────────────────────────────────────────
  //  EDIT MODE
  // ─────────────────────────────────────────────
  var isEditMode = false;
  var clickHandlers = []; // { el, fn } para remover depois

  function enterEditMode() {
    isEditMode = true;
    var items = collectElements();
    var saved = load();

    items.forEach(function (item, i) {
      item.el.classList.add('gai-editable-el');
      if (saved[i] !== undefined) item.el.classList.add('gai-el-edited');

      var fn = (function (capturedItem, capturedI) {
        return function (e) {
          e.stopPropagation();
          openModal(capturedItem, capturedI);
        };
      })(item, i);

      item.el.addEventListener('click', fn);
      clickHandlers.push({ el: item.el, fn: fn });
    });

    document.getElementById('gai-trigger').style.display = 'none';
    document.getElementById('gai-bar').classList.add('visible');
    updateCounter();
    showToast('Clique em qualquer mensagem para editar', 'info');
  }

  function exitEditMode() {
    isEditMode = false;

    // Remover handlers e classes — sem tocar no conteúdo
    clickHandlers.forEach(function (h) {
      h.el.removeEventListener('click', h.fn);
      h.el.classList.remove('gai-editable-el', 'gai-el-edited');
    });
    clickHandlers = [];
    _items = null; // reset cache

    document.getElementById('gai-trigger').style.display = '';
    document.getElementById('gai-bar').classList.remove('visible');
    updateBadge();
  }

  function toggleEditMode() {
    if (isEditMode) exitEditMode();
    else enterEditMode();
  }

  // ─────────────────────────────────────────────
  //  MODAL
  // ─────────────────────────────────────────────
  function openModal(item, index) {
    var saved = load();
    var currentText = getPlainText(item.el, item.type);
    var isEdited = saved[index] !== undefined;

    var modal      = document.getElementById('gai-modal');
    var mLabel     = document.getElementById('gai-modal-label');
    var mTotal     = document.getElementById('gai-modal-total');
    var mTextarea  = document.getElementById('gai-modal-textarea');
    var mChars     = document.getElementById('gai-modal-chars');
    var mStatus    = document.getElementById('gai-modal-status');

    mLabel.textContent    = 'Mensagem #' + (index + 1);
    mTotal.textContent    = 'de ' + collectElements().length + ' nesta página';
    mTextarea.value       = currentText;
    mChars.textContent    = currentText.length + ' caracteres';
    mStatus.textContent   = isEdited ? '● Editado' : '○ Original';
    mStatus.className     = isEdited ? 'gai-status-edited' : 'gai-status-orig';

    mTextarea.oninput = function () {
      mChars.textContent = mTextarea.value.length + ' caracteres';
    };

    document.getElementById('gai-modal-save').onclick = function () {
      var newText = mTextarea.value;
      applyText(item.el, item.type, newText);
      var data = load();
      data[index] = newText;
      persist(data);

      // Atualiza classe visual
      item.el.classList.add('gai-el-edited');
      updateCounter();
      updateBadge();
      showToast('Mensagem #' + (index + 1) + ' salva!', 'success');
      closeModal();
    };

    document.getElementById('gai-modal-reset').onclick = function () {
      if (!confirm('Resetar esta mensagem para o texto original?')) return;
      var data = load();
      if (data[index] !== undefined) {
        delete data[index];
        persist(data);
      }
      item.el.classList.remove('gai-el-edited');
      updateCounter();
      updateBadge();
      showToast('Mensagem resetada — recarregue para ver o original', 'warning');
      closeModal();
      location.reload();
    };

    modal.classList.add('visible');
    requestAnimationFrame(function () { mTextarea.focus(); });
  }

  function closeModal() {
    document.getElementById('gai-modal').classList.remove('visible');
  }

  // ─────────────────────────────────────────────
  //  RESET PAGE
  // ─────────────────────────────────────────────
  function resetPage() {
    var n = countSaved();
    if (!n) { showToast('Nenhuma edição salva nesta página', 'warning'); return; }
    if (!confirm('Resetar todas as ' + n + ' edições desta página?')) return;
    localStorage.removeItem(PAGE_KEY);
    location.reload();
  }

  // ─────────────────────────────────────────────
  //  UI HELPERS
  // ─────────────────────────────────────────────
  function updateCounter() {
    var el = document.getElementById('gai-counter');
    if (!el) return;
    var items = collectElements();
    var saved = load();
    var n = Object.keys(saved).length;
    el.textContent = items.length + ' mensagens' + (n ? '  ·  ' + n + ' editadas' : '');
  }

  function updateBadge() {
    var badge = document.getElementById('gai-badge');
    if (!badge) return;
    var n = countSaved();
    badge.textContent = n;
    badge.style.display = n > 0 ? 'inline-flex' : 'none';
  }

  function showToast(msg, type) {
    var t = document.getElementById('gai-toast');
    if (!t) return;
    t.textContent = msg;
    t.className = 'gai-toast ' + (type || 'info') + ' show';
    clearTimeout(t._tid);
    t._tid = setTimeout(function () { t.className = 'gai-toast'; }, 3200);
  }

  // ─────────────────────────────────────────────
  //  BUILD UI  (nada é injetado dentro de mensagens)
  // ─────────────────────────────────────────────
  function buildUI() {
    /* ── Estilos ── */
    var s = document.createElement('style');
    s.textContent = [
      /* Trigger button */
      '#gai-trigger{position:fixed;bottom:24px;right:24px;z-index:8000;',
        'display:inline-flex;align-items:center;gap:8px;',
        'background:#1B6FFF;color:#fff;border:none;',
        'padding:10px 20px;border-radius:50px;',
        'font-size:13px;font-weight:700;cursor:pointer;',
        'box-shadow:0 4px 24px rgba(27,111,255,.45);',
        'transition:background .2s,transform .2s;font-family:inherit;}',
      '#gai-trigger:hover{background:#1455d0;transform:translateY(-2px);}',
      '#gai-badge{background:#ef4444;color:#fff;font-size:10px;font-weight:800;',
        'padding:1px 6px;border-radius:10px;display:none;',
        'align-items:center;justify-content:center;min-width:18px;}',

      /* Bottom bar */
      '#gai-bar{position:fixed;bottom:0;left:0;right:0;z-index:8001;',
        'background:#0f1628;border-top:1px solid #1e2a45;',
        'display:flex;align-items:center;justify-content:space-between;',
        'padding:10px 24px;gap:12px;',
        'transform:translateY(100%);transition:transform .3s ease;',
        'box-shadow:0 -4px 32px rgba(0,0,0,.6);font-family:inherit;}',
      '#gai-bar.visible{transform:translateY(0);}',
      '#gai-bar-left{display:flex;align-items:center;gap:14px;flex:1;min-width:0;}',
      '#gai-bar-title{font-size:13px;font-weight:800;color:#e2e8f0;white-space:nowrap;}',
      '#gai-counter{font-size:11px;color:#64748b;}',
      '#gai-bar-btns{display:flex;gap:8px;flex-shrink:0;}',
      '#gai-btn-admin{background:rgba(27,111,255,.1);border:1px solid rgba(27,111,255,.3);',
        'color:#93c5fd;padding:7px 12px;border-radius:8px;font-size:12px;font-weight:700;',
        'text-decoration:none;cursor:pointer;font-family:inherit;}',
      '#gai-btn-reset{background:rgba(220,38,38,.08);border:1px solid rgba(239,68,68,.25);',
        'color:#f87171;padding:7px 12px;border-radius:8px;font-size:12px;font-weight:700;',
        'cursor:pointer;font-family:inherit;}',
      '#gai-btn-done{background:#16a34a;border:none;color:#fff;',
        'padding:7px 16px;border-radius:8px;font-size:12px;font-weight:700;',
        'cursor:pointer;font-family:inherit;}',

      /* Editable elements — SÓ outline e cursor, NADA mais */
      '.gai-editable-el{',
        'outline:2px dashed rgba(27,111,255,.5)!important;',
        'outline-offset:2px!important;',
        'cursor:pointer!important;',
        'transition:outline-color .15s!important;}',
      '.gai-editable-el:hover{',
        'outline-color:rgba(27,111,255,.9)!important;',
        'outline-style:solid!important;}',
      '.gai-el-edited{',
        'outline-color:rgba(245,158,11,.7)!important;}',
      '.gai-el-edited:hover{',
        'outline-color:rgba(245,158,11,1)!important;}',

      /* Modal overlay */
      '#gai-modal{position:fixed;inset:0;z-index:9999;',
        'display:flex;align-items:center;justify-content:center;',
        'background:rgba(0,0,0,.7);backdrop-filter:blur(3px);',
        'opacity:0;pointer-events:none;transition:opacity .2s;}',
      '#gai-modal.visible{opacity:1;pointer-events:all;}',

      /* Modal box */
      '#gai-modal-box{background:#0f1628;border:1px solid #2a3a5c;border-radius:18px;',
        'width:min(640px,94vw);padding:22px 26px;',
        'box-shadow:0 24px 80px rgba(0,0,0,.7);',
        'transform:translateY(8px);transition:transform .2s;}',
      '#gai-modal.visible #gai-modal-box{transform:translateY(0);}',

      /* Modal header */
      '#gai-modal-head{display:flex;align-items:flex-start;justify-content:space-between;margin-bottom:14px;}',
      '#gai-modal-info{}',
      '#gai-modal-label{font-size:14px;font-weight:800;color:#e2e8f0;}',
      '#gai-modal-total{font-size:11px;color:#64748b;margin-top:1px;}',
      '#gai-modal-close-btn{background:rgba(255,255,255,.06);border:1px solid #2a3a5c;',
        'color:#64748b;width:30px;height:30px;border-radius:7px;cursor:pointer;',
        'font-size:18px;display:flex;align-items:center;justify-content:center;',
        'flex-shrink:0;font-family:inherit;line-height:1;}',
      '#gai-modal-close-btn:hover{color:#e2e8f0;}',

      /* Textarea */
      '#gai-modal-textarea{width:100%;min-height:160px;max-height:300px;resize:vertical;',
        'background:#141c30;border:1px solid #2a3a5c;border-radius:10px;',
        'color:#e2e8f0;font-size:13px;line-height:1.7;padding:12px 14px;',
        'font-family:inherit;outline:none;box-sizing:border-box;display:block;}',
      '#gai-modal-textarea:focus{border-color:#1B6FFF;box-shadow:0 0 0 2px rgba(27,111,255,.12);}',

      /* Modal meta row */
      '#gai-modal-meta{display:flex;align-items:center;justify-content:space-between;',
        'margin-top:8px;margin-bottom:16px;}',
      '#gai-modal-chars{font-size:11px;color:#64748b;font-family:monospace;}',
      '.gai-status-orig{font-size:10px;font-weight:700;padding:2px 8px;border-radius:5px;',
        'background:rgba(100,116,139,.1);color:#94a3b8;border:1px solid rgba(100,116,139,.2);}',
      '.gai-status-edited{font-size:10px;font-weight:700;padding:2px 8px;border-radius:5px;',
        'background:rgba(245,158,11,.1);color:#f59e0b;border:1px solid rgba(245,158,11,.25);}',

      /* Modal footer */
      '#gai-modal-foot{display:flex;gap:8px;justify-content:flex-end;}',
      '#gai-modal-reset{background:transparent;border:1px solid rgba(239,68,68,.25);',
        'color:#f87171;padding:8px 14px;border-radius:8px;font-size:12px;',
        'font-weight:700;cursor:pointer;font-family:inherit;}',
      '#gai-modal-cancel{background:rgba(255,255,255,.05);border:1px solid #2a3a5c;',
        'color:#94a3b8;padding:8px 14px;border-radius:8px;font-size:12px;',
        'font-weight:700;cursor:pointer;font-family:inherit;}',
      '#gai-modal-save{background:#1B6FFF;border:none;color:#fff;',
        'padding:8px 20px;border-radius:8px;font-size:12px;',
        'font-weight:700;cursor:pointer;font-family:inherit;}',
      '#gai-modal-save:hover{background:#1455d0;}',

      /* Toast */
      '#gai-toast{position:fixed;top:20px;right:20px;z-index:10000;',
        'padding:10px 18px;border-radius:10px;font-size:13px;font-weight:600;',
        'font-family:inherit;opacity:0;transform:translateY(-8px);',
        'transition:all .25s;pointer-events:none;}',
      '#gai-toast.show{opacity:1;transform:translateY(0);}',
      '#gai-toast.info{background:#141c30;color:#94a3b8;border:1px solid #2a3a5c;}',
      '#gai-toast.success{background:rgba(22,163,74,.12);color:#22c55e;border:1px solid rgba(34,197,94,.3);}',
      '#gai-toast.warning{background:rgba(245,158,11,.1);color:#f59e0b;border:1px solid rgba(245,158,11,.3);}',
    ].join('');
    document.head.appendChild(s);

    /* ── Trigger button ── */
    var trigger = document.createElement('button');
    trigger.id = 'gai-trigger';
    trigger.innerHTML = '✏️ Editar mensagens <span id="gai-badge"></span>';
    trigger.onclick = toggleEditMode;
    document.body.appendChild(trigger);

    /* ── Bottom bar ── */
    var bar = document.createElement('div');
    bar.id = 'gai-bar';
    bar.innerHTML =
      '<div id="gai-bar-left">' +
        '<span id="gai-bar-title">✏️ Modo Edição</span>' +
        '<span id="gai-counter"></span>' +
      '</div>' +
      '<div id="gai-bar-btns">' +
        '<a id="gai-btn-admin" href="admin.html" target="_blank">⚙️ Admin</a>' +
        '<button id="gai-btn-reset">↺ Resetar página</button>' +
        '<button id="gai-btn-done">✓ Concluir edição</button>' +
      '</div>';
    document.body.appendChild(bar);
    document.getElementById('gai-btn-reset').onclick = resetPage;
    document.getElementById('gai-btn-done').onclick = toggleEditMode;

    /* ── Modal ── */
    var modal = document.createElement('div');
    modal.id = 'gai-modal';
    modal.innerHTML =
      '<div id="gai-modal-box">' +
        '<div id="gai-modal-head">' +
          '<div id="gai-modal-info">' +
            '<div id="gai-modal-label"></div>' +
            '<div id="gai-modal-total"></div>' +
          '</div>' +
          '<button id="gai-modal-close-btn">×</button>' +
        '</div>' +
        '<textarea id="gai-modal-textarea" spellcheck="false" placeholder="Texto da mensagem…"></textarea>' +
        '<div id="gai-modal-meta">' +
          '<span id="gai-modal-chars"></span>' +
          '<span id="gai-modal-status"></span>' +
        '</div>' +
        '<div id="gai-modal-foot">' +
          '<button id="gai-modal-reset">↺ Resetar</button>' +
          '<button id="gai-modal-cancel">Cancelar</button>' +
          '<button id="gai-modal-save">💾 Salvar</button>' +
        '</div>' +
      '</div>';
    document.body.appendChild(modal);

    document.getElementById('gai-modal-close-btn').onclick = closeModal;
    document.getElementById('gai-modal-cancel').onclick = closeModal;
    modal.addEventListener('click', function (e) { if (e.target === modal) closeModal(); });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') { closeModal(); }
      if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
        if (modal.classList.contains('visible')) document.getElementById('gai-modal-save').click();
      }
    });

    /* ── Toast ── */
    var toast = document.createElement('div');
    toast.id = 'gai-toast';
    document.body.appendChild(toast);

    updateBadge();
  }

  // ─────────────────────────────────────────────
  //  INIT
  // ─────────────────────────────────────────────
  function init() {
    buildUI();
    applySaved();

    // Auto-abrir editor se URL tiver #edit
    if (location.hash === '#edit') toggleEditMode();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})();
