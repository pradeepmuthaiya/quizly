// Small SVG charts for the progress screen. Values are shares from 0 to 1.

const HEIGHT = 190;
const MARGIN = { top: 14, right: 46, bottom: 26, left: 40 };
const SHOW_DOTS_UP_TO = 30;

const fmt = (value) => `${Math.round(value * 100)}%`;
const round1 = (value) => Math.round(value * 10) / 10;

function layout(count, width) {
  const plotWidth = width - MARGIN.left - MARGIN.right;
  const plotHeight = HEIGHT - MARGIN.top - MARGIN.bottom;
  const x = (index) => round1(count === 1 ? MARGIN.left + plotWidth / 2 : MARGIN.left + (plotWidth * index) / (count - 1));
  const y = (value) => round1(MARGIN.top + plotHeight * (1 - value));
  return { plotWidth, plotHeight, x, y };
}

// A line of round scores, oldest on the left. The tooltip layer is added by attachLineChart.
export function lineChartHtml(values, width, label) {
  const { x, y } = layout(values.length, width);
  const baseline = y(0);
  const points = values.map((value, index) => `${x(index)},${y(value)}`);
  const last = values.length - 1;
  const grid = [0, 0.5, 1].map((value) => `
    <line class="chart-grid" x1="${MARGIN.left}" x2="${width - MARGIN.right}" y1="${y(value)}" y2="${y(value)}"></line>
    <text class="chart-tick" x="${MARGIN.left - 8}" y="${y(value)}" text-anchor="end" dominant-baseline="middle">${fmt(value)}</text>`).join('');
  const area = values.length > 1
    ? `<path class="chart-area" d="M${x(0)},${baseline} L${points.join(' L')} L${x(last)},${baseline} Z"></path>`
    : '';
  const dots = values
    .map((value, index) => ({ value, index }))
    .filter(({ index }) => values.length <= SHOW_DOTS_UP_TO || index === last)
    .map(({ value, index }) => `<circle class="chart-dot" cx="${x(index)}" cy="${y(value)}" r="4"></circle>`)
    .join('');
  const xLabels = values.length > 1 ? `
    <text class="chart-tick" x="${x(0)}" y="${HEIGHT - 6}" text-anchor="start">Round 1</text>
    <text class="chart-tick" x="${x(last)}" y="${HEIGHT - 6}" text-anchor="end">Round ${values.length}</text>` : '';

  return `
    <div class="chart">
      <p class="chart-readout" aria-live="polite"><strong></strong> <span></span></p>
      <svg class="chart-svg" width="${width}" height="${HEIGHT}" viewBox="0 0 ${width} ${HEIGHT}"
        role="img" aria-label="${label}" tabindex="0">
        ${grid}
        ${area}
        <polyline class="chart-line" points="${points.join(' ')}"></polyline>
        ${dots}
        <text class="chart-end" x="${x(last) + 9}" y="${y(values[last])}" dominant-baseline="middle">${fmt(values[last])}</text>
        ${xLabels}
        <line class="chart-cross" x1="0" x2="0" y1="${MARGIN.top}" y2="${baseline}" visibility="hidden"></line>
        <circle class="chart-focus" r="5" visibility="hidden"></circle>
      </svg>
    </div>`;
}

// Tap, drag or hover finds the nearest round and shows it in the readout above the
// chart, so nothing covers the line; arrow keys step through rounds.
// points: [{ value, detail }], detail is plain text.
export function attachLineChart(container, points) {
  const svg = container.querySelector('.chart-svg');
  if (!svg) return;
  const width = Number(svg.getAttribute('width'));
  const { x, y } = layout(points.length, width);
  const cross = svg.querySelector('.chart-cross');
  const focus = svg.querySelector('.chart-focus');
  const readout = container.querySelector('.chart-readout');
  let active = points.length - 1;

  const describe = (index) => {
    readout.querySelector('strong').textContent = fmt(points[index].value);
    readout.querySelector('span').textContent = points[index].detail;
  };
  const show = (index) => {
    active = Math.max(0, Math.min(points.length - 1, index));
    const px = x(active);
    const py = y(points[active].value);
    cross.setAttribute('x1', px);
    cross.setAttribute('x2', px);
    focus.setAttribute('cx', px);
    focus.setAttribute('cy', py);
    cross.setAttribute('visibility', 'visible');
    focus.setAttribute('visibility', 'visible');
    describe(active);
  };
  // At rest the readout describes the latest round.
  const hide = () => {
    cross.setAttribute('visibility', 'hidden');
    focus.setAttribute('visibility', 'hidden');
    describe(points.length - 1);
  };
  hide();
  const nearest = (event) => {
    const bounds = svg.getBoundingClientRect();
    const px = event.clientX - bounds.left;
    let best = 0;
    for (let index = 1; index < points.length; index++) {
      if (Math.abs(x(index) - px) < Math.abs(x(best) - px)) best = index;
    }
    return best;
  };

  svg.addEventListener('pointerdown', (event) => show(nearest(event)));
  svg.addEventListener('pointermove', (event) => {
    if (event.pointerType === 'mouse' || event.buttons) show(nearest(event));
  });
  svg.addEventListener('pointerleave', (event) => {
    if (event.pointerType === 'mouse') hide();
  });
  svg.addEventListener('focus', () => show(active));
  svg.addEventListener('blur', hide);
  svg.addEventListener('keydown', (event) => {
    if (event.key === 'ArrowLeft') show(active - 1);
    else if (event.key === 'ArrowRight') show(active + 1);
    else return;
    event.preventDefault();
  });
}

// The last few rounds as a tiny trend line, latest round marked.
export function sparklineHtml(values) {
  const width = 76;
  const height = 28;
  const pad = 5;
  const step = values.length > 1 ? (width - pad * 2) / (values.length - 1) : 0;
  const px = (index) => round1(values.length > 1 ? pad + step * index : width / 2);
  const py = (value) => round1(pad + (height - pad * 2) * (1 - value));
  const last = values.length - 1;
  return `
    <svg class="spark" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" aria-hidden="true">
      ${values.length > 1 ? `<polyline class="spark-line" points="${values.map((value, index) => `${px(index)},${py(value)}`).join(' ')}"></polyline>` : ''}
      <circle class="spark-dot" cx="${px(last)}" cy="${py(values[last])}" r="4"></circle>
    </svg>`;
}
