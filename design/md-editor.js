/* ============================================================
   Inmemnote · live-markdown editor (prototype)
   Rules:
   - Block + inline syntax markers are visible ONLY on the line
     that holds the caret (the "active" line).
   - Styling is ALWAYS applied (active or not). Typing a marker
     restyles the line immediately.
   - List lines show a rendered bullet / number when inactive,
     and the raw "1)" / "-" marker when active.
   Supported: # ## ###, 1) / 1., - * +, > , **bold**, _italic_, `code`
   ============================================================ */
(function () {
  function escapeHtml(s) {
    return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  }

  function parseBlock(raw) {
    let m;
    if ((m = raw.match(/^(#{1,3})\s/)))
      return { type: "h" + m[1].length, marker: m[0], rest: raw.slice(m[0].length) };
    if ((m = raw.match(/^(\d+)([.)])\s/)))
      return { type: "ol", num: m[1], marker: m[0], rest: raw.slice(m[0].length) };
    if ((m = raw.match(/^([-*+])\s/)))
      return { type: "ul", marker: m[0], rest: raw.slice(m[0].length) };
    if ((m = raw.match(/^(>)\s/)))
      return { type: "quote", marker: m[0], rest: raw.slice(m[0].length) };
    return { type: "p", marker: "", rest: raw };
  }

  // inline markdown -> spans; markers wrapped in .mk so they can be hidden
  function inlineRender(text) {
    let html = "", i = 0;
    const n = text.length;
    while (i < n) {
      if (text.startsWith("**", i)) {
        const end = text.indexOf("**", i + 2);
        if (end !== -1) {
          html += '<span class="b"><span class="mk">**</span>' +
            escapeHtml(text.slice(i + 2, end)) + '<span class="mk">**</span></span>';
          i = end + 2; continue;
        }
      }
      if (text[i] === "_") {
        const end = text.indexOf("_", i + 1);
        if (end !== -1) {
          html += '<span class="i"><span class="mk">_</span>' +
            escapeHtml(text.slice(i + 1, end)) + '<span class="mk">_</span></span>';
          i = end + 1; continue;
        }
      }
      if (text[i] === "`") {
        const end = text.indexOf("`", i + 1);
        if (end !== -1) {
          html += '<span class="code"><span class="mk">`</span>' +
            escapeHtml(text.slice(i + 1, end)) + '<span class="mk">`</span></span>';
          i = end + 1; continue;
        }
      }
      html += escapeHtml(text[i]); i++;
    }
    return html;
  }

  function lineInner(raw) {
    if (raw === "") return "<br>";
    const b = parseBlock(raw);
    const markHTML = b.marker ? '<span class="mark">' + escapeHtml(b.marker) + "</span>" : "";
    const dataNum = b.type === "ol" ? ' data-num="' + b.num + '"' : "";
    const rest = inlineRender(b.rest);
    return markHTML + '<span class="rest"' + dataNum + ">" + rest + "</span>";
  }

  function lineClass(raw) { return "ln " + parseBlock(raw).type; }

  // ---- caret helpers (char offset within a line element) ----
  function getCaretOffset(el) {
    const sel = window.getSelection();
    if (!sel.rangeCount) return 0;
    const range = sel.getRangeAt(0);
    const pre = range.cloneRange();
    pre.selectNodeContents(el);
    pre.setEnd(range.endContainer, range.endOffset);
    return pre.toString().length;
  }
  function setCaretOffset(el, offset) {
    const sel = window.getSelection();
    const range = document.createRange();
    const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT, null);
    let remaining = offset, placed = false;
    while (walker.nextNode()) {
      const t = walker.currentNode;
      const len = t.nodeValue.length;
      if (remaining <= len) { range.setStart(t, remaining); placed = true; break; }
      remaining -= len;
    }
    if (!placed) { range.selectNodeContents(el); range.collapse(false); }
    else range.collapse(true);
    sel.removeAllRanges();
    sel.addRange(range);
  }

  function init(editor, seed, onChange) {
    let lines = seed.slice();
    function notify() { if (typeof onChange === "function") onChange(lines.slice()); }

    function renderAll() {
      editor.innerHTML = lines
        .map((raw, i) => '<div class="' + lineClass(raw) + '" data-i="' + i + '">' + lineInner(raw) + "</div>")
        .join("");
    }
    function lineEl(i) { return editor.querySelector('.ln[data-i="' + i + '"]'); }
    function activeLine() {
      const sel = window.getSelection();
      if (!sel.rangeCount) return null;
      let node = sel.anchorNode;
      if (!node || !editor.contains(node)) return null;
      return node.nodeType === 3 ? node.parentElement.closest(".ln") : node.closest(".ln");
    }
    function setActive(ln) {
      editor.querySelectorAll(".ln.active").forEach((e) => { if (e !== ln) e.classList.remove("active"); });
      if (ln) ln.classList.add("active");
    }

    // typing within a line -> reparse just that line, keep caret
    editor.addEventListener("input", () => {
      const ln = activeLine();
      if (!ln) return;
      const i = +ln.dataset.i;
      const off = getCaretOffset(ln);
      const raw = ln.textContent;
      lines[i] = raw;
      ln.className = lineClass(raw) + " active";
      ln.innerHTML = lineInner(raw);
      setCaretOffset(ln, off);
      notify();
    });

    // structural keys
    editor.addEventListener("keydown", (e) => {
      const ln = activeLine();
      if (!ln) return;
      const i = +ln.dataset.i;
      const off = getCaretOffset(ln);
      if (e.key === "Enter") {
        e.preventDefault();
        const raw = lines[i];
        lines.splice(i, 1, raw.slice(0, off), raw.slice(off));
        renderAll();
        const nl = lineEl(i + 1);
        setActive(nl); setCaretOffset(nl, 0);
        notify();
      } else if (e.key === "Backspace" && off === 0 && i > 0) {
        e.preventDefault();
        const prevLen = lines[i - 1].length;
        lines[i - 1] = lines[i - 1] + lines[i];
        lines.splice(i, 1);
        renderAll();
        const pl = lineEl(i - 1);
        setActive(pl); setCaretOffset(pl, prevLen);
        notify();
      }
    });

    document.addEventListener("selectionchange", () => {
      if (document.activeElement !== editor) return;
      setActive(activeLine());
    });
    editor.addEventListener("blur", () => {
      editor.querySelectorAll(".ln.active").forEach((e) => e.classList.remove("active"));
    });

    renderAll();

    return {
      focusLine(i, off) {
        editor.focus();
        const ln = lineEl(i);
        if (!ln) return;
        setActive(ln);
        setCaretOffset(ln, off == null ? (lines[i] || "").length : off);
      },
      getLines() { return lines.slice(); },
      setLines(newSeed) {
        lines = (newSeed || []).slice();
        if (lines.length === 0) lines = [""];
        renderAll();
      },
    };
  }

  window.InmemEditor = { init };
})();
