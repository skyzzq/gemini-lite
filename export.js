/* Gemini Lite —— 面板导出
 *
 * 为什么自己做：Gemini 自己的「分享和导出 → Google 文档」是把整棵对话 DOM
 * 序列化后交给 Docs API。Deep Research 报告动辄 2.5 万节点、几百个 <math>，
 * Docs API 不认 MathML，前端要逐个转 LaTeX/图片，全程同步跑在主线程 ——
 * 实测就是卡死。这里改成在本地直接把面板内容序列化成文本，不联网、不转码。
 *
 * 输出三种：Markdown(.md) / Word(.docx) / 单文件 HTML(.html)。
 * 公式一律取 KaTeX 留在 <annotation encoding="application/x-tex"> 里的原始 TeX，
 * 所以 .md 里是 $tex$，.docx 里是纯文本 TeX，.html 里保留原生 MathML 可渲染。
 */
(function () {
  'use strict';
  if (window.__gmExport) return;

  const SKIP_TAGS = new Set(['BUTTON', 'SVG', 'SCRIPT', 'STYLE', 'TEMPLATE', 'NOSCRIPT']);
  /* 注意不要跳过 gml-cv / gml-folded：那是我们给正文块加的渲染标记，
     跳了就等于把整篇报告跳掉（第一版就是这么踩的）。只跳真正的 UI 容器。 */
  const SKIP_CLASS = /(^|\s)(gml-hud|gml-menu|gml-toolbar|mat-icon|material-icons|cdk-visually-hidden|screen-reader)/;

  function skipNode(el) {
    if (!el || el.nodeType !== 1) return false;
    if (SKIP_TAGS.has(el.tagName)) return true;
    if (el.hasAttribute && (el.hasAttribute('data-gmlbar') || el.hasAttribute('aria-hidden'))) {
      if (el.getAttribute('aria-hidden') === 'true') return true;
      if (el.hasAttribute('data-gmlbar')) return true;
    }
    const cls = el.getAttribute && el.getAttribute('class');
    if (cls && SKIP_CLASS.test(cls)) return true;
    return false;
  }

  /* ---------- 1. DOM → 结构化块 ---------- */

  function texOf(katex) {
    const a = katex.querySelector('annotation[encoding="application/x-tex"]');
    if (a && a.textContent) return a.textContent.trim();
    const m = katex.querySelector('math');
    return m ? (m.textContent || '').trim() : '';
  }

  function inlineOf(node, out) {
    out = out || [];
    if (!node) return out;
    if (node.nodeType === 3) {
      const v = node.nodeValue.replace(/[\s\u00a0]+/g, ' ');
      if (v) out.push({ t: 'text', v: v });
      return out;
    }
    if (node.nodeType !== 1) return out;
    if (skipNode(node)) return out;

    const tag = node.tagName;
    if (tag === 'BR') { out.push({ t: 'text', v: '\n' }); return out; }

    if (node.classList && node.classList.contains('katex')) {
      const tex = texOf(node);
      const display = !!(node.closest && node.closest('.katex-display'));
      if (tex) { out.push({ t: 'math', tex: tex, display: display }); return out; }
      /* 真实页面里有一部分 KaTeX 是 output:'html' 渲染的，既没有 <math>
         也没有 annotation，取不到 TeX 原文 —— 那就退化成它显示出来的字，
         总比整条公式丢掉好 */
      const plain = (node.textContent || '').replace(/\s+/g, ' ').trim();
      if (plain) out.push({ t: 'text', v: plain });
      return out;
    }
    if (tag === 'CODE' && !(node.parentElement && node.parentElement.tagName === 'PRE')) {
      out.push({ t: 'code', v: node.textContent });
      return out;
    }
    if (tag === 'STRONG' || tag === 'B') { out.push({ t: 'bold', v: node.textContent }); return out; }
    if (tag === 'EM' || tag === 'I') { out.push({ t: 'italic', v: node.textContent }); return out; }
    if (tag === 'A') {
      const href = node.getAttribute('href') || '';
      out.push({ t: 'link', href: href, v: node.textContent.trim() });
      return out;
    }
    if (tag === 'IMG') {
      out.push({ t: 'img', src: node.getAttribute('src') || '', alt: node.getAttribute('alt') || '' });
      return out;
    }
    for (const c of node.childNodes) inlineOf(c, out);
    return out;
  }

  function textOf(inlines) {
    return (inlines || []).map(function (i) {
      if (i.t === 'math') return '$' + i.tex + '$';
      return i.v || '';
    }).join('').replace(/\s+/g, ' ').trim();
  }

  function blocksOf(root) {
    const blocks = [];

    function pushText(tag, el) {
      const inl = inlineOf(el).filter(function (i) { return !(i.t === 'text' && !i.v.trim()); });
      if (!inl.length) return;
      blocks.push({ type: 'text', kind: tag, inlines: inl });
    }

    function walk(el) {
      for (const child of el.children) {
        if (skipNode(child)) continue;
        const tag = child.tagName;

        if (/^H[1-6]$/.test(tag)) { pushText('h' + tag[1], child); continue; }
        if (tag === 'P') { pushText('p', child); continue; }
        if (tag === 'BLOCKQUOTE') { pushText('quote', child); continue; }
        if (tag === 'HR') { blocks.push({ type: 'hr' }); continue; }

        if (tag === 'PRE') {
          const code = child.querySelector('code') || child;
          const cls = (code.getAttribute('class') || '') + ' ' + (child.getAttribute('class') || '');
          const m = /language-([\w+#-]+)/.exec(cls);
          const txt = (code.textContent || '').replace(/\n+$/, '');
          if (txt.trim()) blocks.push({ type: 'code', lang: m ? m[1] : '', code: txt });
          continue;
        }

        if (tag === 'UL' || tag === 'OL') {
          const items = [];
          for (const li of child.children) {
            if (li.tagName !== 'LI' || skipNode(li)) continue;
            const inl = inlineOf(li);
            if (textOf(inl)) items.push(inl);
            /* 嵌套列表压平成同级，缩进两格 */
            for (const sub of li.querySelectorAll(':scope > ul > li, :scope > ol > li')) {
              const si = inlineOf(sub);
              if (textOf(si)) items.push([{ t: 'text', v: '  - ' }].concat(si));
            }
          }
          if (items.length) blocks.push({ type: 'list', ordered: tag === 'OL', items: items });
          continue;
        }

        if (tag === 'TABLE') {
          const rows = [];
          for (const tr of child.querySelectorAll('tr')) {
            const cells = [];
            for (const cell of tr.children) {
              if (cell.tagName !== 'TD' && cell.tagName !== 'TH') continue;
              const inl = inlineOf(cell);
              cells.push({ inlines: inl, head: cell.tagName === 'TH' });
            }
            if (cells.length) rows.push(cells);
          }
          if (rows.length) blocks.push({ type: 'table', rows: rows });
          continue;
        }

        /* 结构容器（div / section / 自定义元素）：往下走，
           但如果它本身只有行内内容（没有块级子元素），就当段落处理 */
        const hasBlockChild = Array.from(child.children).some(function (c) {
          if (skipNode(c)) return false;
          if (/^(P|DIV|SECTION|ARTICLE|UL|OL|LI|TABLE|PRE|H[1-6]|BLOCKQUOTE|HR|FIGURE|DETAILS|SUMMARY)$/.test(c.tagName)) return true;
          return c.tagName.indexOf('-') > 0;   /* 自定义元素当容器 */
        });
        if (hasBlockChild) { walk(child); continue; }

        const inl = inlineOf(child).filter(function (i) { return !(i.t === 'text' && !i.v.trim()); });
        if (textOf(inl)) blocks.push({ type: 'text', kind: 'p', inlines: inl });
      }
    }

    walk(root);
    return blocks;
  }

  /* ---------- 2. 块 → Markdown ---------- */

  function mdInline(inlines) {
    return (inlines || []).map(function (i) {
      switch (i.t) {
        case 'code': return '`' + i.v.replace(/`/g, '\\`') + '`';
        case 'bold': return '**' + i.v.trim() + '**';
        case 'italic': return '*' + i.v.trim() + '*';
        case 'link': return i.v ? '[' + i.v + '](' + i.href + ')' : i.href;
        case 'img': return '![' + (i.alt || '') + '](' + i.src + ')';
        case 'math': return (i.display ? '\n$$\n' + i.tex + '\n$$\n' : '$' + i.tex + '$');
        default: return i.v || '';
      }
    }).join('').replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
  }

  function toMarkdown(blocks, title) {
    const out = [];
    if (title) out.push('# ' + title, '');
    for (const b of blocks) {
      if (b.type === 'hr') { out.push('---', ''); continue; }
      if (b.type === 'text') {
        const t = mdInline(b.inlines);
        if (!t) continue;
        if (b.kind && b.kind[0] === 'h') out.push('#'.repeat(Number(b.kind[1])) + ' ' + t, '');
        else if (b.kind === 'quote') out.push('> ' + t.replace(/\n/g, '\n> '), '');
        else out.push(t, '');
        continue;
      }
      if (b.type === 'list') {
        b.items.forEach(function (item, idx) {
          out.push((b.ordered ? (idx + 1) + '. ' : '- ') + mdInline(item));
        });
        out.push('');
        continue;
      }
      if (b.type === 'code') {
        out.push('```' + (b.lang || ''), b.code, '```', '');
        continue;
      }
      if (b.type === 'table') {
        const rows = b.rows.map(function (r) {
          return r.map(function (c) { return mdInline(c.inlines).replace(/\n/g, ' ').replace(/\|/g, '\\|'); });
        });
        const width = Math.max.apply(null, rows.map(function (r) { return r.length; }));
        rows.forEach(function (r) { while (r.length < width) r.push(''); });
        out.push('| ' + rows[0].join(' | ') + ' |');
        out.push('| ' + rows[0].map(function () { return '---'; }).join(' | ') + ' |');
        for (let i = 1; i < rows.length; i++) out.push('| ' + rows[i].join(' | ') + ' |');
        out.push('');
        continue;
      }
    }
    return out.join('\n').replace(/\n{3,}/g, '\n\n').trim() + '\n';
  }

  /* ---------- 3. 块 → 单文件 HTML（公式保留 MathML） ---------- */

  function esc(s) {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  function htmlInline(inlines) {
    return (inlines || []).map(function (i) {
      switch (i.t) {
        case 'code': return '<code>' + esc(i.v) + '</code>';
        case 'bold': return '<strong>' + esc(i.v) + '</strong>';
        case 'italic': return '<em>' + esc(i.v) + '</em>';
        case 'link': return '<a href="' + esc(i.href) + '">' + esc(i.v || i.href) + '</a>';
        case 'img': return '<img src="' + esc(i.src) + '" alt="' + esc(i.alt || '') + '">';
        case 'math': return '<span class="tex">' + esc(i.tex) + '</span>';
        default: return esc(i.v || '');
      }
    }).join('');
  }

  function toHtmlDoc(root, title) {
    /* 直接克隆 DOM 再修：MathML 原样保留，浏览器能自己排公式，
       比在 JS 里重建一遍靠谱得多 */
    const clone = root.cloneNode(true);
    clone.querySelectorAll('[data-gmlbar],button,svg,script,style').forEach(function (n) { n.remove(); });
    /* KaTeX 的可见部分靠它自己的 CSS，脱离页面就散架；
       换成它内部的 MathML 版本，任何浏览器都能渲染 */
    clone.querySelectorAll('.katex').forEach(function (k) {
      const math = k.querySelector('.katex-mathml math');
      if (!math) { k.remove(); return; }
      const wrap = document.createElement('span');
      wrap.appendChild(math.cloneNode(true));
      k.replaceWith(wrap);
    });
    clone.querySelectorAll('.katex-display').forEach(function (d) {
      if (!d.textContent.trim() && !d.querySelector('math')) d.remove();
    });

    const body = clone.innerHTML;
    return '<!doctype html>\n<html lang="zh-CN"><head><meta charset="utf-8">' +
      '<title>' + esc(title || 'Gemini 报告') + '</title>' +
      '<style>' +
      'body{max-width:52em;margin:2em auto;padding:0 1em;' +
      'font:16px/1.65 system-ui,-apple-system,"Segoe UI","Noto Sans CJK SC",sans-serif;color:#1f1f1f}' +
      'h1,h2,h3,h4{line-height:1.3;margin:1.6em 0 .6em}' +
      'table{border-collapse:collapse;margin:1em 0;font-size:.95em}' +
      'td,th{border:1px solid #d6d6d6;padding:6px 10px;vertical-align:top;text-align:left}' +
      'th{background:#f5f5f5}' +
      'pre{background:#f6f8fa;padding:12px;overflow:auto;border-radius:6px;font-size:.9em}' +
      'code{font-family:ui-monospace,Consolas,monospace}' +
      'blockquote{margin:1em 0;padding-left:1em;border-left:3px solid #d0d0d0;color:#555}' +
      'math{font-size:1.05em}' +
      'img{max-width:100%}' +
      '@media print{body{max-width:none;margin:0}}' +
      '</style></head><body>\n' + body + '\n</body></html>\n';
  }

  /* ---------- 4. 最小 zip（store 模式）—— 只为打包 docx ---------- */

  const CRC_TABLE = (function () {
    const t = new Uint32Array(256);
    for (let i = 0; i < 256; i++) {
      let c = i;
      for (let k = 0; k < 8; k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
      t[i] = c >>> 0;
    }
    return t;
  })();

  function crc32(u8) {
    let c = 0xFFFFFFFF;
    for (let i = 0; i < u8.length; i++) c = CRC_TABLE[(c ^ u8[i]) & 0xFF] ^ (c >>> 8);
    return (c ^ 0xFFFFFFFF) >>> 0;
  }

  function zipStore(files) {
    const enc = new TextEncoder();
    const d = new Date();
    const dosTime = ((d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1)) & 0xFFFF;
    const dosDate = (((d.getFullYear() - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate()) & 0xFFFF;
    const parts = [];
    const central = [];
    let offset = 0;

    for (const f of files) {
      const name = enc.encode(f.name);
      const data = f.data;
      const crc = crc32(data);

      const lh = new DataView(new ArrayBuffer(30));
      lh.setUint32(0, 0x04034b50, true);
      lh.setUint16(4, 20, true);
      lh.setUint16(6, 0, true);
      lh.setUint16(8, 0, true);
      lh.setUint16(10, dosTime, true);
      lh.setUint16(12, dosDate, true);
      lh.setUint32(14, crc, true);
      lh.setUint32(18, data.length, true);
      lh.setUint32(22, data.length, true);
      lh.setUint16(26, name.length, true);
      lh.setUint16(28, 0, true);
      parts.push(new Uint8Array(lh.buffer), name, data);

      const cd = new DataView(new ArrayBuffer(46));
      cd.setUint32(0, 0x02014b50, true);
      cd.setUint16(4, 20, true);
      cd.setUint16(6, 20, true);
      cd.setUint16(8, 0, true);
      cd.setUint16(10, 0, true);
      cd.setUint16(12, dosTime, true);
      cd.setUint16(14, dosDate, true);
      cd.setUint32(16, crc, true);
      cd.setUint32(20, data.length, true);
      cd.setUint32(24, data.length, true);
      cd.setUint16(28, name.length, true);
      cd.setUint16(30, 0, true);
      cd.setUint16(32, 0, true);
      cd.setUint16(34, 0, true);
      cd.setUint16(36, 0, true);
      cd.setUint32(38, 0, true);
      cd.setUint32(42, offset, true);
      central.push(new Uint8Array(cd.buffer), name);

      offset += 30 + name.length + data.length;
    }

    let cdSize = 0;
    for (const c of central) cdSize += c.length;
    const eocd = new DataView(new ArrayBuffer(22));
    eocd.setUint32(0, 0x06054b50, true);
    eocd.setUint16(8, files.length, true);
    eocd.setUint16(10, files.length, true);
    eocd.setUint32(12, cdSize, true);
    eocd.setUint32(16, offset, true);
    return new Blob(parts.concat(central, [new Uint8Array(eocd.buffer)]), { type: 'application/zip' });
  }

  /* ---------- 5. 块 → Word（最小 OOXML） ---------- */

  function xesc(s) {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/\t/g, ' ');
  }

  function wRun(text, opt) {
    opt = opt || {};
    const props = [];
    if (opt.b) props.push('<w:b/><w:bCs/>');
    if (opt.i) props.push('<w:i/>');
    if (opt.mono) props.push('<w:rFonts w:ascii="Consolas" w:hAnsi="Consolas" w:eastAsia="Consolas"/>');
    const sz = opt.sz || 22; /* half-points: 22 = 11pt */
    props.push('<w:sz w:val="' + sz + '"/><w:szCs w:val="' + sz + '"/>');
    if (opt.color) props.push('<w:color w:val="' + opt.color + '"/>');
    return '<w:r><w:rPr>' + props.join('') + '</w:rPr><w:t xml:space="preserve">' + xesc(text) + '</w:t></w:r>';
  }

  function wPara(runs, opt) {
    opt = opt || {};
    const pPr = [];
    if (opt.style) pPr.push('<w:pStyle w:val="' + opt.style + '"/>');
    if (opt.before != null) pPr.push('<w:spacing w:before="' + opt.before + '" w:after="' + (opt.after || 0) + '"/>');
    if (opt.shade) pPr.push('<w:shd w:val="clear" w:color="auto" w:fill="' + opt.shade + '"/>');
    if (opt.css) pPr.push('<w:pBdr><w:left w:val="single" w:sz="18" w:space="6" w:color="D0D0D0"/></w:pBdr>');
    return '<w:p>' + (pPr.length ? '<w:pPr>' + pPr.join('') + '</w:pPr>' : '') + (runs || '') + '</w:p>';
  }

  function wInline(inlines) {
    return (inlines || []).map(function (i) {
      switch (i.t) {
        case 'code': return wRun(i.v, { mono: true, color: 'A31515' });
        case 'bold': return wRun(i.v, { b: true });
        case 'italic': return wRun(i.v, { i: true });
        case 'link': return wRun((i.v || i.href) + ' ', { color: '1155CC' });
        case 'img': return wRun('[图片: ' + (i.alt || i.src) + ']', { color: '666666' });
        case 'math': return wRun((i.display ? '  ' : '') + i.tex + (i.display ? '  ' : ''), { mono: true, color: '1F4E79' });
        default: return wRun(i.v || '');
      }
    }).join('');
  }

  function toDocx(blocks, title) {
    const body = [];
    if (title) body.push(wPara(wRun(title, { b: true, sz: 44 }), { after: 240 }));

    for (const b of blocks) {
      if (b.type === 'hr') { body.push(wPara(wRun('─'.repeat(40), { color: '999999' }))); continue; }
      if (b.type === 'text') {
        const t = textOf(b.inlines);
        if (!t) continue;
        if (b.kind && b.kind[0] === 'h') {
          const lvl = Number(b.kind[1]);
          const sz = [0, 36, 32, 28, 26, 24, 22][lvl] || 22;
          body.push(wPara(wRun(t, { b: true, sz: sz }), { before: 240, after: 120 }));
          continue;
        }
        if (b.kind === 'quote') {
          body.push(wPara(wInline(b.inlines), { css: true }));
          continue;
        }
        body.push(wPara(wInline(b.inlines)));
        continue;
      }
      if (b.type === 'list') {
        b.items.forEach(function (item, idx) {
          const mark = b.ordered ? (idx + 1) + '. ' : '• ';
          body.push(wPara(wRun(mark) + wInline(item)));
        });
        continue;
      }
      if (b.type === 'code') {
        for (const line of b.code.split('\n')) {
          body.push(wPara(wRun(line || ' ', { mono: true, sz: 18 }), { shade: 'F6F8FA' }));
        }
        continue;
      }
      if (b.type === 'table') {
        for (const row of b.rows) {
          const line = row.map(function (c) { return textOf(c.inlines); }).join('  |  ');
          if (line.trim()) body.push(wPara(wRun(line, { mono: true, sz: 18 })));
        }
        continue;
      }
    }

    const documentXml = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n' +
      '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">' +
      '<w:body>' + body.join('') +
      '<w:sectPr><w:pgSz w:w="11906" w:h="16838"/>' +
      '<w:pgMar w:top="1134" w:right="1134" w:bottom="1134" w:left="1134"/></w:sectPr>' +
      '</w:body></w:document>';

    const contentTypes = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n' +
      '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
      '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
      '<Default Extension="xml" ContentType="application/xml"/>' +
      '<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>' +
      '</Types>';

    const rels = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n' +
      '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
      '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>' +
      '</Relationships>';

    const enc = new TextEncoder();
    return zipStore([
      { name: '[Content_Types].xml', data: enc.encode(contentTypes) },
      { name: '_rels/.rels', data: enc.encode(rels) },
      { name: 'word/document.xml', data: enc.encode(documentXml) }
    ]);
  }

  /* ---------- 6. 下载 / 复制 ---------- */

  function safeName(title) {
    const base = String(title || 'gemini-report')
      .replace(/[\\/:*?"<>|\r\n\t]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 80);
    return base || 'gemini-report';
  }

  function download(blob, filename) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.style.display = 'none';
    document.documentElement.appendChild(a);
    a.click();
    setTimeout(function () {
      try { a.remove(); URL.revokeObjectURL(url); } catch (e) {}
    }, 2000);
  }

  function copyText(text) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      return navigator.clipboard.writeText(text);
    }
    return new Promise(function (resolve, reject) {
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.style.cssText = 'position:fixed;left:-9999px;top:0';
      document.documentElement.appendChild(ta);
      ta.select();
      const ok = document.execCommand && document.execCommand('copy');
      ta.remove();
      ok ? resolve() : reject(new Error('copy failed'));
    });
  }

  /* ---------- 7. 对外 API ---------- */

  function pickRoot(panel) {
    /* 只导报告正文：Gemini 面板里还有自己的工具条（目录/分享/创建），不要 */
    return panel.querySelector('.markdown-main-panel') ||
      panel.querySelector('message-content') ||
      panel;
  }

  function titleOf(panel) {
    const h = panel.querySelector('h1, .title, [class*="title"]');
    const t = h && (h.textContent || '').trim();
    return t || (document.title || '').replace(/\s*-\s*Google Gemini\s*$/, '') || 'Gemini 报告';
  }

  function build(panel) {
    panel = panel || document.querySelector('deep-research-immersive-panel.gml-live, immersive-panel.gml-live');
    if (!panel) throw new Error('没有已展开的报告面板');
    const root = pickRoot(panel);
    return { panel: panel, root: root, title: titleOf(panel), blocks: blocksOf(root) };
  }

  window.__gmExport = {
    blocks: function () { return build().blocks; },
    markdown: function () { const b = build(); return toMarkdown(b.blocks, b.title); },
    html: function () { const b = build(); return toHtmlDoc(b.root, b.title); },
    docx: function () { const b = build(); return toDocx(b.blocks, b.title); },
    saveMarkdown: function () {
      const b = build();
      const md = toMarkdown(b.blocks, b.title);
      download(new Blob([md], { type: 'text/markdown;charset=utf-8' }), safeName(b.title) + '.md');
      return md.length;
    },
    saveHtml: function () {
      const b = build();
      const html = toHtmlDoc(b.root, b.title);
      download(new Blob([html], { type: 'text/html;charset=utf-8' }), safeName(b.title) + '.html');
      return html.length;
    },
    saveDocx: function () {
      const b = build();
      const blob = toDocx(b.blocks, b.title);
      download(blob, safeName(b.title) + '.docx');
      return blob.size;
    },
    copyMarkdown: function () { const b = build(); return copyText(toMarkdown(b.blocks, b.title)); }
  };
})();
