/**
 * Reusable "take it apart" widget: a clickable file tree; clicking a part
 * shows its role and a note. Usage:
 *   Anatomy.mount(el, { parts: [{ label:'tests/test.sh', depth:1, role:'Verifier', note:'...' }] });
 */
(function (g) {
  'use strict';
  function mount(root, cfg) {
    root.className = (root.className ? root.className + ' ' : '') + 'anatomy';
    var tree = document.createElement('div'); tree.className = 'anatomy-tree';
    var detail = document.createElement('div'); detail.className = 'anatomy-detail';
    detail.textContent = cfg.prompt || 'Click a part to see what job it does.';
    var btns = [];
    cfg.parts.forEach(function (p) {
      var line = document.createElement('div');
      for (var i = 0; i < (p.depth || 0); i++) { var s = document.createElement('span'); s.className = 'indent'; line.appendChild(s); }
      var b = document.createElement('button'); b.type = 'button'; b.textContent = p.label;
      b.addEventListener('click', function () {
        btns.forEach(function (x) { x.classList.remove('active'); }); b.classList.add('active');
        detail.innerHTML = '';
        var r = document.createElement('span'); r.className = 'role'; r.textContent = p.role; detail.appendChild(r);
        var n = document.createElement('span'); n.innerHTML = p.note; detail.appendChild(n);
      });
      btns.push(b); line.appendChild(b); tree.appendChild(line);
    });
    root.appendChild(tree); root.appendChild(detail);
  }
  g.Anatomy = { mount: mount };
})(typeof window !== 'undefined' ? window : this);
