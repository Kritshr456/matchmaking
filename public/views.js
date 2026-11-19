export const $ = id => document.getElementById(id);
export function node(tag, value = '', className) {
  const e = document.createElement(tag); e.textContent = String(value);
  if (className) e.className = className;
  return e;
}
export function action(label, fn, className = 'quiet') {
  const b = node('button', label, className); b.type = 'button'; b.onclick = fn; return b;
}
export function badge(value) { return node('span', value, `badge ${value}`); }
export function table(target, headings, rows, empty = 'Nothing here yet.') {
  target.replaceChildren();
  if (!rows.length) { target.append(node('p', empty, 'empty')); return; }
  const grid = node('table'), head = node('thead'), tr = node('tr');
  for (const heading of headings) { const th = node('th', heading); th.scope = 'col'; tr.append(th); }
  head.append(tr); grid.append(head);
  const body = node('tbody');
  for (const row of rows) {
    const tr = node('tr');
    for (const value of row) { const td = node('td'); if (value instanceof Node) td.append(value); else td.textContent = String(value ?? '—'); tr.append(td); }
    body.append(tr);
  }
  grid.append(body); target.append(grid);
}
export const date = value => value === null || value === undefined ? 'Not recorded' : new Date(value).toLocaleString();
export const signed = n => `${n > 0 ? '+' : ''}${n}`;
export function duration(ms) {
  const seconds = Math.max(0, Math.floor(ms / 1000));
  return seconds < 60 ? `${seconds}s` : `${Math.floor(seconds / 60)}m ${seconds % 60}s`;
}
export function metrics(target, items) {
  target.replaceChildren(...items.map(([label, value, hint]) => {
    const card = node('div', '', 'metric'); card.append(node('p', label, 'metric-label'), node('strong', value, 'metric-value'));
    if (hint) card.append(node('small', hint)); return card;
  }));
}
function svgNode(tag, attributes = {}, text) {
  const e = document.createElementNS('http://www.w3.org/2000/svg', tag);
  for (const [key, value] of Object.entries(attributes)) e.setAttribute(key, value);
  if (text !== undefined) e.textContent = text;
  return e;
}
export function activityChart(target, rows) {
  const svg = svgNode('svg', { viewBox: '0 0 700 150', role: 'img', 'aria-label': 'Completed results during the last seven UTC days' });
  const maximum = Math.max(1, ...rows.map(r => r.completed));
  for (const [index, row] of rows.entries()) {
    const x = 20 + index * 98, height = row.completed / maximum * 95;
    svg.append(svgNode('rect', { x, y: 110 - height, width: 55, height, rx: 4, class: 'chart-bar' }),
      svgNode('text', { x: x + 27, y: 140, 'text-anchor': 'middle' }, row.day.slice(5)),
      svgNode('text', { x: x + 27, y: 104 - height, 'text-anchor': 'middle' }, row.completed));
  }
  target.replaceChildren(svg);
}
export function ratingChart(target, rows) {
  if (!rows.length) { target.append(node('p', 'No completed matches in this season.', 'empty')); return; }
  const ratings = [rows[0].before_rating, ...rows.map(r => r.rating)], low = Math.min(...ratings), high = Math.max(...ratings);
  const y = value => 130 - (value - low) / Math.max(1, high - low) * 100;
  const points = ratings.map((rating, index) => `${40 + index / (ratings.length - 1) * 620},${y(rating)}`).join(' ');
  const svg = svgNode('svg', { viewBox: '0 0 700 165', role: 'img', 'aria-label': `Recent rating history from ${ratings[0]} to ${ratings.at(-1)}` });
  svg.append(svgNode('polyline', { points, class: 'rating-line' }), svgNode('text', { x: 8, y: 20 }, high),
    svgNode('text', { x: 8, y: 150 }, low), svgNode('text', { x: 660, y: 160, 'text-anchor': 'end' }, `${rows.length} results`));
  target.append(svg);
}
