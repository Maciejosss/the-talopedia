// Drives the built editor headless: types, pauses, moves between boxes and pages,
// undoes and redoes, and writes a pass/fail list into #undo-results. Run through
// scripts/editor-undo-test.sh.
(async () => {
  const out = [];
  const ok = (name, cond, got) => out.push(`${cond ? 'ok  ' : 'FAIL'} ${name}${cond ? '' : `  got ${JSON.stringify(got)}`}`);
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const $ = (s) => document.querySelector(s);
  const paras = () => [...document.querySelectorAll('#body .ce')];
  const txt = (i = 0) => paras()[i]?.textContent.replace(/\u00a0/g, ' ');
  const click = (el) => el.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
  const focusEnd = (el) => {
    click(el);
    el.focus();
    const r = document.createRange(); r.selectNodeContents(el); r.collapse(false);
    const s = getSelection(); s.removeAllRanges(); s.addRange(r);
  };
  const type = (text) => { for (const ch of text) document.execCommand('insertText', false, ch); };
  /**
   * File > Open, and wait until the editor says it has opened the file. A fixed wait could
   * end before the file was in, as it did when the run kept a virtual clock; reading the
   * same file here first lets the editor's read land.
   */
  const openFile = async (md, name) => {
    const f = new File([md], name);
    const dt = new DataTransfer();
    dt.items.add(f);
    $('#open-file-input').files = dt.files;
    $('#open-file-input').dispatchEvent(new Event('change'));
    await f.text();
    for (let i = 0; i < 200 && !$('#status').textContent.includes(name); i++) await sleep(20);
    await sleep(200);
  };
  const undo = () => $('#undo').click();
  const redo = () => $('#redo').click();
  const caret = () => {
    const s = getSelection();
    if (!s.rangeCount) return null;
    const n = s.focusNode;
    const box = (n.nodeType === 1 ? n : n.parentElement).closest('[contenteditable="true"]');
    const r = document.createRange(); r.selectNodeContents(box); r.setEnd(n, s.focusOffset);
    return { box, at: r.toString().length };
  };
  window.confirm = () => true;
  try {
    await sleep(1500);

    // A word at a time.
    focusEnd(paras()[0]);
    type('hello world again');
    ok('typed a sentence', txt() === 'hello world again', txt());
    undo();
    ok('undo takes the last word only', txt() === 'hello world ', txt());
    const c1 = caret();
    ok('caret lands where that word was', c1?.box === paras()[0] && c1?.at === 12, c1?.at);
    undo();
    ok('the next undo takes the word before, keeping its space', txt() === 'hello ', txt());
    redo();
    ok('redo puts it back', txt() === 'hello world ', txt());
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'y', ctrlKey: true, bubbles: true }));
    ok('ctrl+y redoes', txt() === 'hello world again', txt());
    const c2 = caret();
    ok('redo leaves the caret at the end of what came back', c2?.at === 17, c2?.at);

    // Typing straight after an undo keeps the state it undid to.
    undo();
    type('there');
    ok('typing after undo keeps the space', txt() === 'hello world there', txt());
    ok('and it is saved as an ordinary space', $('#preview').textContent.includes('hello world there') && !$('#preview').textContent.includes('\u00a0'), $('#preview').textContent.slice(-40));
    undo();
    ok('undo after that returns to the undone-to state', txt() === 'hello world ', txt());

    // A pause ends a step, even mid-word.
    focusEnd(paras()[0]);
    type('ab'); await sleep(1300); type('cd');
    undo();
    ok('a pause splits a step', txt() === 'hello world ab', txt());

    // Another box is another step, and undo goes there.
    focusEnd(paras()[0]);
    paras()[0].dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));
    await sleep(50);
    const second = paras()[1];
    ok('enter made a second paragraph', !!second, paras().length);
    focusEnd(second);
    type('second');
    focusEnd(paras()[0]);
    type('X');
    undo();
    ok('undo in the first box takes only X', txt(0) === 'hello world ab' && txt(1) === 'second', [txt(0), txt(1)]);
    undo();
    ok('then the second box', txt(1) === '', txt(1));
    const c3 = caret();
    ok('caret moved to the second box', c3?.box === paras()[1], c3 && paras().indexOf(c3.box));
    undo();
    ok('then the new paragraph itself', paras().length === 1, paras().length);

    // A sidebar cell is a step of its own.
    const cell = [...document.querySelectorAll('.ib-edit td .ce')][0];
    const cellWas = cell.textContent;
    focusEnd(cell);
    type('Tokyo');
    focusEnd(paras()[0]);
    type('Y');
    undo(); undo();
    const cellNow = [...document.querySelectorAll('.ib-edit td .ce')][0].textContent;
    ok('undo reaches back into the sidebar, one step each', cellNow === cellWas && txt() === 'hello world ab', [cellNow, cellWas, txt()]);

    // A link added mid-sentence leaves ordinary spaces either side, so the words
    // around it still wrap one at a time.
    focusEnd(paras()[0]);
    paras()[0].textContent = '';
    type('The quick brown fox jumps over the lazy dog.');
    const tn = paras()[0].firstChild;
    const at = tn.nodeValue.indexOf('brown');
    const sr = document.createRange(); sr.setStart(tn, at); sr.setEnd(tn, at + 9);
    getSelection().removeAllRanges(); getSelection().addRange(sr);
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', ctrlKey: true, bubbles: true }));
    $('#lp-target').value = 'brown-fox';
    $('#lp-apply').click();
    const linked = paras()[0];
    ok('link inserted', !!linked.querySelector('a[data-slug="brown-fox"]'), linked.innerHTML);
    ok('no glued spaces around the link', !linked.innerHTML.includes('&nbsp;') && !linked.textContent.includes('\u00a0'), linked.innerHTML);

    // An empty table cell takes the caret where it is clicked. With no height it was
    // no place for one, so the click, and the typing, went to the cell beside it.
    focusEnd(paras()[0]);
    document.querySelector('.tbl-cell[data-r="3"][data-c="2"]').click();
    await sleep(100);
    const cellBox = (r, c) => [...document.querySelectorAll('.ed-tbl tr')][r].querySelectorAll('td, th')[c].querySelector('.ce');
    const blankCell = cellBox(1, 0);
    ok('an empty cell is a line tall', blankCell.getBoundingClientRect().height > 10, blankCell.getBoundingClientRect().height);
    blankCell.scrollIntoView({ block: 'center' });
    const rc = blankCell.closest('td').getBoundingClientRect();
    // Where a click in the middle of the cell puts the caret, then typing there. The
    // hit test alone reports the right cell even when the bug is live; it is the
    // typing that shows where the caret really was.
    const hit = document.caretRangeFromPoint(rc.left + rc.width / 2, rc.top + rc.height / 2);
    getSelection().removeAllRanges(); getSelection().addRange(hit);
    document.execCommand('insertText', false, 'Club');
    const rowText = [...blankCell.closest('tr').querySelectorAll('td:not(.row-x)')].map((c) => c.textContent);
    ok('typing where it was clicked goes into it', rowText[0] === 'Club' && rowText[1] === '', rowText);
    blankCell.textContent = '';
    // What a cell holds once its last letter is deleted is a lone <br>: a blank cell.
    blankCell.innerHTML = '<br>';
    blankCell.dispatchEvent(new Event('input', { bubbles: true }));
    const tableMd = $('#preview').textContent.split('\n').filter((l) => l.startsWith('|'));
    ok('a cell emptied by deleting saves blank', tableMd.length > 0 && !tableMd.join('\n').includes('<br>'), tableMd);

    // Tables, edited the way Google Docs edits them.
    const T = () => document.querySelector('.ed-tbl');
    const rowsT = () => [...T().tBodies[0].rows];
    const cellT = (r, c) => rowsT()[r].querySelectorAll('td, th')[c];
    const widthT = () => Math.max(...rowsT().map((tr) => [...tr.children].reduce((w, td) => w + (td.colSpan || 1), 0)));
    const where = () => {
      const n = getSelection().focusNode, e = n?.nodeType === 1 ? n : n?.parentElement, td = e?.closest('td, th');
      return td && T()?.contains(td) ? `${rowsT().indexOf(td.parentElement)},${[...td.parentElement.children].indexOf(td)}` : 'out';
    };
    const key = (k, extra = {}) => {
      const ev = new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true, ...extra });
      (getSelection().focusNode?.parentElement || T()).dispatchEvent(ev);
      return ev.defaultPrevented;
    };
    const into = (r, c, end = true) => {
      T().focus();
      const g = document.createRange(); g.selectNodeContents(cellT(r, c).querySelector('.ce')); g.collapse(!end);
      getSelection().removeAllRanges(); getSelection().addRange(g);
    };
    const menu = (r, c) => {
      const td = cellT(r, c), b = td.getBoundingClientRect();
      td.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: b.left + 5, clientY: b.top + 5 }));
      return [...document.querySelectorAll('.point-menu button')];
    };
    const choose = (r, c, label) => {
      const b = menu(r, c).find((x) => x.textContent === label);
      if (!b || b.disabled) return false;
      b.click();
      return true;
    };
    ok('no delete-row column and no button bar', !T().querySelector('.row-x, button') && !document.querySelector('.tbl-bar'), T().innerHTML.slice(0, 80));
    into(1, 0); key('Tab');
    ok('Tab goes to the next cell', where() === '1,1', where());
    key('Tab');
    ok('and on to the next row', where() === '2,0', where());
    key('Tab', { shiftKey: true });
    ok('Shift+Tab goes back', where() === '1,1', where());
    const rowsBefore = rowsT().length;
    into(rowsBefore - 1, 1); key('Tab');
    ok('Tab from the last cell adds a row', rowsT().length === rowsBefore + 1 && where() === `${rowsBefore},0`, [rowsT().length, where()]);
    into(1, 0); document.execCommand('insertText', false, 'ab');
    into(1, 0, true); key('ArrowRight');
    ok('Right at the end of a cell goes to the next', where() === '1,1', where());
    into(1, 1, false); key('ArrowLeft');
    ok('Left at the start of a cell goes back', where() === '1,0', where());
    into(1, 0); key('ArrowDown');
    ok('Down goes to the cell below', where() === '2,0', where());
    key('ArrowUp');
    ok('Up comes back', where() === '1,0', where());
    into(0, 0); key('ArrowUp');
    ok('Up from the top row leaves the table', where() === 'out', where());
    into(rowsT().length - 1, 0); key('ArrowDown');
    ok('Down from the bottom row leaves it too', where() === 'out' && !!T().closest('[data-kind]').nextElementSibling, where());
    const cellsBefore = T().querySelectorAll('td, th').length;
    into(1, 1, false);
    ok('Backspace at the start of a cell leaves the table whole', key('Backspace') && T().querySelectorAll('td, th').length === cellsBefore, T().querySelectorAll('td, th').length);
    const items = menu(1, 0).map((b) => b.textContent);
    ok('right-click has the Google Docs items', ['Insert row above', 'Insert row below', 'Insert column left', 'Insert column right', 'Delete row', 'Delete column', 'Delete table', 'Merge cells', 'Unmerge cells'].every((x) => items.includes(x)), items);
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    const w0 = widthT(), r0 = rowsT().length;
    choose(1, 0, 'Insert column right');
    ok('insert column right', widthT() === w0 + 1 && where() === '1,1', [widthT(), where()]);
    choose(1, 1, 'Delete column');
    ok('delete column', widthT() === w0, widthT());
    choose(1, 0, 'Insert row above');
    ok('insert row above', rowsT().length === r0 + 1 && where() === '1,0', [rowsT().length, where()]);
    choose(1, 0, 'Delete row');
    ok('delete row', rowsT().length === r0 && cellT(1, 0).textContent === 'ab', [rowsT().length, cellT(1, 0).textContent]);
    cellT(1, 0).dispatchEvent(new MouseEvent('mousedown', { bubbles: true, button: 0 }));
    cellT(2, 1).dispatchEvent(new MouseEvent('mouseover', { bubbles: true, buttons: 1 }));
    ok('dragging across cells selects them whole', T().querySelectorAll('.cell-sel').length === 4, T().querySelectorAll('.cell-sel').length);
    ok('merge cells', choose(2, 1, 'Merge cells') && cellT(1, 0).colSpan === 2 && cellT(1, 0).rowSpan === 2, [cellT(1, 0).colSpan, cellT(1, 0).rowSpan]);
    ok('saved as a merged cell', /rowspan="2"/.test($('#preview').textContent) && /colspan="2"/.test($('#preview').textContent), ($('#preview').textContent.match(/<td[^>]*span[^>]*>/) || [''])[0]);
    ok('unmerge cells', choose(1, 0, 'Unmerge cells') && cellT(1, 0).colSpan === 1 && widthT() === w0 && rowsT().every((tr) => tr.children.length === w0), rowsT().map((tr) => tr.children.length));
    into(1, 0, true); key('ArrowRight', { shiftKey: true });
    ok('Shift+Right at a cell edge selects whole cells', T().querySelectorAll('.cell-sel').length === 2, T().querySelectorAll('.cell-sel').length);
    key('x');
    ok('typing over them empties them and starts in the first', cellT(1, 0).textContent === 'x' && cellT(1, 1).textContent === '' && !T().querySelector('.cell-sel'), [cellT(1, 0).textContent, cellT(1, 1).textContent]);
    ok('make header row', choose(2, 0, 'Make header row') && [...rowsT()[2].children].every((td) => td.tagName === 'TH'), rowsT()[2].children[0].tagName);
    choose(1, 0, 'Delete table');
    ok('delete table', !document.querySelector('.ed-tbl'), !!document.querySelector('.ed-tbl'));

    // Lists, the Google Docs way.
    const L = () => [...document.querySelectorAll('.ce-list')].at(-1);
    const lis = () => [...L().children];
    const liText = (i) => lis()[i].querySelector('.ce').textContent;
    const liLvl = (i) => +lis()[i].dataset.level || 0;
    const inLi = () => {
      const n = getSelection().focusNode, e = n?.nodeType === 1 ? n : n?.parentElement, li = e?.closest('.ce-list li');
      return li && L().contains(li) ? lis().indexOf(li) : -1;
    };
    const press = (k, extra = {}) => {
      const ev = new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true, ...extra });
      document.activeElement.dispatchEvent(ev);
      return ev.defaultPrevented;
    };
    const caretAt = (i, end = true, offset = null) => {
      const box = lis()[i].querySelector('.ce'); L().focus();
      const r = document.createRange();
      if (offset != null) r.setStart(box.firstChild, offset); else r.selectNodeContents(box);
      r.collapse(offset != null ? true : !end);
      getSelection().removeAllRanges(); getSelection().addRange(r);
    };
    const mdNow = () => $('#preview').textContent;
    // The list button turns the paragraph the caret is in into a list, so this starts
    // on a fresh empty one.
    focusEnd(paras()[0]); press('Enter');
    document.querySelector('[data-list="bullet"]').click();
    await sleep(50);
    type('one'); press('Enter'); type('two');
    ok('Enter makes the next item', lis().length === 2 && liText(1) === 'two' && inLi() === 1, lis().map((li) => li.textContent));
    press('Tab');
    ok('Tab nests it', liLvl(1) === 1, liLvl(1));
    ok('saved as a nested list', mdNow().includes('- one\n  - two'), (mdNow().match(/- one[\s\S]{0,20}/) || [''])[0]);
    press('Tab', { shiftKey: true });
    ok('Shift+Tab brings it back out', liLvl(1) === 0, liLvl(1));
    caretAt(0); press('Tab');
    ok('the first item cannot nest under nothing', liLvl(0) === 0, liLvl(0));
    caretAt(1); press('Tab');
    press('Enter', { shiftKey: true }); type('more');
    ok('Shift+Enter is a new line in the same item', lis().length === 2 && !!lis()[1].querySelector('.ce br'), lis().map((li) => li.querySelector('.ce').innerHTML));
    ok('saved as a line break inside the item', mdNow().includes('  - two<br>more'), (mdNow().match(/- two[\s\S]{0,20}/) || [''])[0]);
    caretAt(0, true, 1); press('Enter');
    ok('Enter mid-item splits it at the caret', liText(0) === 'o' && liText(1) === 'ne' && inLi() === 1, lis().map((li) => li.textContent));
    caretAt(1, false); press('Backspace');
    ok('Backspace at an item start joins it to the one above', lis().length === 2 && liText(0) === 'one', lis().map((li) => li.textContent));
    caretAt(1, false); press('Backspace');
    ok('Backspace at a nested item start brings it out a level', liLvl(1) === 0 && lis().length === 2, liLvl(1));
    caretAt(1, true); press('Tab'); press('Enter');
    ok('Enter at the end starts an empty item at the same level', lis().length === 3 && liLvl(2) === 1 && liText(2) === '', [lis().length, liLvl(2)]);
    press('Enter');
    ok('Enter on an empty nested item climbs out a level', lis().length === 3 && liLvl(2) === 0, [lis().length, liLvl(2)]);
    press('Enter');
    ok('and on an empty top-level item leaves the list', lis().length === 2 && document.activeElement.closest('[data-kind]')?.dataset.kind === 'para', [lis().length, document.activeElement.closest('[data-kind]')?.dataset.kind]);
    caretAt(0, true); press('ArrowDown');
    ok('Down goes to the next item', inLi() === 1, inLi());
    press('ArrowUp');
    ok('Up comes back', inLi() === 0, inLi());
    caretAt(0, false); press('ArrowLeft');
    ok('Left at the first item goes to the paragraph above', inLi() === -1 && document.activeElement.closest('[data-kind]')?.dataset.kind === 'para', document.activeElement.closest('[data-kind]')?.dataset.kind);
    caretAt(1); press('Tab', { shiftKey: true }); press('Tab'); await sleep(1100); undo();
    ok('undo takes a nesting back', liLvl(1) === 0, liLvl(1));
    redo();
    ok('and redo keeps it', liLvl(1) === 1, liLvl(1));

    // One box for the whole list: a selection runs across items.
    ok('the list is one editing box', L().isContentEditable && L().getAttribute('contenteditable') === 'true' && !lis()[0].querySelector('[contenteditable="true"]'), L().outerHTML.slice(0, 80));
    ok('and no item carries a remove button', !L().querySelector('button'), L().querySelectorAll('button').length);
    const across = (i, a, j, z) => {
      L().focus();
      const r = document.createRange();
      r.setStart(lis()[i].querySelector('.ce').firstChild, a);
      r.setEnd(lis()[j].querySelector('.ce').firstChild, z);
      getSelection().removeAllRanges(); getSelection().addRange(r);
    };
    lis()[0].querySelector('.ce').textContent = 'alpha'; lis()[1].querySelector('.ce').textContent = 'bravo';
    across(0, 2, 1, 3); press('Backspace');
    ok('Backspace over a selection across two items joins what is left of them', lis().length === 1 && liText(0) === 'alvo', lis().map((li) => li.textContent));
    caretAt(0); press('Enter'); type('charlie'); press('Enter'); type('delta');
    across(0, 0, 2, 2); press('Tab');
    ok('Tab nests every item the selection touches that can go', liLvl(0) === 0 && liLvl(1) === 1 && liLvl(2) === 1, [liLvl(0), liLvl(1), liLvl(2)]);
    caretAt(2); document.querySelector('[data-num="alpha"]').click();
    ok('the numbered button turns the whole list to numbers', L().classList.contains('ordered'), L().className);
    ok('saved numbered, each level counted afresh', mdNow().includes('1. alvo\n    1. charlie\n    2. delta'), (mdNow().match(/1\. alvo[\s\S]{0,40}/) || [''])[0]);
    caretAt(1); document.querySelector('[data-num="alpha"]').click();
    ok('pressed again in a numbered list, the item comes out as a paragraph', lis().length === 1 && document.activeElement.closest('[data-kind]')?.dataset.kind === 'para', [lis().length, document.activeElement.closest('[data-kind]')?.dataset.kind]);
    undo();
    ok('and undo puts it back in the list', lis().length === 3, lis().length);
    caretAt(0); document.querySelector('[data-list="bullet"]').click();
    ok('the bullet button turns it back to bullets', !L().classList.contains('ordered') && mdNow().includes('- alvo'), L().className);
    caretAt(0); document.querySelector('[data-num="outline"]').click();
    ok('the 1.1 tile numbers the list by outline', L().classList.contains('ordered') && L().dataset.numbering === 'outline' && lis()[1].dataset.n === '1.1', [L().className, L().dataset.numbering, lis().map((li) => li.dataset.n)]);
    ok('saved under the note the site reads', mdNow().includes('<!-- numbering: 1.1 -->\n1. alvo\n    1. charlie'), (mdNow().match(/<!--[\s\S]{0,60}/) || [''])[0]);
    caretAt(0); document.querySelector('[data-num="alpha"]').click();
    ok('the 1, a, i tile numbers a level down by letter', !L().dataset.numbering && lis()[1].dataset.n === 'a' && lis()[2].dataset.n === 'b', lis().map((li) => li.dataset.n));
    ok('and needs no note', !mdNow().includes('<!-- numbering') && mdNow().includes('1. alvo'), (mdNow().match(/1\. alvo[\s\S]{0,30}/) || [''])[0]);
    caretAt(0); document.querySelector('[data-list="bullet"]').click();

    // Into a list from a paragraph: the button, the typed dash, and a paste.
    focusEnd(paras()[0]); press('Enter'); type('echo');
    document.querySelector('[data-list="bullet"]').click();
    ok('the bullet button makes the paragraph the caret is in a list item', inLi() === 0 && liText(0) === 'echo', [inLi(), liText(0)]);
    caretAt(0); press('Enter'); press('Enter'); type('-');
    press(' '); type('foxtrot');
    const AL = document.activeElement.closest('.ce-list');
    ok('"- " at the start of a paragraph makes it a list, joined to the lists either side', !!AL && AL.children[0].textContent === 'echo' && AL.children[1].textContent === 'foxtrot', AL && [...AL.children].map((li) => li.textContent));
    const pasteInto = (target, html, text) => {
      const dt = new DataTransfer(); dt.setData('text/html', html); dt.setData('text/plain', text);
      target.dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true }));
    };
    focusEnd(paras()[0]); press('Enter');
    const before = document.querySelectorAll('.ce-list').length;
    pasteInto(document.activeElement, '<b style="font-weight:normal" id="docs-internal-guid-1"><ul><li aria-level="1"><p>golf</p></li><li aria-level="2"><p>hotel</p></li></ul><p>india</p></b>', '* golf\n  * hotel\nindia');
    const pl = [...document.querySelectorAll('.ce-list')].find((l) => l.textContent.includes('golf'));
    ok('a list pasted from Docs comes in as a list, levels kept', !!pl && pl.children.length === 2 && +pl.children[1].dataset.level === 1, pl && [...pl.children].map((li) => li.dataset.level || 0));
    ok('and the paragraph after it as a paragraph', [...paras()].some((c) => c.textContent === 'india' && c.closest('[data-kind]').dataset.kind === 'para'), document.querySelectorAll('.ce-list').length - before);
    {
      // Read back from markdown: blocks copied out of the editor carry it, so a paste
      // goes through the same reader a page does when it opens.
      focusEnd(paras()[0]); press('Enter');
      const dt = new DataTransfer();
      dt.setData('text/html', '<div data-talo-md="&lt;!-- numbering: 1.1 --&gt;\n1. kilo\n    1. lima"></div>');
      dt.setData('text/plain', 'kilo\nlima');
      document.activeElement.dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true }));
      const kl = [...document.querySelectorAll('.ce-list')].find((l) => l.textContent.includes('kilo'));
      ok('a list under the note is read back numbered by outline', !!kl && kl.dataset.numbering === 'outline' && kl.children[1]?.dataset.n === '1.1', kl && [kl.dataset.numbering, kl.children[1]?.dataset.n]);
    }

    // The medals sit in their own icons group, first after the arrows, and go in
    // without the white edge a flag gets.
    await new Promise((r) => setTimeout(r, 300));
    // Each group's header is its name and how many it holds.
    const groups = [...document.querySelectorAll('#mp-icons .mp-group')].map((g) => g.firstChild.textContent.toLowerCase());
    const symbols = [...document.querySelectorAll('#mp-icons .mp-icon')].filter((b) => /\/assets\/icons\//.test(b.title));
    const medals = symbols.filter((b) => /-medal\./.test(b.title));
    ok('a medals group of three, after the arrows, gold first', groups[0] === 'arrows' && groups[1] === 'medals' && medals.length === 3 && /gold/.test(medals[0].title), [groups.slice(0, 4), medals.map((m) => m.title)]);
    ok('then the marks for a commander in a group of their own', groups[2] === 'commanders', groups.slice(0, 4));
    ok('and the three marks for a commander', ['Executed', 'Killed in Action', 'Surrendered'].every((l) => symbols.some((b) => b.textContent.trim() === l)),
      symbols.map((b) => b.textContent.trim()));
    focusEnd(paras()[0]);
    medals.find((b) => /gold-medal/.test(b.title)).click();
    const medal = paras()[0].querySelector('img[data-slug*="gold-medal"]');
    ok('a medal goes in as an icon, without the flag border', !!medal && medal.classList.contains('sym') && getComputedStyle(medal).borderTopWidth === '0px', medal && [medal.className, getComputedStyle(medal).borderTopWidth]);
    ok('and is saved as :img', $('#preview').textContent.includes(':img[/assets/icons/gold-medal.webp]'), $('#preview').textContent.slice(-60));

    // An icon goes in at the caret. Chrome put a non-editable one a character early, so a
    // skull after a name took the place of its last letter, or of the space after it.
    const skull = symbols.find((b) => /executed/.test(b.title));
    const named = () => ($('#preview').textContent.match(/Hideki[^\n]*/) || [''])[0];
    paras()[0].innerHTML = ''; focusEnd(paras()[0]); type('Hideki Yamaji'); skull.click();
    ok('an icon put in after a word goes after its last letter', named().startsWith('Hideki Yamaji:img[/assets/icons/executed.svg]'), named());
    ok('and leaves no line break behind', !paras()[0].querySelector('br'), paras()[0].innerHTML);
    paras()[0].innerHTML = ''; focusEnd(paras()[0]); type('Hideki Yamaji '); skull.click();
    ok('after a space, it keeps the space before it', named().startsWith('Hideki Yamaji :img[/assets/icons/executed.svg]'), named());
    ok('and is locked, like every token', paras()[0].querySelector('img.tok')?.contentEditable === 'false', paras()[0].querySelector('img.tok')?.outerHTML);

    // An imgbb page link is caught before it goes in; the picture's own link is not.
    const note = () => { $('#mp-link').dispatchEvent(new Event('input')); return $('#mp-link-note').textContent; };
    $('#mp-link').value = 'https://ibb.co/hRCMF21d';
    ok('an imgbb page link is refused, pointing at the direct link', /page for the picture/.test(note()) && /i\.ibb\.co/.test(note()), note());
    $('#mp-link').value = 'https://i.ibb.co/QFXcvYjH/Shushestan-flag.png';
    ok("the picture's own link passes", !/page for the picture|not on the list/.test(note()), note());
    $('#mp-link').value = '';

    // Find and replace.
    {
      const md = () => $('#preview').textContent;
      paras()[0].innerHTML = 'Nichirin met NICHIRIN and nichirin at Nichirinsk. <b>Nichi</b>rin too.';
      paras()[0].dispatchEvent(new Event('input', { bubbles: true }));
      await sleep(30);
      const findIn = (q) => { $('#fb-find').value = q; $('#fb-find').dispatchEvent(new Event('input')); };
      const settle = () => sleep(200);
      const count = () => $('#fb-count').textContent;
      const opt = (o) => $(`[data-opt="${o}"]`).click();
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'f', metaKey: true, bubbles: true }));
      ok('⌘F opens the find bar on the find box', !$('#findbar').hidden && document.activeElement === $('#fb-find'), [$('#findbar').hidden, document.activeElement?.id]);
      findIn('nichirin'); await settle();
      const all = +count().split(' of ')[1];
      ok('every match is counted, across bold, case ignored', all >= 5, count());
      opt('word'); await settle();
      const words = +count().split(' of ')[1];
      ok('Whole words leaves out Nichirinsk', words === all - 1, [all, words]);
      opt('case'); await settle();
      const cased = +count().split(' of ')[1];
      ok('Match case keeps to the capitals typed', cased < words, [words, cased]);
      opt('case'); opt('word');
      opt('regex'); findIn('N(ichi)rin\\b'); await settle();
      ok('a regular expression finds', /of/.test(count()), count());
      findIn('(['); await settle();
      ok('and a broken one says so', count() === 'Not a pattern' && $('#fb-find').classList.contains('bad'), count());
      opt('regex');
      findIn('nichirin'); opt('word'); await settle();
      const first = count();
      $('#fb-find').dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
      ok('Enter steps to the next match', count() !== first && /^2 of/.test(count()), [first, count()]);
      $('#fb-find').dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', shiftKey: true, bubbles: true }));
      ok('Shift+Enter steps back', count() === first, count());
      $('#fb-expand').click();
      ok('the arrow shows the replace row', !$('#fb-replace-row').hidden, $('#fb-replace-row').hidden);
      $('#fb-repl').value = 'shogunate';
      opt('keep');
      $('#fb-all').click(); await settle();
      ok('Replace all, keeping each match\'s capitals', paras()[0].textContent.startsWith('Shogunate met SHOGUNATE and shogunate at Nichirinsk.'), paras()[0].textContent);
      ok('and the replacement is saved', md().includes('Shogunate met SHOGUNATE and shogunate'), (md().match(/\w+ met [\s\S]{0,40}/) || [''])[0]);
      undo(); await settle();
      ok('one undo takes every replacement back', paras()[0].textContent.startsWith('Nichirin met NICHIRIN and nichirin'), paras()[0].textContent);
      opt('keep');
      findIn('NICHIRIN'); opt('case'); await settle();
      $('#fb-repl').value = 'X';
      $('#fb-one').click(); await settle();
      ok('Replace changes only the current match', paras()[0].textContent.startsWith('Nichirin met X and nichirin'), paras()[0].textContent);
      opt('case');
      undo();
      // The lines of a sidebar cell are lines: find does not run one into the next.
      const cell = document.querySelector('.ib-edit .ce.outline');
      if (cell) {
        cell.innerHTML = '<div data-level="0">Makinami</div><div data-level="0">Kanade</div>';
        findIn('MakinamiKanade'); await settle();
        ok('two lines of a sidebar cell are not read as one word', count() === 'No results', count());
        $('[data-scope="article"]').click();
        findIn('Kanade'); await settle();
        ok('Look in Article leaves the sidebar out', count() === 'No results', count());
        $('[data-scope="sidebar"]').click(); await settle();
        ok('Look in Sidebar finds it there', /^1 of 1$/.test(count()), count());
        $('[data-scope="all"]').click();
        cell.innerHTML = '';
      }
      $('#findbar').dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
      ok('Escape closes it', $('#findbar').hidden, $('#findbar').hidden);
      paras()[0].innerHTML = '';
      paras()[0].dispatchEvent(new Event('input', { bubbles: true }));
    }

    // Bold that took its trailing space along is saved with the space outside the
    // marks; **word ** does not close, and printed on the page as it stands.
    focusEnd(paras()[0]);
    paras()[0].innerHTML = 'nicknamed the <b>Crimson-Red Calamity </b>(x), <i>Main article: </i>y<i>, </i>z';
    paras()[0].dispatchEvent(new Event('input', { bubbles: true }));
    const saved = $('#preview').textContent;
    ok('bold with a trailing space is saved so it closes', saved.includes('**Crimson-Red Calamity** (x)'), (saved.match(/nicknamed[^\n]*/) || [''])[0]);
    ok('italic too, and marks around a lone comma dropped', saved.includes('*Main article:* y, z'), (saved.match(/nicknamed[^\n]*/) || [''])[0]);

    // A new page cannot be undone into the old one.
    $('#new').click();
    await sleep(50);
    ok('new page: nothing to undo', $('#undo').disabled === true, $('#undo').disabled);
    focusEnd(paras()[0]);
    type('fresh');
    undo(); undo(); undo();
    ok('undo stops at the new page', txt() === '' && !document.body.textContent.includes('hello world'), txt());

    // An arrow straight before a digit (:up2, :down1) is an arrow, before and after an undo.
    // Whichever way the ranking last moved: the page is live, and its arrow is updated.
    $('#file-q').value = 'nichirin national football';
    $('#file-q').dispatchEvent(new Event('input'));
    [...document.querySelectorAll('#file-list button')].find((b) => /Nichirin national football team/i.test(b.textContent)).click();
    await sleep(800);
    const rankCell = () => [...document.querySelectorAll('.ib-edit tr')].find((tr) => /Current \(1934\)/.test(tr.textContent))?.querySelector('td .ce');
    const anArrow = () => rankCell()?.querySelector('[data-tok="up"], [data-tok="down"]') && !/:(up|down)/.test(rankCell().textContent);
    ok('opened with the ranking arrow as an arrow', anArrow(), rankCell()?.innerHTML);
    focusEnd(paras()[0]);
    type(' zz');
    undo();
    ok('still an arrow after undo', anArrow(), rankCell()?.innerHTML);
    ok('and saved as an arrow before its digit', /Current \(1934\)", value: "\d+ \(:(up|down)\d+\)"/.test($('#preview').textContent),
      ($('#preview').textContent.match(/Current \(1934\).*/) || [''])[0]);
    const barcino = document.querySelector('a[data-slug="fc-barcino"]');
    ok('a page nobody has written yet keeps its initials', barcino?.textContent === 'FC Barcino', barcino?.textContent);
    ok('and its link is saved bare', $('#preview').textContent.includes('[[fc-barcino]]'), ($('#preview').textContent.match(/.*barcino.*/i) || [''])[0].slice(-80));

    // Asterisks typed by hand with the space inside would print on the page.
    focusEnd(paras()[0]);
    type(' **Calamity **then');
    ok('bold typed with a space inside is written closed', $('#preview').textContent.includes(' **Calamity** then'), ($('#preview').textContent.match(/.*Calamity.*/) || [''])[0].slice(-60));

    // Date panel: Age asks for Born, and Died only if dead.
    document.querySelector('#dt-mode button[data-mode="age"]').click();
    ok('age relabels the date as Born', $('#dt-date-label').textContent === 'Born', $('#dt-date-label').textContent);
    ok('died shows, marked optional', !$('#dt-died-row').hidden && /optional/.test($('#dt-died-row').textContent), $('#dt-died-row').hidden);
    $('#dt-date').value = '1888-06-09'; $('#dt-date').dispatchEvent(new Event('input'));
    ok('born only: age now', /^June 9, 1888 \(aged \d+\)$/.test($('#dt-preview').textContent), $('#dt-preview').textContent);
    $('#dt-died').value = '1933-05-11'; $('#dt-died').dispatchEvent(new Event('input'));
    ok('with died: that date, age at death', $('#dt-preview').textContent === 'May 11, 1933 (aged 44)', $('#dt-preview').textContent);
    document.querySelector('#dt-mode button[data-mode=""]').click();
    ok('plain puts the label back and hides died', $('#dt-date-label').textContent === 'Date' && $('#dt-died-row').hidden, $('#dt-date-label').textContent);

    // A type split out of Organizations brings its own sidebar.
    $('#f-type').value = 'national-team';
    $('#f-type').dispatchEvent(new Event('change'));
    const rows = [...document.querySelectorAll('.ib-edit tr[data-kind]')];
    const labels = rows.map((tr) => tr.dataset.kind === 'section' ? `§${tr.querySelector('.ce')?.textContent.trim()}` : tr.dataset.kind === 'full' ? '[value]'
      : tr.dataset.kind === 'row' ? tr.querySelector('.ce')?.textContent.trim() : `[${tr.dataset.kind}]`);
    ok('national team sidebar comes from the Nichirin team', labels.includes('AFA Code') && labels.includes('§Biggest Win')
      && labels[labels.indexOf('§Biggest Win') + 1] === '[value]', labels.join(' | '));

    // Any sidebar cell nests: its lines go under one another, drawn as the page draws them.
    const fieldRow = document.querySelector('.ib-edit tr[data-kind="row"]');
    fieldRow.querySelector('.ctl-add > button').click();
    ok('the + menu no longer has a Nested List row of its own',
      ![...fieldRow.querySelectorAll('.ctl-menu button')].some((b) => b.textContent === 'Nested List'), '');
    fieldRow.querySelector('.ctl-add > button').click();
    const [nLabel, nBox] = fieldRow.querySelectorAll('.ce');
    const depthButton = fieldRow.querySelector('button[data-nest="depth"]');
    const guidesButton = fieldRow.querySelector('button[data-nest="guides"]');
    ok('its depth and guide switches wait until something nests', depthButton?.hidden === true && guidesButton?.hidden === true, depthButton?.hidden);
    nLabel.textContent = 'Battles/wars';
    nBox.innerHTML = [[0, 'The Great War'], [1, 'Valtherian Front'], [2, 'Test'], [2, 'Test'], [2, 'Test'], [1, '']]
      .map(([l, t]) => `<div data-level="${l}">${t || '<br>'}</div>`).join('');
    nBox.dispatchEvent(new Event('input', { bubbles: true }));
    ok('and show once it does', depthButton.hidden === false && guidesButton.hidden === false, depthButton.hidden);
    const joints = [...nBox.children].map((d) => d.dataset.joint || '-').join(' ');
    ok('siblings join, the last turns the corner, an empty line draws nothing', joints === '- last more more last -', joints);
    const runs = [...nBox.children].map((d) => d.style.backgroundPosition || '-').join(' | ');
    ok('and a level still open runs past the lines under it', runs === '- | - | - | - | - | -', runs);
    nBox.innerHTML = [[0, 'World War II'], [1, 'North African campaign'], [2, 'Operation Torch'], [1, 'Italian campaign']]
      .map(([l, t]) => `<div data-level="${l}">${t}</div>`).join('');
    nBox.dispatchEvent(new Event('input', { bubbles: true }));
    const runs2 = [...nBox.children].map((d) => (d.dataset.joint || '-') + ' ' + (d.style.backgroundPosition || '-')).join(' | ');
    ok('a campaign with a battle under it keeps its line going to the next campaign', runs2 === '- - | more - | last 10px 0px | last -', runs2);
    nBox.innerHTML = ['World War II', 'North African campaign', 'Operation Torch', 'Battle of Port Lyautey']
      .map((t, i) => `<div data-level="${i}">${t}</div>`).join('');
    nBox.dispatchEvent(new Event('input', { bubbles: true }));
    await sleep(100);
    const treeOf = () => ($('#preview').textContent.match(/label: "Battles\/wars"\n[\s\S]*?(?=\n  - |\n---)/) || [''])[0];
    ok('it saves a level as two spaces, and the row its settings', treeOf().includes('value:\n      - "World War II"\n'
      + '      - "  North African campaign"\n      - "    Operation Torch"\n      - "      Battle of Port Lyautey"\n    depth: 3\n    guides: true'), treeOf());
    const lineOf = (text) => [...nBox.children].find((d) => d.textContent === text);
    const caretAtEnd = (node) => {
      const r = document.createRange(); r.selectNodeContents(node); r.collapse(false);
      getSelection().removeAllRanges(); getSelection().addRange(r);
    };
    const nlKey = (k, shiftKey = false) =>
      nBox.dispatchEvent(new KeyboardEvent('keydown', { key: k, shiftKey, bubbles: true, cancelable: true }));
    caretAtEnd(lineOf('Operation Torch')); nlKey('Tab', true); await sleep(100);
    ok('Shift+Tab lifts a line, and the one under it comes up too', treeOf().includes('      - "  Operation Torch"\n      - "    Battle of Port Lyautey"'), treeOf());
    caretAtEnd(lineOf('North African campaign')); nlKey('Tab'); await sleep(100);
    ok('Tab goes no deeper than one past the line above', treeOf().includes('      - "  North African campaign"'), treeOf());
    caretAtEnd(lineOf('Operation Torch')); nlKey('Enter'); type('Operation Husky'); await sleep(100);
    ok('Enter starts a line at the same level', treeOf().includes('      - "  Operation Torch"\n      - "  Operation Husky"'), treeOf());
    caretAtEnd(lineOf('Operation Husky')); $('#ins-nested').click(); type('Test op'); await sleep(100);
    ok('Insert > Nested list starts a line under the caret\'s', treeOf().includes('      - "  Operation Husky"\n      - "    Test op"'), treeOf());
    depthButton.click(); depthButton.click(); await sleep(100);
    ok('depth goes 3, 4, 1, and 1 brings everything up to one level', treeOf().includes('depth: 1')
      && treeOf().includes('      - "  Test op"') && !treeOf().includes('"    '), treeOf());
    guidesButton.click(); await sleep(100);
    ok('the guide lines switch off', treeOf().includes('guides: false') && guidesButton.classList.contains('off'), treeOf());
    const nestedMd = $('#preview').textContent;
    await openFile(nestedMd, 'nested-test.md');
    const back = [...document.querySelectorAll('.ib-edit tr[data-kind="row"]')].find((tr) => tr.querySelector('th')?.textContent === 'Battles/wars');
    const backLines = back && [...back.querySelectorAll('.ce.outline > div')].map((d) => d.dataset.level + ' ' + d.textContent).join(' | ');
    ok('and a saved page reads back as it was', back?.dataset.depth === '1' && back?.dataset.guides === 'false'
      && backLines === '0 World War II | 1 North African campaign | 1 Operation Torch | 1 Operation Husky | 1 Test op | 1 Battle of Port Lyautey', backLines);

    // The romanisation takes a line per native title, as the native title takes one per language.
    const romajiBox = $('#ib-romaji');
    const shiftEnter = new KeyboardEvent('keydown', { key: 'Enter', shiftKey: true, bubbles: true, cancelable: true });
    romajiBox.dispatchEvent(shiftEnter);
    const plainEnter = new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true });
    romajiBox.dispatchEvent(plainEnter);
    ok('shift+enter opens another romanisation line, enter still moves on', !shiftEnter.defaultPrevented && plainEnter.defaultPrevented,
      [shiftEnter.defaultPrevented, plainEnter.defaultPrevented]);
    romajiBox.innerHTML = 'Koin Senso<br>Jiayin Zhanzheng';
    romajiBox.dispatchEvent(new Event('input', { bubbles: true }));
    await sleep(100);
    ok('and two lines save as two', $('#preview').textContent.includes('romaji:\n  - "Koin Senso"\n  - "Jiayin Zhanzheng"'),
      ($('#preview').textContent.match(/romaji:[^\n]*(\n  - [^\n]*)*/) || [''])[0]);

    // Sidebar pictures, dragged: beside another, across their pair, and out to a row of their own.
    const picsMd = ['---', 'title: "Pictures test"', 'type: overview', 'infobox:',
      '  - { image: "/assets/flags/arverne.png", caption: "Flag A" }',
      '  - { image: "/assets/flags/alemannia.png", caption: "Flag B" }',
      '  - { label: "Capital", value: "Somewhere" }', '---', '', 'Body.', ''].join('\n');
    await openFile(picsMd, 'pictures-test.md');
    const slotOf = (cap) => [...document.querySelectorAll('#ib .ib-slot')].find((s) => s.querySelector('.ce').textContent === cap);
    const dragOnto = (from, target, fx, fy) => {
      const dt = new DataTransfer();
      const img = from.querySelector('img');
      img.dispatchEvent(new DragEvent('dragstart', { bubbles: true, dataTransfer: dt }));
      const box = target.getBoundingClientRect();
      const at = { clientX: box.left + box.width * fx, clientY: box.top + box.height * fy, bubbles: true, cancelable: true, dataTransfer: dt };
      target.dispatchEvent(new DragEvent('dragover', at));
      target.dispatchEvent(new DragEvent('drop', at));
      img.dispatchEvent(new DragEvent('dragend', { bubbles: true, dataTransfer: dt }));
    };
    const sidebarMd = () => ($('#preview').textContent.match(/infobox:\n[\s\S]*?(?=\n---)/) || [''])[0];
    dragOnto(slotOf('Flag A'), slotOf('Flag B'), 0.75, 0.5); await sleep(100);
    ok('a picture dropped on another stands beside it', sidebarMd().includes('  - images:\n'
      + '      - { src: "/assets/flags/alemannia.png", caption: "Flag B" }\n      - { src: "/assets/flags/arverne.png", caption: "Flag A" }'), sidebarMd());
    dragOnto(slotOf('Flag A'), slotOf('Flag B'), 0.25, 0.5); await sleep(100);
    ok('within its pair it changes sides', sidebarMd().includes(
      '      - { src: "/assets/flags/arverne.png", caption: "Flag A" }\n      - { src: "/assets/flags/alemannia.png", caption: "Flag B" }'), sidebarMd());
    const capitalRow = [...document.querySelectorAll('#ib tr[data-kind="row"]')].find((tr) => tr.querySelector('th')?.textContent === 'Capital');
    dragOnto(slotOf('Flag B'), capitalRow.querySelector('td'), 0.5, 0.9); await sleep(100);
    ok('onto another row it takes a row of its own there', sidebarMd().includes('  - { image: "/assets/flags/arverne.png", caption: "Flag A" }\n'
      + '  - { label: "Capital", value: "Somewhere" }\n  - { image: "/assets/flags/alemannia.png", caption: "Flag B" }'), sidebarMd());

    // Picture rows joined into one gallery: no divider between, as many rows of one or two as wanted.
    await openFile(['---', 'title: "Gallery test"', 'type: overview', 'infobox:', '  - images:',
      '      - { src: "/assets/flags/arverne.png", caption: "A" }', '      - { src: "/assets/flags/alemannia.png", caption: "B" }',
      '  - { image: "/assets/flags/andam-islands.png", caption: "C" }', '  - { image: "/assets/flags/arunya.png", caption: "D" }',
      '---', '', 'Body.', ''].join('\n'), 'gallery-test.md');
    const pictureRows = () => [...document.querySelectorAll('#ib tr[data-kind="image"]')];
    const joinSwitch = (tr) => tr.querySelector('.ctl > button');
    joinSwitch(pictureRows()[1]).click(); joinSwitch(pictureRows()[2]).click(); await sleep(100);
    ok('picture rows joined save as one gallery', sidebarMd().includes('  - { image: "/assets/flags/andam-islands.png", caption: "C", join: true }\n'
      + '  - { image: "/assets/flags/arunya.png", caption: "D", join: true }'), sidebarMd());
    const topRule = (tr) => getComputedStyle(tr.querySelector('td')).borderTopWidth;
    ok('and are drawn with no divider between', topRule(pictureRows()[1]) === '0px' && topRule(pictureRows()[0]) !== '0px', [topRule(pictureRows()[0]), topRule(pictureRows()[1])]);
    dragOnto(slotOf('D'), slotOf('C'), 0.75, 0.5); await sleep(100);
    ok('a pair made by dragging keeps its place in the gallery', sidebarMd().includes('  - images:\n'
      + '      - { src: "/assets/flags/andam-islands.png", caption: "C" }\n      - { src: "/assets/flags/arunya.png", caption: "D" }\n    join: true'), sidebarMd());
    await openFile($('#preview').textContent, 'gallery-back.md');
    ok('and a saved gallery opens joined', pictureRows().length === 2 && pictureRows()[1].classList.contains('ib-join')
      && joinSwitch(pictureRows()[1]).classList.contains('on'), pictureRows().map((tr) => tr.className).join(' | '));

    // A side of a parallel list is its list, with no heading box over it. A side is named
    // in bold on its first line, and a heading from before opens as that line.
    await openFile('---\ntitle: "Pair test"\ntype: event\ninfobox:\n  - pair:\n'
      + '      - heading: "The Entente:"\n        items:\n          - ":flag[nichirin] [[nichirin]]"\n'
      + '      - heading: "Central Powers:"\n        items:\n          - "Selmira"\n---\n\nBody.\n', 'pair-test.md');
    const pairRow = () => document.querySelector('.ib-edit tr[data-kind="pair"]');
    const sides = [...pairRow().querySelectorAll('td')].map((td) => td.querySelectorAll('.ce').length).join();
    ok('a side of a parallel list has no heading box', sides === '1,1', sides);
    const opener = pairRow().querySelector('td .ce > div');
    ok('an old heading opens as the bold first line of its side', opener?.querySelector('b')?.textContent === 'The Entente:', opener?.innerHTML);
    const pairSaved = '  - pair:\n      - items:\n          - "**The Entente:**"\n          - ":flag[nichirin] [[nichirin]]"\n'
      + '      - items:\n          - "**Central Powers:**"\n          - "Selmira"';
    ok('and saves as bold text, with no heading', sidebarMd().includes(pairSaved) && !sidebarMd().includes('heading'), sidebarMd());
    await openFile($('#preview').textContent, 'pair-back.md');
    ok('which opens again as it was saved', sidebarMd().includes(pairSaved), sidebarMd());
    const emptied = pairRow().querySelectorAll('td .ce')[1];
    emptied.innerHTML = '<div data-level="0"><br></div>';
    emptied.dispatchEvent(new Event('input', { bubbles: true }));
    await sleep(100);
    ok('an empty side is written as an empty list', sidebarMd().includes('      - items: []'), sidebarMd());
    await openFile($('#preview').textContent, 'pair-empty.md');
    ok('and opens as an empty side', pairRow()?.querySelectorAll('td').length === 2 && !pairRow().querySelectorAll('td .ce')[1].textContent.trim(),
      pairRow()?.innerHTML.slice(0, 200));

    // Insert as Icon: any picture, in the line at the caret, the height of its text, outlined or not.
    focusEnd(paras()[0]);
    document.querySelector('[data-as="icon"]').click();
    ok('Icon offers the white outline and puts the shapes away', !$('#mp-outline-row').hidden && $('#mp-ratio').closest('.mp-row').hidden, '');
    const iconIn = async (url) => {
      $('#mp-link').value = url;
      $('#mp-link').dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));
      await sleep(100);
      return [...paras()[0].querySelectorAll('img.tok[data-tok="img"]')].find((i) => i.dataset.slug.startsWith(url));
    };
    document.querySelector('[data-outline="0"]').click();
    const bareIcon = await iconIn('https://i.imgur.com/AyTZTRT.jpeg');
    ok('without the outline, it goes in at the caret the height of the text', $('#preview').textContent.includes(':img[https://i.imgur.com/AyTZTRT.jpeg|bare]')
      && bareIcon?.classList.contains('sym') && !bareIcon.classList.contains('sized'), bareIcon?.className);
    document.querySelector('[data-outline="1"]').click();
    const lined = await iconIn('https://i.imgur.com/eehIIHD.png');
    ok('with it, it wears the flag\'s white outline', $('#preview').textContent.includes(':img[https://i.imgur.com/eehIIHD.png|outline]')
      && lined && !lined.classList.contains('sym'), lined?.className);
    document.querySelector('[data-as="image"]').click();

    // Insert > Data table: the same grid, marked so the page can sort it by any column.
    focusEnd(paras()[0]);
    document.querySelector('#dtbl-pick .tbl-cell[data-r="3"][data-c="2"]').click();
    await sleep(100);
    const dataBlk = document.querySelector('#body .blk[data-sortable]');
    ok('a data table goes in, labelled as one', dataBlk?.querySelector('.blk-tag')?.textContent === 'Data table', dataBlk && dataBlk.className);
    ok('and is written as a sortable HTML table', $('#preview').textContent.includes('<table class="sortable">'),
      ($('#preview').textContent.match(/<table[^>]*>/g) || []).join(' '));

    // A data table opened from a file: an ampersand reads as one, and small print stays small.
    const cellIn = '<td>Kanaeya &amp; Co.<br><small>Native</small><br><small>*Romaji*</small></td>';
    await openFile(`---\ntitle: "Table test"\ntype: list\n---\n\n<table class="sortable">\n`
      + `<tr><th>Name</th><th>Group</th></tr>\n<tr>${cellIn}<td>A</td></tr>\n</table>\n`, 'table-test.md');
    const nameCell = document.querySelector('#body .blk[data-sortable] .ed-tbl tr:nth-child(2) td');
    ok('an opened data table shows & as itself', nameCell?.textContent === 'Kanaeya & Co.NativeRomaji', nameCell?.textContent);
    ok('its small print is small, the romaji italic too', nameCell?.querySelectorAll('small').length === 2
      && nameCell.querySelector('small i')?.textContent === 'Romaji', nameCell?.innerHTML);
    ok('and it saves as it came in, bar the entity', $('#preview').textContent
      .includes('<td>Kanaeya & Co.<br><small>Native</small><br><small>*Romaji*</small></td>'),
      ($('#preview').textContent.match(/<td>Kanaeya[^\n]*/) || [])[0]);

    // Browser saves: every page's unsent edits are kept in this browser, one draft a page,
    // and come back when the page is opened again. There used to be one draft a tab, which
    // the next page opened, or a reload of a page's Edit link, wrote over.
    const shelfAll = () => new Promise((res) => {
      const r = indexedDB.open('talopedia-drafts', 1);
      r.onupgradeneeded = () => r.result.createObjectStore('drafts', { keyPath: 'key' });
      r.onsuccess = () => {
        const q = r.result.transaction('drafts').objectStore('drafts').getAll();
        q.onsuccess = () => { r.result.close(); res(q.result); };
      };
      r.onerror = () => res([]);
    });
    // Asked of the store itself until it answers: its writes land when they land.
    const until = async (cond) => {
      for (let i = 0; i < 100; i++) { const all = await shelfAll(); if (cond(all)) return all; await sleep(50); }
      return shelfAll();
    };
    const keys = (all) => all.map((d) => d.key);
    const openSite = async (title) => {
      $('#file-q').value = title;
      $('#file-q').dispatchEvent(new Event('input'));
      [...document.querySelectorAll('#file-list button')].find((b) => b.textContent === title).click();
      for (let i = 0; i < 100 && $('#f-title').value !== title; i++) await sleep(50);
      await sleep(300);
    };
    await openSite('Nichirin');
    focusEnd(paras()[0]);
    type(' Draftmark');
    let shelved = await until((all) => all.some((d) => d.key === 'article:nichirin' && d.markdown?.includes('Draftmark')));
    ok('an edit is kept in the browser as its page\'s draft', shelved.some((d) => d.key === 'article:nichirin' && d.markdown.includes('Draftmark')), keys(shelved));
    await openSite('Salishia');
    shelved = await shelfAll();
    ok('opening another page keeps it', shelved.some((d) => d.key === 'article:nichirin'), keys(shelved));
    ok('and a page only opened has none', !shelved.some((d) => d.key === 'article:salishia'), keys(shelved));
    focusEnd(paras()[0]);
    type(' x');
    await until((all) => all.some((d) => d.key === 'article:salishia'));
    undo();
    shelved = await until((all) => !all.some((d) => d.key === 'article:salishia'));
    ok('a page put back as it was opened has none again', !shelved.some((d) => d.key === 'article:salishia'), keys(shelved));
    await openSite('Nichirin');
    ok('opened again, the page comes back with its edit', txt(0).includes('Draftmark') && /Unsent edits put back/.test($('#status').textContent),
      [txt(0).slice(-30), $('#status').textContent]);
    $('#new').click();
    await sleep(100);
    $('#f-title').value = 'Draft Test Page';
    $('#f-title').dispatchEvent(new Event('input', { bubbles: true }));
    shelved = await until((all) => all.some((d) => d.key.startsWith('new:') && d.title === 'Draft Test Page'));
    ok('a new page has a draft of its own', shelved.some((d) => d.key.startsWith('new:') && d.title === 'Draft Test Page'), keys(shelved));
    ok('and starting it threw nothing away', shelved.some((d) => d.key === 'article:nichirin'), keys(shelved));
    // Every page with changes is in Publish, where each opens or resets.
    const pubRows = () => [...document.querySelectorAll('#pub-list .pr-row')];
    const rowOf = (t) => pubRows().find((r) => r.querySelector('.pr-top b')?.textContent === t);
    const openPub = async (t) => { $('#publish').click(); for (let i = 0; i < 60 && !rowOf(t); i++) await sleep(50); };
    await openPub('Nichirin');
    ok('Publish lists every page with changes, newest first', pubRows()[0]?.querySelector('.pr-top b')?.textContent === 'Draft Test Page'
      && !!rowOf('Nichirin'), pubRows().map((r) => r.querySelector('.pr-top b')?.textContent));
    ok('and the toolbar counts them', $('#pub-n').textContent === String(pubRows().length), [$('#pub-n').textContent, pubRows().length]);
    rowOf('Nichirin').querySelector('[title="Open"]').click();
    for (let i = 0; i < 40 && $('#f-title').value !== 'Nichirin'; i++) await sleep(50);
    ok('and one opens from there', $('#f-title').value === 'Nichirin' && txt(0).includes('Draftmark') && $('#pub-panel').hidden,
      [$('#f-title').value, txt(0).slice(-30)]);
    await openPub('Nichirin');
    const confirmWas = window.confirm;
    window.confirm = () => true;
    rowOf('Nichirin').querySelector('[title="Reset"]').click();
    shelved = await until((all) => !all.some((d) => d.key === 'article:nichirin'));
    for (let i = 0; i < 100 && txt(0).includes('Draftmark'); i++) await sleep(50);
    window.confirm = confirmWas;
    ok('reset, it is gone and the page is as the site has it', !shelved.some((d) => d.key === 'article:nichirin') && !txt(0).includes('Draftmark'),
      [keys(shelved), txt(0).slice(-30)]);
    ok('and it leaves the list', !rowOf('Nichirin'), pubRows().map((r) => r.querySelector('.pr-top b')?.textContent));
    $('#pub-close').click();

    // A navbox's History rows are its history series' periods, and take dates.
    await openFile(['title: "Test Articles"', 'groups:', '  - label: "History"', '    rows:',
      '      - label: "Antiquity"', '        dates: "100–500"', '        items:', '          - "great-war"',
      '      - label: "Modern"', '        items:', '          - "elysian-civil-war"',
      '  - label: "Politics"', '    rows:', '      - label: "Government"', '        items:', '          - "nichirin"', ''].join('\n'), 'test-nav.yaml');
    const rowsNamed = (t) => [...document.querySelectorAll('#body .blk-subsection')].find((b) => b.querySelector('.ce').textContent === t);
    ok('a History row shows its dates', rowsNamed('Antiquity')?.classList.contains('dated') && rowsNamed('Antiquity').querySelector('.blk-dates').value === '100–500',
      rowsNamed('Antiquity')?.querySelector('.blk-dates')?.value);
    ok('a row outside History has none', !rowsNamed('Government')?.classList.contains('dated'));
    const modern = rowsNamed('Modern').querySelector('.blk-dates');
    click(modern);
    modern.focus();
    modern.value = '1900–1950';
    modern.dispatchEvent(new Event('input', { bubbles: true }));
    await sleep(100);
    ok('dates typed are written under their row', /- label: "Modern"\n {8}dates: "1900–1950"/.test($('#preview').textContent), $('#preview').textContent.slice(0, 300));
    ok('and the stored ones are kept', /- label: "Antiquity"\n {8}dates: "100–500"/.test($('#preview').textContent));
    await sleep(1200);
    undo();
    await sleep(100);
    ok('undo takes typed dates back out', rowsNamed('Modern').querySelector('.blk-dates').value === '' && rowsNamed('Antiquity').classList.contains('dated'),
      rowsNamed('Modern').querySelector('.blk-dates').value);
  } catch (err) {
    out.push('FAIL threw: ' + err.message);
  }
  const pre = document.createElement('pre');
  pre.id = 'undo-results';
  pre.textContent = out.join('\n');
  document.body.append(pre);
})();
