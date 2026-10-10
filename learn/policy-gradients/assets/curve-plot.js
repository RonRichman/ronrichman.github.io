/**
 * Reusable interactive curve plot (SVG + range sliders), no dependencies.
 * Use for any lesson that needs "move a parameter, watch a curve move".
 *
 * Usage:
 *   <div id="plot"></div>
 *   <script src="../assets/curve-plot.js"></script>
 *   <script>
 *     CurvePlot.mount(document.getElementById('plot'), {
 *       xLabel: 'd', yLabel: 'score', xMax: 10, yMin: -1, yMax: 3,
 *       params: [{ key: 'a', label: 'α', min: 0, max: 2, step: 0.05, value: 1 }],
 *       series: [{ label: 'gold', fn: function (x, p) { return p.a * x; }, dashed: false }],
 *       marker: function (p) { return { x: 2, label: 'peak' }; },   // optional
 *       readout: function (p) { return 'text shown under the plot'; } // optional
 *     });
 *   </script>
 */
(function (global) {
  'use strict';
  var NS = 'http://www.w3.org/2000/svg';
  var W = 560, H = 260, PAD = { l: 44, r: 12, t: 12, b: 34 };

  function svgEl(tag, attrs) {
    var n = document.createElementNS(NS, tag);
    Object.keys(attrs || {}).forEach(function (k) { n.setAttribute(k, attrs[k]); });
    return n;
  }

  function mount(root, cfg) {
    if (!root) throw new Error('CurvePlot.mount: root element required');
    root.className = (root.className ? root.className + ' ' : '') + 'curve-plot';
    root.innerHTML = '';
    var p = {};
    var xMax = cfg.xMax || 10, yMin = cfg.yMin == null ? 0 : cfg.yMin, yMax = cfg.yMax || 1;
    function sx(x) { return PAD.l + (x / xMax) * (W - PAD.l - PAD.r); }
    function sy(y) { return PAD.t + (1 - (y - yMin) / (yMax - yMin)) * (H - PAD.t - PAD.b); }

    var svg = svgEl('svg', { viewBox: '0 0 ' + W + ' ' + H, role: 'img', 'aria-label': cfg.ariaLabel || 'Interactive plot' });
    root.appendChild(svg);
    var readout = document.createElement('p');
    readout.className = 'curve-readout';
    readout.setAttribute('aria-live', 'polite');
    var controls = document.createElement('div');
    controls.className = 'curve-controls';
    root.appendChild(controls);
    root.appendChild(readout);

    (cfg.params || []).forEach(function (q) {
      p[q.key] = q.value;
      var lab = document.createElement('label');
      var val = document.createElement('span');
      val.className = 'curve-val';
      val.textContent = String(q.value);
      var input = document.createElement('input');
      input.type = 'range'; input.min = q.min; input.max = q.max; input.step = q.step; input.value = q.value;
      input.addEventListener('input', function () {
        p[q.key] = parseFloat(input.value);
        val.textContent = input.value;
        draw();
      });
      lab.appendChild(document.createTextNode(q.label + ' '));
      lab.appendChild(input);
      lab.appendChild(val);
      controls.appendChild(lab);
    });

    function draw() {
      while (svg.firstChild) svg.removeChild(svg.firstChild);
      // axes
      svg.appendChild(svgEl('line', { x1: sx(0), y1: sy(0), x2: sx(xMax), y2: sy(0), class: 'axis' }));
      svg.appendChild(svgEl('line', { x1: sx(0), y1: sy(yMin), x2: sx(0), y2: sy(yMax), class: 'axis' }));
      var xl = svgEl('text', { x: sx(xMax), y: H - 8, 'text-anchor': 'end', class: 'axis-label' });
      xl.textContent = cfg.xLabel || 'x'; svg.appendChild(xl);
      var yl = svgEl('text', { x: PAD.l + 6, y: PAD.t + 10, class: 'axis-label' });
      yl.textContent = cfg.yLabel || 'y'; svg.appendChild(yl);
      // series
      (cfg.series || []).forEach(function (s, idx) {
        var pts = [], N = 200;
        for (var i = 1; i <= N; i++) {
          var x = (i / N) * xMax, y = s.fn(x, p);
          if (!isFinite(y)) continue;
          y = Math.max(yMin, Math.min(yMax, y));
          pts.push(sx(x).toFixed(1) + ',' + sy(y).toFixed(1));
        }
        svg.appendChild(svgEl('polyline', { points: pts.join(' '), class: 'series s' + idx + (s.dashed ? ' dashed' : '') }));
        var lx = (s.labelAt || 0.92) * xMax, ly = Math.max(yMin, Math.min(yMax, s.fn(lx, p)));
        var t = svgEl('text', { x: sx(lx), y: sy(ly) - 6, 'text-anchor': 'end', class: 'series-label s' + idx });
        t.textContent = s.label; svg.appendChild(t);
      });
      // marker
      if (cfg.marker) {
        var m = cfg.marker(p);
        if (m && isFinite(m.x) && m.x > 0 && m.x <= xMax) {
          svg.appendChild(svgEl('line', { x1: sx(m.x), y1: sy(yMin), x2: sx(m.x), y2: sy(yMax), class: 'marker' }));
          var mt = svgEl('text', { x: sx(m.x) + 4, y: PAD.t + 10, class: 'marker-label' });
          mt.textContent = m.label || ''; svg.appendChild(mt);
        }
      }
      readout.textContent = cfg.readout ? cfg.readout(p) : '';
    }
    draw();
    return root;
  }

  global.CurvePlot = { mount: mount };
})(typeof window !== 'undefined' ? window : this);
