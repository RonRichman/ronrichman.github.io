/**
 * Reusable group-relative advantage calculator (GRPO outcome supervision).
 * Enter G reward scores for one question; shows mean, population std,
 * normalized advantages Â_i = (r_i - mean) / std, and which outputs are
 * reinforced (Â > 0) vs penalized (Â < 0). No dependencies.
 *
 * Usage:
 *   <div id="sim"></div>
 *   <script src="../assets/group-advantage.js"></script>
 *   <script>
 *     GroupAdvantage.mount(document.getElementById('sim'), {
 *       rewards: [0.2, 0.8, 0.5, 0.9],
 *       labels: ['o1', 'o2', 'o3', 'o4']  // optional
 *     });
 *   </script>
 */
(function (global) {
  'use strict';

  function mean(xs) {
    return xs.reduce(function (a, b) { return a + b; }, 0) / xs.length;
  }
  function pstdev(xs, m) {
    var v = xs.reduce(function (a, x) { return a + (x - m) * (x - m); }, 0) / xs.length;
    return Math.sqrt(v);
  }
  function f(x, d) {
    d = d == null ? 3 : d;
    var s = x.toFixed(d);
    return (x >= 0 ? '\u2009' : '') + s;
  }

  function mount(root, cfg) {
    if (!root) throw new Error('GroupAdvantage.mount: root element required');
    root.className = (root.className ? root.className + ' ' : '') + 'group-advantage';
    root.innerHTML = '';
    var rewards = (cfg.rewards || [0.2, 0.8, 0.5, 0.9]).slice();
    var labels = cfg.labels || rewards.map(function (_, i) { return 'o' + (i + 1); });

    var controls = document.createElement('div');
    controls.className = 'curve-controls';
    var inputs = [];
    rewards.forEach(function (r, i) {
      var lab = document.createElement('label');
      var val = document.createElement('span');
      val.className = 'curve-val';
      val.textContent = String(r);
      var input = document.createElement('input');
      input.type = 'range';
      input.min = '0'; input.max = '1'; input.step = '0.05'; input.value = String(r);
      input.setAttribute('aria-label', labels[i] + ' reward');
      input.addEventListener('input', function () {
        rewards[i] = parseFloat(input.value);
        val.textContent = input.value;
        draw();
      });
      lab.appendChild(document.createTextNode(labels[i] + ' r '));
      lab.appendChild(input);
      lab.appendChild(val);
      controls.appendChild(lab);
      inputs.push(input);
    });

    var table = document.createElement('table');
    var out = document.createElement('p');
    out.className = 'curve-readout';
    out.setAttribute('aria-live', 'polite');
    root.appendChild(controls);
    root.appendChild(table);
    root.appendChild(out);

    function draw() {
      var m = mean(rewards);
      var s = pstdev(rewards, m);
      var A = rewards.map(function (r) { return s > 1e-12 ? (r - m) / s : 0; });
      var html = '<thead><tr><th>output</th><th>r</th><th>r − mean</th><th>Â</th><th>effect</th></tr></thead><tbody>';
      A.forEach(function (a, i) {
        var effect = a > 1e-9 ? 'reinforce' : (a < -1e-9 ? 'penalize' : 'neutral');
        html += '<tr class="' + effect + '"><td>' + labels[i] + '</td><td>' + f(rewards[i]) +
          '</td><td>' + f(rewards[i] - m) + '</td><td>' + f(a) + '</td><td>' + effect + '</td></tr>';
      });
      html += '</tbody>';
      table.innerHTML = html;
      out.textContent = 'mean = ' + f(m) + ' · population std = ' + f(s) +
        ' · Â_i = (r_i − mean) / std  (outcome GRPO; same Â for every token in o_i)';
    }
    draw();
  }

  global.GroupAdvantage = { mount: mount };
})(typeof window !== 'undefined' ? window : globalThis);
