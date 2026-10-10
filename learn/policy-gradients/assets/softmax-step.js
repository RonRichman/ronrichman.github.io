/**
 * Reusable one-step softmax policy-gradient simulator, no dependencies.
 * Tabular softmax over N actions in one state. Sliders set the starting
 * probabilities (via logits) and per-action rewards. The widget centres
 * rewards into advantages A = r - E_pi[r], applies the expected vanilla PG
 * step on the logits, z_a += eta * pi(a) * A(a) (Cui et al. 2025, Prop. 1),
 * and reports entropy before/after plus the first-order prediction
 * dH ~ -eta * Cov_pi(log pi, pi * A) (Cui et al. 2025, Thm. 1).
 *
 * Usage:
 *   <div id="sim"></div>
 *   <script src="../assets/softmax-step.js"></script>
 *   <script>
 *     SoftmaxStep.mount(document.getElementById('sim'), {
 *       actions: [{ label: 'chain ladder', p: 0.7, r: 1 }, ...],
 *       eta: 1
 *     });
 *   </script>
 */
(function (global) {
  'use strict';

  function softmax(z) {
    var m = Math.max.apply(null, z);
    var e = z.map(function (v) { return Math.exp(v - m); });
    var s = e.reduce(function (a, b) { return a + b; }, 0);
    return e.map(function (v) { return v / s; });
  }
  function entropy(p) {
    return -p.reduce(function (acc, v) { return acc + (v > 0 ? v * Math.log(v) : 0); }, 0);
  }
  function f(x, d) { return (x >= 0 ? '\u2009' : '') + x.toFixed(d == null ? 3 : d); }

  function slider(labelText, min, max, step, value, onInput) {
    var lab = document.createElement('label');
    var val = document.createElement('span');
    val.className = 'curve-val';
    val.textContent = String(value);
    var input = document.createElement('input');
    input.type = 'range'; input.min = min; input.max = max; input.step = step; input.value = value;
    input.addEventListener('input', function () { val.textContent = input.value; onInput(parseFloat(input.value)); });
    lab.appendChild(document.createTextNode(labelText + ' '));
    lab.appendChild(input);
    lab.appendChild(val);
    return lab;
  }

  function mount(root, cfg) {
    if (!root) throw new Error('SoftmaxStep.mount: root element required');
    root.className = (root.className ? root.className + ' ' : '') + 'softmax-step';
    root.innerHTML = '';
    var acts = cfg.actions.map(function (a) { return { label: a.label, w: a.p, r: a.r }; });
    var eta = cfg.eta == null ? 1 : cfg.eta;

    var controls = document.createElement('div');
    controls.className = 'curve-controls';
    acts.forEach(function (a) {
      controls.appendChild(slider(a.label + ' weight', 0.05, 1, 0.05, a.w, function (v) { a.w = v; draw(); }));
      controls.appendChild(slider('reward', 0, 1, 0.1, a.r, function (v) { a.r = v; draw(); }));
    });
    controls.appendChild(slider('η', 0.1, 3, 0.1, eta, function (v) { eta = v; draw(); }));

    var table = document.createElement('table');
    var out = document.createElement('p');
    out.className = 'curve-readout';
    out.setAttribute('aria-live', 'polite');
    root.appendChild(controls);
    root.appendChild(table);
    root.appendChild(out);

    function draw() {
      var tot = acts.reduce(function (s, a) { return s + a.w; }, 0);
      var p = acts.map(function (a) { return a.w / tot; });
      var z = p.map(Math.log);
      var base = p.reduce(function (s, v, i) { return s + v * acts[i].r; }, 0);
      var A = acts.map(function (a) { return a.r - base; });
      var y = p.map(function (v, i) { return v * A[i]; });
      var lp = p.map(Math.log);
      var El = p.reduce(function (s, v, i) { return s + v * lp[i]; }, 0);
      var Ey = p.reduce(function (s, v, i) { return s + v * y[i]; }, 0);
      var cov = p.reduce(function (s, v, i) { return s + v * (lp[i] - El) * (y[i] - Ey); }, 0);
      var z2 = z.map(function (v, i) { return v + eta * y[i]; });
      var p2 = softmax(z2);
      var H = entropy(p), H2 = entropy(p2);

      var rows = '<thead><tr><th>action</th><th>π(a)</th><th>log π</th><th>A(a)</th><th>π·A</th><th>π after</th></tr></thead><tbody>';
      acts.forEach(function (a, i) {
        rows += '<tr><td>' + a.label + '</td><td>' + f(p[i]) + '</td><td>' + f(lp[i]) + '</td><td>' + f(A[i]) +
          '</td><td>' + f(y[i]) + '</td><td>' + f(p2[i]) + '</td></tr>';
      });
      table.innerHTML = rows + '</tbody>';
      out.textContent = 'Cov(log π, π·A) = ' + f(cov, 4) + '. Predicted ΔH ≈ −η·Cov = ' + f(-eta * cov, 4) +
        ' nats. Actual ΔH after one step = ' + f(H2 - H, 4) + ' nats (H: ' + H.toFixed(3) + ' → ' + H2.toFixed(3) + '). ' +
        (cov > 0 ? 'Positive covariance: the policy gets more certain.' : 'Negative covariance: the policy spreads out.');
    }
    draw();
    return root;
  }

  global.SoftmaxStep = { mount: mount };
})(typeof window !== 'undefined' ? window : this);
