const $ = id => document.getElementById(id);
const categories = ['Reconstruction pass', 'First prototype', 'Time study', 'Angles', 'Driver views', 'Material studies', 'Proposed skyline', 'Development history'];
let shots = [], visible = [], activeCategory = 'All', lightboxList = [], currentIndex = 0;

function element(tag, className, text) {
  const el = document.createElement(tag);
  if (className) el.className = className;
  if (text !== undefined) el.textContent = text;
  return el;
}
function label(value, fallback = 'Unspecified') { return value === null || value === undefined || value === '' ? fallback : String(value); }
function resolution(shot) { return shot.width && shot.height ? `${shot.width} × ${shot.height}` : 'Original capture'; }
function screenLabel(shot) { return typeof shot.screen === 'boolean' ? (shot.screen ? 'Screen on' : 'Screen off') : label(shot.screen, 'Screen unspecified'); }
function liveURL(shot) { return `../?view=${encodeURIComponent(shot.viewId)}`; }
function makeImage(shot, lazy = true) {
  const img = element('img'); img.src = shot.thumb || shot.src; img.alt = `${shot.title}. ${label(shot.time)}. ${label(shot.camera)} view.`;
  img.loading = lazy ? 'lazy' : 'eager'; img.decoding = 'async';
  if (shot.width && shot.height) { img.width = shot.width; img.height = shot.height; }
  return img;
}
function setMetadata(container, shot) {
  container.replaceChildren();
  const data = [['Time', label(shot.time)], ['Camera', label(shot.camera)], ['Material', label(shot.style, 'Physical')], ['Crown', screenLabel(shot)], ['Resolution', resolution(shot)]];
  for (const [name, value] of data) { const group = element('div'); group.append(element('dt', '', name), element('dd', '', value)); container.append(group); }
}
function setImage(target, shot, useThumbnail = false) {
  target.src = useThumbnail ? (shot.thumb || shot.src) : shot.src; target.alt = `${shot.title}. ${label(shot.time)}. ${label(shot.camera)} view.`;
  if (shot.width && shot.height) { target.width = shot.width; target.height = shot.height; }
}
function configureLink(target, shot) { target.hidden = !shot.viewId; if (shot.viewId) target.href = liveURL(shot); else target.removeAttribute('href'); }
function openShot(shot, list = visible) {
  lightboxList = list.includes(shot) ? list : shots;
  currentIndex = lightboxList.indexOf(shot);
  if (currentIndex < 0) currentIndex = 0;
  updateLightbox();
  if (!$('lightbox').open) $('lightbox').showModal();
}
function updateLightbox() {
  const shot = lightboxList[currentIndex]; if (!shot) return;
  setImage($('lightboxImage'), shot);
  $('lightboxTitle').textContent = shot.title;
  $('lightboxDescription').textContent = shot.description || '';
  $('lightboxCategory').textContent = shot.category || 'Capture';
  $('lightboxPosition').textContent = `${currentIndex + 1} of ${lightboxList.length} captures`;
  setMetadata($('lightboxMeta'), shot);
  $('downloadShot').href = shot.src; $('downloadShot').download = `${shot.id}.png`;
  configureLink($('openLive'), shot);
  $('previousShot').disabled = lightboxList.length < 2; $('nextShot').disabled = lightboxList.length < 2;
}
function moveShot(delta) { if (lightboxList.length) { currentIndex = (currentIndex + delta + lightboxList.length) % lightboxList.length; updateLightbox(); } }
function renderCards() {
  visible = activeCategory === 'All' ? shots : shots.filter(shot => shot.category === activeCategory);
  $('captureCount').textContent = `${visible.length} of ${shots.length} captures`;
  $('emptyState').hidden = visible.length > 0;
  const fragment = document.createDocumentFragment();
  for (const shot of visible) {
    const article = element('article', 'capture-card');
    const button = element('button', 'image-button'); button.type = 'button'; button.setAttribute('aria-label', `Enlarge ${shot.title}`);
    button.append(makeImage(shot), element('span', 'image-action', 'View capture')); button.addEventListener('click', () => openShot(shot));
    const copy = element('div', 'card-copy'), kicker = element('p', 'card-kicker');
    kicker.append(element('span', '', shot.category || 'Capture'), element('span', '', resolution(shot)));
    copy.append(kicker, element('h3', '', shot.title));
    if (shot.description) copy.append(element('p', 'description', shot.description));
    copy.append(element('p', 'card-meta', `${label(shot.time)} · ${label(shot.camera)} · ${label(shot.style, 'Physical')} · ${screenLabel(shot)}`));
    const actions = element('div', 'card-actions'), download = element('a', '', 'Download PNG'); download.href = shot.src; download.download = `${shot.id}.png`; actions.append(download);
    if (shot.viewId) { const live = element('a', '', 'Open this view'); live.href = liveURL(shot); actions.append(live); }
    copy.append(actions); article.append(button, copy); fragment.append(article);
  }
  $('captureGrid').replaceChildren(fragment);
  for (const button of $('filters').children) button.setAttribute('aria-pressed', String(button.dataset.category === activeCategory));
}
function renderFilters() {
  const available = ['All', ...categories.filter(category => shots.some(shot => shot.category === category))];
  for (const category of new Set(shots.map(shot => shot.category).filter(Boolean))) if (!available.includes(category)) available.push(category);
  $('filters').replaceChildren();
  for (const category of available) {
    const button = element('button', 'filter', category); button.type = 'button'; button.dataset.category = category;
    button.setAttribute('aria-pressed', String(category === activeCategory));
    button.addEventListener('click', () => { activeCategory = category; renderCards(); }); $('filters').append(button);
  }
}
function compareUpdate(side) {
  const shot = shots.find(item => item.id === $(`compare${side}`).value); if (!shot) return;
  setImage($(`compareImage${side}`), shot);
  $(`compareCaption${side}`).textContent = `${shot.title} · ${label(shot.time)} · ${label(shot.camera)} · ${screenLabel(shot)}`;
  $(`compareOpen${side}`).setAttribute('aria-label', `Enlarge ${shot.title}`);
  $(`compareOpen${side}`).onclick = () => openShot(shot, shots);
}
function initCompare() {
  for (const side of ['A', 'B']) {
    const select = $(`compare${side}`);
    for (const shot of shots) { const option = element('option', '', `${shot.title} · ${label(shot.time)}`); option.value = shot.id; select.append(option); }
    select.addEventListener('change', () => compareUpdate(side));
  }
  const reconstructed = shots.filter(shot => shot.id.startsWith('v02-reno-'));
  const timeShots = reconstructed.length ? reconstructed : shots.filter(shot => shot.category === 'Time study');
  $('compareA').value = (timeShots.find(shot => /daylight/i.test(shot.time)) || timeShots.find(shot => /golden/i.test(shot.time)) || timeShots[0] || shots[0]).id;
  $('compareB').value = (timeShots.find(shot => /afterglow/i.test(shot.time)) || timeShots.find(shot => /blue/i.test(shot.time)) || timeShots[2] || timeShots[1] || shots[1] || shots[0]).id;
  compareUpdate('A'); compareUpdate('B'); $('compareSection').hidden = shots.length < 2;
}
async function init() {
  try {
    const response = await fetch('./shots.json', { cache: 'no-cache' });
    if (!response.ok) throw new Error(`Manifest unavailable (${response.status})`);
    const manifest = await response.json();
    if (!Array.isArray(manifest.shots)) throw new Error('The capture manifest is incomplete.');
    shots = manifest.shots.filter(shot => shot && shot.id && shot.title && shot.src);
    if (!shots.length) { $('loadStatus').textContent = 'Captures are being prepared. This page will show them once the capture set is saved.'; return; }
    const hero = shots.find(shot => shot.id === 'v02-reno-afterglow') || shots.find(shot => shot.id === 'approach-afterglow') || shots.find(shot => shot.category !== 'Development history') || shots[0];
    setImage($('heroImage'), hero, true); $('heroTitle').textContent = hero.title; $('heroDescription').textContent = hero.description || '';
    setMetadata($('heroMeta'), hero); configureLink($('heroLive'), hero);
    $('heroOpen').setAttribute('aria-label', `Enlarge ${hero.title}`); $('heroOpen').addEventListener('click', () => openShot(hero, shots));
    $('hero').hidden = false; $('captures').hidden = false; $('loadStatus').hidden = true;
    renderFilters(); renderCards(); initCompare();
    const details = [];
    if (manifest.build) details.push(`Build ${String(manifest.build).slice(0, 12)}`);
    if (manifest.capturedAt) { const date = new Date(manifest.capturedAt); if (!Number.isNaN(date.valueOf())) details.push(`Captured ${new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'America/Chicago' }).format(date)}`); }
    $('buildNote').textContent = details.join(' · ');
    const selected = new URLSearchParams(location.search).get('shot');
    if (selected) { const shot = shots.find(item => item.id === selected); if (shot) openShot(shot, shots); }
  } catch (error) {
    $('loadStatus').classList.add('error'); $('loadStatus').textContent = 'The capture list could not load. Reload the page to try again.';
    console.error('Gallery:', error);
  }
}
$('closeLightbox').addEventListener('click', () => $('lightbox').close());
$('previousShot').addEventListener('click', () => moveShot(-1));
$('nextShot').addEventListener('click', () => moveShot(1));
$('lightbox').addEventListener('click', event => { if (event.target === $('lightbox')) { const rect = $('lightbox').getBoundingClientRect(); if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) $('lightbox').close(); } });
$('lightbox').addEventListener('keydown', event => { if (event.key === 'ArrowLeft') { event.preventDefault(); moveShot(-1); } if (event.key === 'ArrowRight') { event.preventDefault(); moveShot(1); } });
init();
