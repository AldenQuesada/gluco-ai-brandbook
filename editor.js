/**
 * GLUCO AI — Message Editor v3
 *
 * Seletores corretos por página:
 *   Onboarding         → .wa-text          (filho direto do .wa-bot/.wa-user)
 *   Conversion/Pre-evt → .wa-bot, .wa-user  (texto como nó direto após .wa-label)
 *   Playbook           → .wa-bubble         (filho do .msg-item-body)
 *   Saas-funnel        → .tu-message
 *   Upgrade flow       → .seq-text, .msg
 *
 * Nunca injeta nada dentro das mensagens.
 * Visual feedback apenas via outline CSS.
 * Modal abre ao clicar na mensagem.
 */
;(function () {
  'use strict';

  var PAGE_KEY = 'glucoai_edits::' + location.pathname;

  // Elementos protegidos que nunca fazem parte do texto editável
  var PROTECTED = '.wa-label, .wa-label-small, .wa-options, .wa-options-list, .wa-time, .wa-meta, .wa-opt, .wa-opt-item';

  // ─────────────────────────────────────────────
  //  STORAGE
  // ─────────────────────────────────────────────
  function load()       { try { return JSON.parse(localStorage.getItem(PAGE_KEY) || '{}'); } catch(e) { return {}; } }
  function persist(d)   { try { localStorage.setItem(PAGE_KEY, JSON.stringify(d)); } catch(e) {} }
  function countSaved() { return Object.keys(load()).length; }

  // ─────────────────────────────────────────────
  //  COLETA DE ELEMENTOS  (nunca re-usa cache erroneamente)
  // ─────────────────────────────────────────────
  function collectElements() {
    var seen = new Set();
    var list = [];

    function add(el, type) {
      if (seen.has(el)) return;
      if (el.closest && (el.closest('#gai-modal') || el.closest('#gai-bar'))) return;
      var txt = (el.textContent || '').trim();
      if (txt.length < 4) return;
      seen.add(el);
      list.push({ el: el, type: type });
    }

    // 1. .wa-text — texto explícito (onboarding)
    //    Marca o pai (.wa-bot/.wa-user) como visto para não duplicar
    document.querySelectorAll('.wa-text').forEach(function(el) {
      add(el, 'full');
      var p = el.parentElement;
      if (p) seen.add(p);
    });

    // 2. .wa-bot / .wa-user sem filho .wa-text  (conversion, pre-event)
    //    Texto fica como nó de texto direto após .wa-label
    document.querySelectorAll('.wa-bot, .wa-user').forEach(function(el) {
      if (seen.has(el)) return;                     // já tratado via .wa-text
      if (el.querySelector('.wa-text')) { seen.add(el); return; } // tem .wa-text filho → pular
      add(el, 'direct');
    });

    // 3. .wa-bubble — texto no playbook
    document.querySelectorAll('.wa-bubble').forEach(function(el) {
      add(el, 'full');
    });

    // 4. .tu-message — mensagens de gatilho (saas-funnel)
    document.querySelectorAll('.tu-message').forEach(function(el) {
      add(el, 'full');
    });

    // 5. .seq-text — sequências persuasivas (upgrade flow)
    document.querySelectorAll('.seq-text').forEach(function(el) {
      add(el, 'full');
    });

    // 6. .msg — mensagens inline (upgrade flow)
    document.querySelectorAll('.msg').forEach(function(el) {
      if (el.querySelector('.wa-label, .wa-bubble, .wa-text')) return; // container, não mensagem
      add(el, 'full');
    });

    return list;
  }

  // ─────────────────────────────────────────────
  //  LER / DEFINIR TEXTO
  // ─────────────────────────────────────────────

  function getText(el, type) {
    if (type === 'full') {
      // textContent preserva quebras de linha de pre-wrap
      return (el.textContent || '').trim();
    }
    // direct: clonar, remover protegidos, pegar texto
    var clone = el.cloneNode(true);
    clone.querySelectorAll(PROTECTED).forEach(function(n) { n.remove(); });
    return (clone.textContent || '').trim();
  }

  function setText(el, type, text) {
    if (type === 'full') {
      el.textContent = text;
      return;
    }

    // direct: remover apenas nós que NÃO são elementos protegidos
    var protectedEls = Array.from(el.querySelectorAll(PROTECTED));

    // isProtected: o nó é um elemento protegido ou está contido nele
    function isProtected(node) {
      return protectedEls.some(function(p) { return p === node || p.contains(node); });
    }

    // Coletar nós a remover (cópia estável antes de iterar)
    var toRemove = [];
    el.childNodes.forEach(function(node) {
      if (!isProtected(node)) toRemove.push(node);
    });
    toRemove.forEach(function(n) { el.removeChild(n); });

    // Inserir novo texto LOGO APÓS o label (antes de qualquer outro filho)
    var label = el.querySelector('.wa-label, .wa-label-small');
    var textNode = document.createTextNode(text);

    if (label && label.nextSibling) {
      el.insertBefore(textNode, label.nextSibling);
    } else if (label) {
      el.appendChild(textNode);
    } else {
      // Sem label: inserir no início
      el.insertBefore(textNode, el.firstChild);
    }
  }

  // ─────────────────────────────────────────────
  //  APLICAR EDIÇÕES SALVAS AO CARREGAR
  // ─────────────────────────────────────────────
  function applySaved() {
    var saved = load();
    if (!Object.keys(saved).length) return;
    collectElements().forEach(function(item, i) {
      if (saved[i] !== undefined) setText(item.el, item.type, saved[i]);
    });
    updateBadge();
  }

  // ─────────────────────────────────────────────
  //  MODO EDIÇÃO
  // ─────────────────────────────────────────────
  var isEditMode = false;
  var handlers = [];  // { el, fn }

  function enterEditMode() {
    isEditMode = true;
    var items = collectElements();
    var saved = load();

    items.forEach(function(item, i) {
      item.el.classList.add('gai-editable');
      if (saved[i] !== undefined) item.el.classList.add('gai-edited');

      var fn = (function(it, idx) {
        return function(e) { e.stopPropagation(); openModal(it, idx); };
      })(item, i);

      item.el.addEventListener('click', fn);
      handlers.push({ el: item.el, fn: fn });
    });

    document.getElementById('gai-trigger').style.display = 'none';
    document.getElementById('gai-bar').classList.add('visible');
    updateCounter(items, saved);
    showToast('Clique em qualquer mensagem destacada para editar', 'info');
  }

  function exitEditMode() {
    isEditMode = false;
    handlers.forEach(function(h) {
      h.el.removeEventListener('click', h.fn);
      h.el.classList.remove('gai-editable', 'gai-edited');
    });
    handlers = [];

    document.getElementById('gai-trigger').style.display = '';
    document.getElementById('gai-bar').classList.remove('visible');
    updateBadge();
  }

  function toggleEditMode() {
    if (isEditMode) exitEditMode(); else enterEditMode();
  }

  // ─────────────────────────────────────────────
  //  MODAL
  // ─────────────────────────────────────────────
  function openModal(item, index) {
    var saved = load();
    var currentText = getText(item.el, item.type);

    var modal    = document.getElementById('gai-modal');
    var mLabel   = document.getElementById('gai-modal-label');
    var mTotal   = document.getElementById('gai-modal-total');
    var mArea    = document.getElementById('gai-modal-textarea');
    var mChars   = document.getElementById('gai-modal-chars');
    var mStatus  = document.getElementById('gai-modal-status');

    mLabel.textContent  = 'Mensagem #' + (index + 1);
    mTotal.textContent  = 'de ' + collectElements().length + ' nesta página';
    mArea.value         = currentText;
    mChars.textContent  = currentText.length + ' caracteres';
    mStatus.textContent = saved[index] !== undefined ? '● Editado' : '○ Original';
    mStatus.className   = saved[index] !== undefined ? 'gai-st-edited' : 'gai-st-orig';

    mArea.oninput = function() { mChars.textContent = mArea.value.length + ' caracteres'; };

    // Salvar
    document.getElementById('gai-modal-save').onclick = function() {
      var newText = mArea.value;
      setText(item.el, item.type, newText);
      var d = load(); d[index] = newText; persist(d);
      item.el.classList.add('gai-edited');
      updateCounter(collectElements(), d);
      updateBadge();
      showToast('Mensagem #' + (index + 1) + ' salva!', 'success');
      closeModal();
    };

    // Resetar esta mensagem
    document.getElementById('gai-modal-reset').onclick = function() {
      if (!confirm('Resetar esta mensagem para o texto original?')) return;
      var d = load();
      delete d[index];
      persist(d);
      item.el.classList.remove('gai-edited');
      updateBadge();
      showToast('Mensagem resetada — recarregue para ver o original.', 'warning');
      closeModal();
      location.reload();
    };

    modal.classList.add('visible');
    requestAnimationFrame(function() { mArea.focus(); mArea.setSelectionRange(0, 0); });
  }

  function closeModal() {
    document.getElementById('gai-modal').classList.remove('visible');
  }

  // ─────────────────────────────────────────────
  //  RESETAR PÁGINA
  // ─────────────────────────────────────────────
  function resetPage() {
    var n = countSaved();
    if (!n) { showToast('Nenhuma edição salva nesta página', 'warning'); return; }
    if (!confirm('Resetar todas as ' + n + ' edições desta página?')) return;
    localStorage.removeItem(PAGE_KEY);
    location.reload();
  }

  // ─────────────────────────────────────────────
  //  HELPERS DE UI
  // ─────────────────────────────────────────────
  function updateCounter(items, saved) {
    var el = document.getElementById('gai-counter');
    if (!el) return;
    var n = saved ? Object.keys(saved).length : 0;
    el.textContent = (items ? items.length : '?') + ' mensagens' + (n ? ' · ' + n + ' editadas' : '');
  }

  function updateBadge() {
    var b = document.getElementById('gai-badge');
    if (!b) return;
    var n = countSaved();
    b.textContent = n;
    b.style.display = n > 0 ? 'inline-flex' : 'none';
  }

  function showToast(msg, type) {
    var t = document.getElementById('gai-toast');
    if (!t) return;
    t.textContent = msg;
    t.className = 'gai-toast ' + (type || 'info') + ' show';
    clearTimeout(t._tid);
    t._tid = setTimeout(function() { t.className = 'gai-toast'; }, 3200);
  }

  // ─────────────────────────────────────────────
  //  CONSTRUIR UI
  //  Nada é injetado dentro das mensagens.
  // ─────────────────────────────────────────────
  function buildUI() {
    // Estilos
    var s = document.createElement('style');
    s.textContent = [
      // Botão trigger
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

      // Barra inferior
      '#gai-bar{position:fixed;bottom:0;left:0;right:0;z-index:8001;',
        'background:#0f1628;border-top:1px solid #1e2a45;',
        'display:flex;align-items:center;justify-content:space-between;',
        'padding:10px 24px;gap:12px;',
        'transform:translateY(100%);transition:transform .3s ease;',
        'box-shadow:0 -4px 32px rgba(0,0,0,.6);font-family:inherit;}',
      '#gai-bar.visible{transform:translateY(0);}',
      '#gai-bar-l{display:flex;align-items:center;gap:14px;flex:1;}',
      '#gai-bar-title{font-size:13px;font-weight:800;color:#e2e8f0;white-space:nowrap;}',
      '#gai-counter{font-size:11px;color:#64748b;}',
      '#gai-bar-r{display:flex;gap:8px;flex-shrink:0;}',
      '#gai-btn-admin{background:rgba(27,111,255,.1);border:1px solid rgba(27,111,255,.3);',
        'color:#93c5fd;padding:7px 12px;border-radius:8px;font-size:12px;font-weight:700;',
        'text-decoration:none;display:inline-flex;align-items:center;font-family:inherit;}',
      '#gai-btn-reset{background:rgba(220,38,38,.08);border:1px solid rgba(239,68,68,.25);',
        'color:#f87171;padding:7px 12px;border-radius:8px;font-size:12px;font-weight:700;',
        'cursor:pointer;font-family:inherit;}',
      '#gai-btn-done{background:#16a34a;border:none;color:#fff;',
        'padding:7px 16px;border-radius:8px;font-size:12px;font-weight:700;',
        'cursor:pointer;font-family:inherit;}',

      // Outline nas mensagens editáveis — SEM alterar box model nem layout
      '.gai-editable{',
        'outline:2px dashed rgba(27,111,255,.55)!important;',
        'outline-offset:3px!important;',
        'cursor:pointer!important;',
        'transition:outline-color .15s!important;}',
      '.gai-editable:hover{outline:2px solid rgba(27,111,255,.95)!important;outline-offset:3px!important;}',
      '.gai-edited{outline-color:rgba(245,158,11,.65)!important;}',
      '.gai-edited:hover{outline-color:rgba(245,158,11,1)!important;}',

      // Modal backdrop
      '#gai-modal{position:fixed;inset:0;z-index:9999;',
        'display:flex;align-items:center;justify-content:center;',
        'background:rgba(0,0,0,.7);backdrop-filter:blur(3px);',
        'opacity:0;pointer-events:none;transition:opacity .2s;}',
      '#gai-modal.visible{opacity:1;pointer-events:all;}',

      // Modal box
      '#gai-modal-box{background:#0f1628;border:1px solid #2a3a5c;border-radius:18px;',
        'width:min(640px,94vw);padding:22px 26px;',
        'box-shadow:0 24px 80px rgba(0,0,0,.7);',
        'transform:translateY(8px);transition:transform .2s;}',
      '#gai-modal.visible #gai-modal-box{transform:translateY(0);}',

      '#gai-modal-head{display:flex;align-items:flex-start;justify-content:space-between;margin-bottom:14px;}',
      '#gai-modal-label{font-size:14px;font-weight:800;color:#e2e8f0;}',
      '#gai-modal-total{font-size:11px;color:#64748b;margin-top:1px;}',
      '#gai-modal-x{background:rgba(255,255,255,.06);border:1px solid #2a3a5c;',
        'color:#64748b;width:30px;height:30px;border-radius:7px;cursor:pointer;',
        'font-size:18px;display:flex;align-items:center;justify-content:center;',
        'flex-shrink:0;font-family:inherit;line-height:1;}',
      '#gai-modal-x:hover{color:#e2e8f0;}',

      '#gai-modal-textarea{width:100%;min-height:160px;max-height:320px;resize:vertical;',
        'background:#141c30;border:1px solid #2a3a5c;border-radius:10px;',
        'color:#e2e8f0;font-size:13px;line-height:1.7;padding:12px 14px;',
        'font-family:inherit;outline:none;box-sizing:border-box;display:block;}',
      '#gai-modal-textarea:focus{border-color:#1B6FFF;box-shadow:0 0 0 2px rgba(27,111,255,.12);}',

      '#gai-modal-meta{display:flex;align-items:center;justify-content:space-between;',
        'margin:8px 0 16px;}',
      '#gai-modal-chars{font-size:11px;color:#64748b;font-family:monospace;}',
      '.gai-st-orig{font-size:10px;font-weight:700;padding:2px 8px;border-radius:5px;',
        'background:rgba(100,116,139,.1);color:#94a3b8;border:1px solid rgba(100,116,139,.2);}',
      '.gai-st-edited{font-size:10px;font-weight:700;padding:2px 8px;border-radius:5px;',
        'background:rgba(245,158,11,.1);color:#f59e0b;border:1px solid rgba(245,158,11,.25);}',

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

      // Toast
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

    // Botão trigger
    var trigger = document.createElement('button');
    trigger.id = 'gai-trigger';
    trigger.innerHTML = '✏️ Editar mensagens <span id="gai-badge"></span>';
    trigger.onclick = toggleEditMode;
    document.body.appendChild(trigger);

    // Barra inferior
    var bar = document.createElement('div');
    bar.id = 'gai-bar';
    bar.innerHTML =
      '<div id="gai-bar-l">' +
        '<span id="gai-bar-title">✏️ Modo Edição</span>' +
        '<span id="gai-counter"></span>' +
      '</div>' +
      '<div id="gai-bar-r">' +
        '<a id="gai-btn-admin" href="admin.html" target="_blank">⚙️ Admin</a>' +
        '<button id="gai-btn-reset">↺ Resetar página</button>' +
        '<button id="gai-btn-done">✓ Concluir</button>' +
      '</div>';
    document.body.appendChild(bar);
    document.getElementById('gai-btn-reset').onclick = resetPage;
    document.getElementById('gai-btn-done').onclick = toggleEditMode;

    // Modal
    var modal = document.createElement('div');
    modal.id = 'gai-modal';
    modal.innerHTML =
      '<div id="gai-modal-box">' +
        '<div id="gai-modal-head">' +
          '<div><div id="gai-modal-label"></div><div id="gai-modal-total"></div></div>' +
          '<button id="gai-modal-x">×</button>' +
        '</div>' +
        '<textarea id="gai-modal-textarea" spellcheck="false"></textarea>' +
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

    document.getElementById('gai-modal-x').onclick = closeModal;
    document.getElementById('gai-modal-cancel').onclick = closeModal;
    modal.addEventListener('click', function(e) { if (e.target === modal) closeModal(); });
    document.addEventListener('keydown', function(e) {
      if (e.key === 'Escape') closeModal();
      if ((e.ctrlKey || e.metaKey) && e.key === 'Enter' && modal.classList.contains('visible'))
        document.getElementById('gai-modal-save').click();
    });

    // Toast
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
    if (location.hash === '#edit') toggleEditMode();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})();
