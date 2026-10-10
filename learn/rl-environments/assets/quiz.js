/**
 * Reusable in-browser quiz widget.
 * Immediate feedback. Author must keep options equal in word count AND
 * character count so length does not leak the answer.
 *
 * Usage:
 *   <div id="quiz"></div>
 *   <script src="../assets/quiz.js"></script>
 *   <script>
 *     Quiz.mount(document.getElementById('quiz'), {
 *       title: 'Check yourself',
 *       questions: [{
 *         prompt: '...?',
 *         options: ['equal length A', 'equal length B', ...],
 *         correct: 0,
 *         explanation: 'Why A is right.'
 *       }]
 *     });
 *   </script>
 */
(function (global) {
  'use strict';

  function el(tag, attrs, children) {
    var node = document.createElement(tag);
    if (attrs) {
      Object.keys(attrs).forEach(function (k) {
        if (k === 'className') node.className = attrs[k];
        else if (k === 'text') node.textContent = attrs[k];
        else if (k.indexOf('on') === 0 && typeof attrs[k] === 'function') {
          node.addEventListener(k.slice(2).toLowerCase(), attrs[k]);
        } else {
          node.setAttribute(k, attrs[k]);
        }
      });
    }
    (children || []).forEach(function (c) {
      if (c == null) return;
      node.appendChild(typeof c === 'string' ? document.createTextNode(c) : c);
    });
    return node;
  }

  function warnUnequalLengths(options, qIndex) {
    var words = options.map(function (o) { return o.trim().split(/\s+/).length; });
    var chars = options.map(function (o) { return o.length; });
    var w0 = words[0], c0 = chars[0];
    var bad = words.some(function (w) { return w !== w0; }) ||
              chars.some(function (c) { return c !== c0; });
    if (bad && typeof console !== 'undefined' && console.warn) {
      console.warn(
        '[Quiz] Q' + (qIndex + 1) +
        ' options differ in length (words=' + words.join(',') +
        ' chars=' + chars.join(',') + '). Equalize to avoid leaking the answer.'
      );
    }
  }

  function renderQuestion(q, index, total) {
    warnUnequalLengths(q.options, index);

    var feedback = el('div', { className: 'quiz-feedback', 'aria-live': 'polite' });
    var answered = false;

    var buttons = q.options.map(function (label, i) {
      return el('button', {
        type: 'button',
        text: label,
        onclick: function () {
          if (answered) return;
          answered = true;
          var ok = i === q.correct;
          buttons.forEach(function (b, j) {
            b.disabled = true;
            if (j === q.correct) b.classList.add('correct');
            else if (j === i && !ok) b.classList.add('wrong');
          });
          feedback.className = 'quiz-feedback ' + (ok ? 'ok' : 'bad');
          feedback.textContent = (ok ? 'Correct. ' : 'Not quite. ') + (q.explanation || '');
        }
      });
    });

    return el('div', { className: 'quiz-q', 'data-q': String(index) }, [
      el('div', { className: 'quiz-progress', text: 'Question ' + (index + 1) + ' of ' + total }),
      el('p', { className: 'prompt', text: q.prompt }),
      el('div', { className: 'quiz-options', role: 'group' }, buttons),
      feedback
    ]);
  }

  function mount(root, config) {
    if (!root) throw new Error('Quiz.mount: root element required');
    config = config || {};
    var questions = config.questions || [];
    root.className = (root.className ? root.className + ' ' : '') + 'quiz';
    root.innerHTML = '';

    if (config.title) {
      root.appendChild(el('h2', { text: config.title }));
    }
    if (config.intro) {
      root.appendChild(el('p', { text: config.intro }));
    }

    questions.forEach(function (q, i) {
      root.appendChild(renderQuestion(q, i, questions.length));
    });

    return root;
  }

  global.Quiz = { mount: mount };
})(typeof window !== 'undefined' ? window : this);
