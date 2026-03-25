/**
 * GLUCO AI — Universal Timeline Sidebar
 * Auto-detects sections by priority: .msg-block > .stage > section.section[id] > .section[id] > .sec
 */
(function() {
  var itemsEl = document.getElementById('tl-items');
  var countEl = document.getElementById('tl-count');
  var sidebar  = document.getElementById('tl-sidebar');
  var popover  = document.getElementById('tl-popover');
  if (!itemsEl || !popover) return;

  /* ── helpers ── */
  function esc(s) {
    return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  }

  /* ── block detection ── */
  var blocks = null, cfg = null;

  var CONFIGS = [
    {
      sel: '.msg-block',
      title: function(el) { var e=el.querySelector('.msg-id'); return e?e.textContent.trim():''; },
      color: function(el) {
        return el.classList.contains('new')    ? 'blue'   :
               el.classList.contains('fixed')  ? 'yellow' :
               el.classList.contains('ok')     ? 'green'  :
               el.classList.contains('danger') ? 'red'    :
               el.classList.contains('convert')? 'blue'   : 'gray';
      },
      peek: 'wa'
    },
    {
      sel: '.stage',
      title: function(el) {
        var e = el.querySelector('.stage-name, .stage-label');
        return e ? e.textContent.trim() : '';
      },
      color: function(el) {
        var n = el.querySelector('.stage-num');
        if (!n) return 'blue';
        return n.classList.contains('red')    ? 'red'    :
               n.classList.contains('green')  ? 'green'  :
               n.classList.contains('yellow') ? 'yellow' :
               n.classList.contains('orange') ? 'yellow' :
               n.classList.contains('teal')   ? 'green'  : 'blue';
      },
      peek: 'text'
    },
    {
      sel: 'section.section[id]',
      title: function(el) { var e=el.querySelector('.section-title, h2, h3'); return e?e.textContent.trim():''; },
      color: function() { return 'blue'; },
      peek: 'text'
    },
    {
      sel: '.section[id]',
      title: function(el) { var e=el.querySelector('.sec-title, h2, h3'); return e?e.textContent.trim():''; },
      color: function() { return 'blue'; },
      peek: 'text'
    }
  ];

  for (var ci=0; ci<CONFIGS.length; ci++) {
    var found = document.querySelectorAll(CONFIGS[ci].sel);
    if (found && found.length > 0) { blocks = Array.from(found); cfg = CONFIGS[ci]; break; }
  }

  /* .sec fallback (upgrade-flow) */
  if (!blocks) {
    var allSecs = document.querySelectorAll('.sec');
    var filtered = Array.from(allSecs).filter(function(el){ return !!el.querySelector('.sec-tag'); });
    if (filtered.length) {
      blocks = filtered;
      cfg = {
        title: function(el){ var e=el.querySelector('.sec-tag'); return e?e.textContent.trim():''; },
        color: function(){ return 'blue'; },
        peek: 'text'
      };
    }
  }

  /* .doc-card fallback (index.html hub) */
  if (!blocks) {
    var cards = document.querySelectorAll('.doc-card[href]');
    if (cards && cards.length) {
      blocks = Array.from(cards);
      cfg = {
        title: function(el){
          var h = el.querySelector('.card-title');
          var tag = el.querySelector('.card-tag');
          var tname = h ? h.textContent.trim() : '';
          var ttag  = tag ? tag.textContent.trim() : '';
          return ttag ? ttag + ' · ' + tname : tname;
        },
        color: function(el){
          return el.classList.contains('green')  ? 'green'  :
                 el.classList.contains('yellow') ? 'yellow' :
                 el.classList.contains('teal')   ? 'green'  :
                 el.classList.contains('purple') ? 'blue'   : 'blue';
        },
        peek: 'card'
      };
    }
  }

  if (!blocks || !blocks.length) return;
  if (countEl) countEl.textContent = blocks.length;

  /* ── build items ── */
  var tlItems = [];
  var obsMap  = {};

  blocks.forEach(function(block, i) {
    if (!block.id) block.id = 'tl-blk-' + i;
    obsMap[block.id] = i;

    var fullTitle = cfg.title(block) || ('Item ' + (i+1));
    var color     = cfg.color(block);

    var parts    = fullTitle.split('·');
    var rawBadge = parts[0].trim();
    var name     = parts.slice(1).join('·').trim() || rawBadge;
    var badge    = String(i+1);

    var item = document.createElement('div');
    item.className = 'tl-item';
    item.dataset.idx = i;
    item.innerHTML =
      '<div class="tl-dot tl-dot-'+color+'">'+badge+'</div>'+
      '<div class="tl-info">'+
        '<div class="tl-name">'+esc(name)+'</div>'+
        '<div class="tl-id">'+esc(rawBadge)+'</div>'+
      '</div>'+
      '<button class="tl-peek-btn" title="Ver conteúdo">👁</button>';

    item.querySelector('.tl-dot').addEventListener('click', function(){
      if (block.href) { window.location.href = block.href; } else { tlScrollTo(block); }
    });
    item.querySelector('.tl-info').addEventListener('click', function(){
      if (block.href) { window.location.href = block.href; } else { tlScrollTo(block); }
    });
    item.querySelector('.tl-peek-btn').addEventListener('click', function(e){
      e.stopPropagation();
      openPeek(block, item, fullTitle, cfg.peek);
    });

    itemsEl.appendChild(item);
    tlItems.push(item);
  });

  /* ── intersection observer ── */
  if (window.IntersectionObserver) {
    var io = new IntersectionObserver(function(entries){
      entries.forEach(function(e){
        var idx = obsMap[e.target.id];
        if (idx == null || !tlItems[idx]) return;
        tlItems[idx].classList.toggle('tl-active', e.isIntersecting);
        if (e.isIntersecting && sidebar && window.innerWidth > 900) {
          sidebar.scrollTo({ top: tlItems[idx].offsetTop - sidebar.clientHeight/2, behavior:'smooth' });
        }
      });
    }, { rootMargin:'-8% 0px -60% 0px' });
    blocks.forEach(function(b){ io.observe(b); });
  }

  /* ── scroll to block ── */
  function tlScrollTo(block) {
    var top = block.getBoundingClientRect().top + window.pageYOffset - 80;
    window.scrollTo({ top: top, behavior:'smooth' });
    block.classList.add('tl-highlight');
    setTimeout(function(){ block.classList.remove('tl-highlight'); }, 1800);
  }

  /* ── popover ── */
  var curBlock = null;

  function openPeek(block, item, title, type) {
    curBlock = block;
    var parts   = title.split('·');
    var idText  = parts[0].trim();
    var descTxt = parts.slice(1).join('·').trim();

    popover.querySelector('.tlp-title').textContent = idText;
    var descEl = popover.querySelector('.tlp-desc');
    descEl.textContent = descTxt;
    descEl.style.display = descTxt ? '' : 'none';

    var html = '';

    if (type === 'card') {
      /* doc-card preview: description + chips */
      var desc2 = block.querySelector('.card-desc');
      var chips = block.querySelectorAll('.chip');
      var txt2 = desc2 ? desc2.textContent.trim() : block.querySelector('p') ? block.querySelector('p').textContent.trim() : '';
      html = '<div class="tlp-msg-text">'+esc(txt2)+'</div>';
      if (chips.length) {
        html += '<div class="tlp-opts">';
        chips.forEach(function(c){ html += '<div class="tlp-opt">'+esc(c.textContent.trim())+'</div>'; });
        html += '</div>';
      }
    } else if (type === 'wa') {
      /* WhatsApp messages */
      Array.from(block.querySelectorAll('.wa-text, .wa-bot, .wa-user')).forEach(function(el){
        var t = el.textContent.trim();
        if (t) html += '<div class="tlp-msg-text">'+esc(t)+'</div>';
      });
      if (!html) html = '<div class="tlp-msg-text" style="color:#4A5070">— Sem texto —</div>';

      var waOpts = block.querySelectorAll('.wa-opt');
      if (waOpts.length) {
        html += '<div class="tlp-opts">';
        waOpts.forEach(function(o){ html += '<div class="tlp-opt">'+esc(o.textContent.trim())+'</div>'; });
        html += '</div>';
      }

      var branchRows = block.querySelectorAll('.branch-row');
      if (branchRows.length) {
        html += '<div class="tlp-branches"><div class="tlp-branch-title">Ramificações</div>';
        branchRows.forEach(function(row){
          var cond   = row.querySelector('.branch-cond');
          var action = row.querySelector('.branch-action, .branch-dest');
          html += '<div class="tlp-branch-row">'+
            '<span class="tlp-bcond">'+esc(cond?cond.textContent.trim():'?')+'</span>'+
            '<span class="tlp-baction">'+esc(action?action.textContent.trim():'')+'</span>'+
            '</div>';
        });
        html += '</div>';
      }
    } else {
      /* Generic text summary */
      var h   = block.querySelector('h2, h3, .section-title, .sec-title, .stage-name, .stage-label, .sec-tag');
      var desc = block.querySelector('p, .section-desc, .sec-desc, .stage-desc');
      var txt = '';
      if (h)    txt += h.textContent.trim() + '\n\n';
      if (desc) txt += desc.textContent.trim();
      if (!txt) {
        txt = block.textContent.trim().replace(/\s+/g,' ').substring(0, 280);
        if (txt.length === 280) txt += '…';
      }
      html = '<div class="tlp-msg-text">'+esc(txt)+'</div>';
    }

    popover.querySelector('.tlp-body').innerHTML = html;

    /* position popover — set inline position BEFORE adding 'open' class */
    var rect   = item.getBoundingClientRect();
    var sbRect = sidebar.getBoundingClientRect();
    if (window.innerWidth > 900) {
      var top = Math.max(64, Math.min(rect.top, window.innerHeight - 480));
      popover.style.top    = top + 'px';
      popover.style.left   = (sbRect.right + 10) + 'px';
      popover.style.right  = 'auto';
      popover.style.bottom = 'auto';
      popover.style.width  = '340px';
    } else {
      popover.style.top    = 'auto';
      popover.style.left   = '10px';
      popover.style.right  = '10px';
      popover.style.bottom = '12px';
      popover.style.width  = 'auto';
    }

    popover.classList.add('open');
  }

  function closePeek() {
    popover.classList.remove('open');
    popover.removeAttribute('style');
    curBlock = null;
  }

  popover.querySelector('.tlp-close').addEventListener('click', closePeek);
  popover.querySelector('.tlp-btn-scroll').addEventListener('click', function(){
    if (!curBlock) return;
    var b = curBlock; closePeek();
    if (b.href) { window.location.href = b.href; } else { tlScrollTo(b); }
  });
  popover.querySelector('.tlp-btn-edit').addEventListener('click', function(){
    if (!curBlock) return;
    var block = curBlock;
    closePeek(); tlScrollTo(block);
    setTimeout(function(){
      var trigger = document.getElementById('gai-trigger');
      if (trigger && trigger.style.display !== 'none') {
        trigger.click();
        setTimeout(function(){ var el=block.querySelector('.gai-editable'); if(el) el.click(); }, 450);
      } else {
        var el = block.querySelector('.gai-editable');
        if (el) el.click();
      }
    }, 700);
  });

  document.addEventListener('click', function(e){
    if (!popover.classList.contains('open')) return;
    if (!popover.contains(e.target) && !e.target.classList.contains('tl-peek-btn')) closePeek();
  });
  document.addEventListener('keydown', function(e){ if (e.key==='Escape') closePeek(); });
})();
