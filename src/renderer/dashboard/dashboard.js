function formatTokens(c) { if(c>=1e6)return(c/1e6).toFixed(1)+'M'; if(c>=1e3)return(c/1e3).toFixed(1)+'K'; return String(c); }
function formatCost(u) { return u>=1?`$${u.toFixed(2)}`:`$${u.toFixed(4)}`; }
function formatDuration(ms) { if(ms<=0)return'0m'; const h=Math.floor(ms/3.6e6),m=Math.floor((ms%3.6e6)/6e4); return h>0?`${h}h ${m}m`:`${m}m`; }
function modelClass(n) { if(n.includes('opus'))return'opus'; if(n.includes('sonnet'))return'sonnet'; if(n.includes('haiku'))return'haiku'; return''; }
function shortModel(n) { const c=modelClass(n); return c?c.charAt(0).toUpperCase()+c.slice(1):n; }

function updateUI({ stats, percent }) {
  // Usage
  if (percent) {
    setUsage('5h', percent.used, percent.sessionReset);
    setUsage('7d', percent.weekly, percent.weeklyReset);
  }

  // Model table
  renderTable('model-table', ['Model','Tokens','Cost','Requests'],
    Object.entries(stats.byModel).sort((a,b)=>b[1].totalCost-a[1].totalCost).map(([m,d])=>[
      `<span class="model-tag ${modelClass(m)}">${shortModel(m)}</span>`,
      formatTokens(d.totalInput+d.totalOutput),
      formatCost(d.totalCost),
      d.requestCount,
    ])
  );

  // Project table
  renderTable('project-table', ['Project','Tokens','Cost','Requests'],
    Object.entries(stats.byProject).sort((a,b)=>b[1].totalCost-a[1].totalCost).map(([p,d])=>[
      p,
      formatTokens(d.totalInput+d.totalOutput),
      formatCost(d.totalCost),
      d.requestCount,
    ])
  );

  // Daily table
  renderTable('daily-table', ['Date','Input','Output','Cost','Requests'],
    stats.weekly.map(d=>[
      d.label,
      formatTokens(d.totalInput),
      formatTokens(d.totalOutput),
      formatCost(d.totalCost),
      d.requestCount,
    ])
  );

  // Chart
  renderChart(stats.weekly);

  document.getElementById('refresh-time').textContent =
    new Date().toLocaleTimeString('ko-KR', { hour:'2-digit', minute:'2-digit' });
}

function setUsage(id, pct, reset) {
  const el = document.getElementById(`usage-${id}`);
  el.textContent = `${pct}%`;
  el.className = 'usage-pct' + (pct>=80?' danger':pct>=60?' warning':'');

  const bar = document.getElementById(`progress-${id}`);
  bar.style.width = `${pct}%`;
  bar.className = 'progress-fill' + (pct>=80?' danger':pct>=60?' warning':'');

  const r = document.getElementById(`reset-${id}`);
  if (reset) {
    const rem = reset - Date.now();
    r.textContent = rem > 0 ? `resets in ${formatDuration(rem)}` : 'resetting...';
  }
}

function renderTable(containerId, headers, rows) {
  const c = document.getElementById(containerId);
  const rightCols = new Set([1,2,3,4]); // right-align numeric columns
  let html = '<table><thead><tr>';
  headers.forEach((h,i) => { html += `<th${rightCols.has(i)&&i>0?' class="right"':''}>${h}</th>`; });
  html += '</tr></thead><tbody>';
  for (const row of rows) {
    html += '<tr>';
    row.forEach((cell,i) => { html += `<td${rightCols.has(i)&&i>0?' class="right"':''}>${cell}</td>`; });
    html += '</tr>';
  }
  html += '</tbody></table>';
  c.innerHTML = html;
}

function renderChart(weekly) {
  const container = document.getElementById('weekly-chart');
  container.innerHTML = '';
  const maxCost = Math.max(...weekly.map(d=>d.totalCost), 0.001);
  const todayStr = new Date().toDateString();

  for (const day of weekly) {
    const h = Math.max(2, (day.totalCost/maxCost)*110);
    const isToday = new Date(day.date).toDateString()===todayStr;
    const wrap = document.createElement('div');
    wrap.className = 'chart-bar-wrap';
    wrap.innerHTML = `
      <span class="chart-cost">${day.totalCost>0?formatCost(day.totalCost):''}</span>
      <div class="chart-bar-container">
        <div class="chart-bar${isToday?' today':''}" style="height:${h}px"></div>
      </div>
      <span class="chart-label">${day.label}</span>
    `;
    container.appendChild(wrap);
  }
}

(async () => {
  const data = await window.api.getStats();
  updateUI(data);
})();

window.api.onStatsUpdate(updateUI);
