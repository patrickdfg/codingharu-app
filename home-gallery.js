// 공개 작품 갤러리. 서버에서 승인·공개 범위를 확인하며 등록과 수정은 기존 학생 게시판에서 한다.
(() => {
  'use strict';
  const box = document.getElementById('publicGalleryList'), status = document.getElementById('publicGalleryStatus');
  if (!box) return;
  const el = (tag, text) => { const node = document.createElement(tag); if (text) node.textContent = text; return node; };
  const kinds = { entry: '엔트리', scratch: '스크래치', web: '웹 작품', html: 'HTML 작품', zip: '압축 파일' };
  let apiUrl, thumbnails = {};
  async function api(action, body = {}) {
    const response = await fetch(apiUrl, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify({ action, ...body }) });
    if (!response.ok) throw new Error('gallery unavailable');
    const data = await response.json();
    if (!data.ok) throw new Error(data.error);
    return data;
  }
  function card(item) {
    const article = el('article'); article.className = 'gallery-card';
    const kind = kinds[item.kind] ? item.kind : 'web';
    const cover = el('div'); cover.className = 'gallery-cover'; cover.dataset.kind = kind; cover.setAttribute('aria-hidden', 'true');
    const symbol = el('span', { entry: 'E', scratch: 'S', web: '</>', html: '</>', zip: 'ZIP' }[kind]); symbol.className = 'gallery-symbol';
    const label = el('span', kinds[kind]); label.className = 'gallery-cover-label';
    cover.append(symbol, label);
    const snapshot = thumbnails[item.id], source = [item.url || '', item.file?.ext || '', item.at || 0].join('|');
    const scratch = !item.file && kind === 'scratch' && String(item.url).match(/^https:\/\/scratch\.mit\.edu\/projects\/(\d+)(?:\/|$)/i);
    if (snapshot?.source === source && /^[a-f0-9]{12}-[a-f0-9]{12}\.jpg$/.test(snapshot.file)) {
      const image = document.createElement('img'); image.alt = ''; image.loading = 'lazy'; image.className = 'gallery-snapshot';
      image.src = 'gallery-thumbnails/' + snapshot.file; image.onerror = () => image.remove(); cover.append(image);
    } else if (scratch) {
      const image = document.createElement('img'); image.alt = ''; image.loading = 'lazy';
      image.src = 'https://cdn2.scratch.mit.edu/get_image/project/' + scratch[1] + '_480x360.png';
      image.onerror = () => image.remove(); cover.append(image);
    }
    const body = el('div'); body.className = 'gallery-body';
    const meta = el('span', kinds[kind]); meta.className = 'gallery-kind';
    const title = el('h3', item.title), description = el('p', String(item.desc || '').replace(/^\[연구소:[a-z]+-\d{2}\]\s*/, '')); description.className = 'gallery-description';
    body.append(meta, title, description); article.append(cover, body);
    if (item.file) {
      const download = el('button', '작품 파일 받기 (.' + item.file.ext + ')'); download.type = 'button'; download.className = 'gallery-open';
      const note = el('p'); note.className = 'gallery-file-status'; note.setAttribute('role', 'status');
      download.onclick = async () => {
        download.disabled = true; note.textContent = '파일을 불러오는 중이에요.';
        try {
          const file = await api('galleryPublicFile', { id: item.id });
          const bytes = Uint8Array.from(atob(file.data), c => c.charCodeAt(0));
          const url = URL.createObjectURL(new Blob([bytes], { type: file.mime }));
          const link = el('a'); link.href = url; link.download = file.name;
          article.append(link); link.click(); link.remove();
          setTimeout(() => URL.revokeObjectURL(url), 60000);
          note.textContent = '파일을 내려받았어요. 해당 제작 도구에서 열어 보세요.';
        } catch { note.textContent = '파일을 불러오지 못했어요. 잠시 뒤 다시 시도해 주세요.'; }
        finally { download.disabled = false; }
      };
      body.append(download, note);
    } else if (/^https:\/\//i.test(item.url)) {
      const link = el('a', '작품 열어 보기 ↗'); link.href = item.url; link.target = '_blank'; link.rel = 'noopener noreferrer';
      link.className = 'gallery-open'; body.append(link);
    }
    return article;
  }
  async function load() {
    status.textContent = '공개 작품을 불러오는 중이에요.';
    try {
      const [config, snapshots] = await Promise.all([
        fetch('record-config.json', { cache: 'no-store' }).then(r => r.json()),
        fetch('gallery-thumbnails/index.json', { cache: 'no-store' }).then(r => r.ok ? r.json() : {}).catch(() => ({}))
      ]);
      thumbnails = snapshots.items || {};
      apiUrl = config.apiUrl;
      if (!apiUrl) throw new Error('gallery unavailable');
      const data = await api('galleryPublicList');
      const items = Array.isArray(data.items) ? data.items : [];
      let page = 0, category = 'all';
      const categoryOf = item => item.file ? 'file' : (kinds[item.kind] ? item.kind : 'web');
      const filters = document.getElementById('publicGalleryFilters');
      const categories = [['all', '전체'], ['web', '웹 작품'], ['entry', '엔트리'], ['scratch', '스크래치'], ['file', '파일 작품']];
      filters.replaceChildren(...categories.filter(([key]) => key === 'all' || items.some(item => categoryOf(item) === key)).map(([key, label]) => {
        const button = el('button', label); button.type = 'button'; button.dataset.category = key;
        button.onclick = () => { category = key; page = 0; render(); };
        return button;
      }));
      const pages = el('div'); pages.className = 'public-gallery-pages';
      const previous = el('button', '이전 작품'), next = el('button', '다음 작품'), counter = el('span');
      previous.type = next.type = 'button'; counter.setAttribute('aria-live', 'polite');
      function render() {
        const filtered = items.filter(item => category === 'all' || categoryOf(item) === category);
        box.replaceChildren(...filtered.slice(page * 4, page * 4 + 4).map(card));
        filters.querySelectorAll('button').forEach(button => button.setAttribute('aria-pressed', String(button.dataset.category === category)));
        previous.disabled = page === 0; next.disabled = (page + 1) * 4 >= filtered.length;
        counter.textContent = (page + 1) + ' / ' + Math.ceil(filtered.length / 4); pages.hidden = filtered.length <= 4;
      }
      previous.onclick = () => { page--; render(); };
      next.onclick = () => { page++; render(); };
      document.getElementById('publicGalleryPages')?.remove();
      if (items.length > 4) {
        pages.id = 'publicGalleryPages'; pages.append(previous, counter, next); box.after(pages);
      }
      render();
      status.textContent = items.length ? '공개 작품 ' + items.length + '개 · 로그인 없이 감상할 수 있어요.' : '아직 공개된 작품이 없어요. 새로운 작품을 기다려 주세요.';
    } catch {
      status.textContent = '작품을 불러오지 못했어요. ';
      const retry = el('button', '다시 불러오기'); retry.type = 'button'; retry.onclick = load;
      status.append(retry);
    }
  }
  let started = false;
  function start() {
    if (started || document.documentElement.dataset.page !== 'works') return;
    started = true; load();
  }
  new MutationObserver(start).observe(document.documentElement, { attributes: true, attributeFilter: ['data-page'] });
  start();
})();
