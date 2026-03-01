
let DATA = null;
let programs = [];

const elRank = document.getElementById('rank');
const elCat = document.getElementById('category');
const elBranch = document.getElementById('branch');
const btn = document.getElementById('btnPredict');
const tbody = document.querySelector('#results tbody');
const kpis = document.getElementById('kpis');

function fmt(n){ return (n===null || n===undefined) ? '—' : n.toLocaleString(); }
function clamp(x,a,b){ return Math.max(a, Math.min(b,x)); }

function fitScore(rank, open, close){
  if(open==null || close==null || rank==null) return 0;
  const spread = Math.max(1, close - open);
  if(rank <= close){
    const t = (close - rank) / spread;
    return Math.round(clamp(55 + 45*t, 55, 98));
  }
  const allowance = close * 0.10;
  const t = (close + allowance - rank) / Math.max(1, allowance);
  return Math.round(clamp(5 + 45*t, 5, 50));
}

function bucket(rank, open, close){
  if(open==null || close==null || rank==null) return '—';
  if(rank <= close*0.80) return 'safe';
  if(rank <= close) return 'target';
  if(rank <= close*1.10) return 'dream';
  return 'unlikely';
}

function badgeHTML(b){
  const names = {safe:'Safe', target:'Target', dream:'Dream', unlikely:'Unlikely'};
  return `<span class="badge ${b}">${names[b]}</span>`;
}

function renderKpis(cat, rank){
  const s = DATA.summary;
  const catStats = s.stats[cat];
  kpis.innerHTML = `
    <div class="kpi"><div class="v">${fmt(s.total_unique_programs)}</div><div class="k">Total programs in dataset</div></div>
    <div class="kpi"><div class="v">${fmt(cat==='DASA-CIWG' ? s.ciwg_programs : s.non_ciwg_programs)}</div><div class="k">Programs in selected category</div></div>
    <div class="kpi"><div class="v">${fmt(Math.round(catStats['Closing median']))}</div><div class="k">Median closing rank</div></div>
    <div class="kpi"><div class="v">${rank? fmt(rank): '—'}</div><div class="k">Your entered rank</div></div>
  `;
}

let activeTab = 'safe';
for(const t of document.querySelectorAll('.tab')){
  t.addEventListener('click', () => {
    document.querySelectorAll('.tab').forEach(x=>x.classList.remove('active'));
    t.classList.add('active');
    activeTab = t.dataset.tab;
    btn.click();
  });
}

btn.addEventListener('click', () => {
  const rank = parseInt(elRank.value, 10);
  const cat = elCat.value;
  const key = (elBranch.value||'').trim().toLowerCase();

  renderKpis(cat, isFinite(rank)?rank:null);

  let list = programs.filter(p => p.Category === cat);
  if(key){
    list = list.filter(p => (p.Branch||'').toLowerCase().includes(key) || (p.Program||'').toLowerCase().includes(key));
  }

  list = list.map(p => {
    const open = p['Overall Opening'];
    const close = p['Overall Closing'];
    const b = bucket(rank, open, close);
    const score = fitScore(rank, open, close);
    return {...p, _bucket:b, _score:score};
  });

  list = list.filter(p => p._bucket === activeTab);
  list.sort((a,b) => (b._score - a._score) || ((a['Overall Closing']||1e18)-(b['Overall Closing']||1e18)) );

  const shown = list.slice(0, 50);
  tbody.innerHTML = shown.map(p => `
    <tr>
      <td>${p.Institute}</td>
      <td>${p.Program}</td>
      <td>${fmt(p['Overall Opening'])}</td>
      <td>${fmt(p['Overall Closing'])}</td>
      <td><strong>${p._score}</strong>/100</td>
      <td>${badgeHTML(p._bucket)}</td>
    </tr>
  `).join('');
});

function buildHistogram(values, bins){
  const counts = new Array(bins.length-1).fill(0);
  values.forEach(v => {
    for(let i=0;i<bins.length-1;i++){
      if(v>=bins[i] && v<bins[i+1]){counts[i]++; return;}
    }
    if(v>=bins[bins.length-1]) counts[counts.length-1]++;
  });
  return counts;
}

function logspace(a,b,n){
  const arr=[];
  for(let i=0;i<n;i++){
    const t=i/(n-1);
    arr.push(Math.pow(10, a + (b-a)*t));
  }
  return arr;
}

function initCharts(){
  const ciwg = programs.filter(p=>p.Category==='DASA-CIWG').map(p=>p['Overall Closing']).filter(v=>v);
  const non = programs.filter(p=>p.Category==='DASA-Non CIWG').map(p=>p['Overall Closing']).filter(v=>v);
  const maxV = Math.max(...ciwg, ...non);
  const bins = logspace(Math.log10(1000), Math.log10(maxV), 26);
  const labels = bins.slice(0,-1).map((b,i)=> `${Math.round(b).toLocaleString()}–${Math.round(bins[i+1]).toLocaleString()}`);

  const distCtx = document.getElementById('chartDist');
  new Chart(distCtx, {
    type:'bar',
    data:{
      labels,
      datasets:[
        {label:'DASA-CIWG', data: buildHistogram(ciwg,bins), backgroundColor:'rgba(106,166,255,.55)'},
        {label:'DASA-Non CIWG', data: buildHistogram(non,bins), backgroundColor:'rgba(246,178,107,.55)'}
      ]
    },
    options:{responsive:true, scales:{x:{ticks:{maxRotation:90,minRotation:60}}, y:{beginAtZero:true}}}
  });

  const top = [...programs]
    .filter(p=>p['Overall Closing'])
    .sort((a,b)=>a['Overall Closing']-b['Overall Closing'])
    .slice(0,10);

  const topCtx = document.getElementById('chartTop');
  new Chart(topCtx, {
    type:'bar',
    data:{
      labels: top.map(p => (p.Institute + ' — ' + (p.Branch||'')).slice(0,38)),
      datasets:[{label:'Overall Closing Rank', data: top.map(p=>p['Overall Closing']), backgroundColor:'rgba(106,166,255,.55)'}]
    },
    options:{indexAxis:'y', responsive:true, plugins:{legend:{display:false}}}
  });

  const scatterCtx = document.getElementById('chartScatter');
  const ptsC = programs.filter(p=>p.Category==='DASA-CIWG' && p['Overall Opening'] && p['Overall Closing']).map(p=>({x:p['Overall Opening'], y:p['Overall Closing']}));
  const ptsN = programs.filter(p=>p.Category==='DASA-Non CIWG' && p['Overall Opening'] && p['Overall Closing']).map(p=>({x:p['Overall Opening'], y:p['Overall Closing']}));

  new Chart(scatterCtx, {
    type:'scatter',
    data:{datasets:[
      {label:'DASA-CIWG', data:ptsC, backgroundColor:'rgba(106,166,255,.55)', pointRadius:2},
      {label:'DASA-Non CIWG', data:ptsN, backgroundColor:'rgba(246,178,107,.55)', pointRadius:2}
    ]},
    options:{responsive:true, scales:{x:{type:'logarithmic'}, y:{type:'logarithmic'}}}
  });
}

async function init(){
  const res = await fetch('data.json');
  DATA = await res.json();
  programs = DATA.programs;
  renderKpis('DASA-CIWG', null);
  initCharts();
}

init();
