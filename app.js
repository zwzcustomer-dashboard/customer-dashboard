/* ----------  CONFIG  ---------- */
const COL_PHONE = 'Account Phones';
const COL_NAME  = 'Account Name';
const COL_TOTAL = 'Total Price';
const COL_DATE  = 'Created';
const COL_REST  = 'Resturant';          // note the typo in your JSON
const COL_PAY   = 'Payment Method';

const today = new Date();

let rawOrders   = [];   // 40 k flat rows
let aggCustomers= [];   // 14 k grouped customers
let complaints  = [];   // complaint rows
let restaurants = new Set();
let years       = new Set();

/* ----------  LOAD & BOOT  ---------- */
Promise.all([
  fetch('data.json').then(r => r.json()),
  fetch('complaints.json').then(r => r.json()).catch(() => [])
])
.then(([orders, comps]) => {
  rawOrders  = orders.map(r => ({...r, [COL_PHONE]: String(r[COL_PHONE]||'').trim()}));
  complaints = (comps||[]).map(c => ({...c, phone:String(c.phone||'').trim()}));
  buildAggregates();
  populateDropdowns();
  wireFilters();
  applyFilters();        // first paint
  updateKPICards();
  setStatus('Ready.','green');
})
.catch(err => setStatus('Error loading JSON – '+err.message,'red'));

/* ----------  STATUS BAR  ---------- */
function setStatus(msg, color='black'){
  const bar=document.getElementById('status');
  bar.textContent=msg; bar.style.color=color;
}

/* ----------  CORE AGGREGATION  ---------- */
function buildAggregates(){
  const map=new Map();
  rawOrders.forEach(o=>{
    const phone = o[COL_PHONE];
    if(!phone) return;
    if(!map.has(phone)) map.set(phone,{name:o[COL_NAME]||'—', phone, orders:[], total:0});
    const obj=map.get(phone);
    const amt  = parseFloat(o[COL_TOTAL])||0;
    const date = new Date(o[COL_DATE]||0);
    const rest = o[COL_REST]||'';
    obj.orders.push({date, value:amt, rest, pay:o[COL_PAY]||''});
    obj.total+=amt;
    restaurants.add(rest);
    years.add(date.getFullYear());
  });

  aggCustomers=[...map.values()].map(c=>{
    c.orders.sort((a,b)=>a.date-b.date);
    const last=c.orders.at(-1).date;
    const days=Math.floor((today-last)/864e5);
    const compCount=complaints.filter(x=>x.phone===c.phone).length;
    return {
      phone:c.phone,
      name:c.name,
      orders:c.orders.length,
      totalSpent:c.total,
      avgSpent:c.total/c.orders.length,
      lastOrder:last,
      daysAgo:days,
      year:last.getFullYear(),
      compCount,
      hasOldTalabat:c.orders.some(o=>o.value===200)
    };
  });
}

/* ----------  KPI CARDS  ---------- */
function updateKPICards(){
  const totalRev   = aggCustomers.reduce((s,c)=>s+c.totalSpent,0);
  const totalOrd   = aggCustomers.reduce((s,c)=>s+c.orders,0);
  const lostCnt    = aggCustomers.filter(c=>c.daysAgo>90).length;
  const withComp   = aggCustomers.filter(c=>c.compCount>0).length;
  const oldTala    = aggCustomers.filter(c=>c.hasOldTalabat).length;

  document.getElementById('totalRevenue').textContent   = 'EGP '+totalRev.toLocaleString('en-US',{minimumFractionDigits:2});
  document.getElementById('totalCustomers').textContent = aggCustomers.length.toLocaleString();
  document.getElementById('avgOrderValue').textContent  = 'EGP '+(totalRev/totalOrd).toFixed(2);
  document.getElementById('withComplaints').textContent = (withComp/aggCustomers.length*100).toFixed(1)+'%';
  document.getElementById('lostCustomers').textContent  = lostCnt.toLocaleString();
  document.getElementById('oldTalabatData').textContent = (oldTala/aggCustomers.length*100).toFixed(1)+'%';
}

/* ----------  DROPDOWNS  ---------- */
function populateDropdowns(){
  document.getElementById('restFilter').innerHTML=
    ['All',...restaurants].map(r=>`<option>${r}</option>`).join('');
  document.getElementById('yearFilter').innerHTML=
    ['All',...years].sort((a,b)=>b-a).map(y=>`<option>${y}</option>`).join('');
}

/* ----------  FILTER LOGIC  ---------- */
function wireFilters(){
  ['restFilter','yearFilter','avgMin','avgMax','totMin','totMax',
   'lastMin','lastMax','ordMin','ordMax','lostOnly','complaintKeyword','compMin']
   .forEach(id=>document.getElementById(id).addEventListener('input',applyFilters));
  document.getElementById('filterToggle').addEventListener('click',()=>{
    document.getElementById('filterControls').classList.toggle('collapsed');
  });
}

function applyFilters(){
  const restSel = document.getElementById('restFilter').value;
  const yearSel = document.getElementById('yearFilter').value;
  const avgMin  = parseFloat(document.getElementById('avgMin').value)||0;
  const avgMax  = parseFloat(document.getElementById('avgMax').value)||Infinity;
  const totMin  = parseFloat(document.getElementById('totMin').value)||0;
  const totMax  = parseFloat(document.getElementById('totMax').value)||Infinity;
  const lastMin = parseInt(document.getElementById('lastMin').value)||0;
  const lastMax = parseInt(document.getElementById('lastMax').value)||Infinity;
  const ordMin  = parseInt(document.getElementById('ordMin').value)||0;
  const ordMax  = parseInt(document.getElementById('ordMax').value)||Infinity;
  const lostOnly= document.getElementById('lostOnly').checked;
  const keyword = document.getElementById('complaintKeyword').value.trim().toLowerCase();
  const compMin = parseInt(document.getElementById('compMin').value)||0;

  let list=aggCustomers.filter(c=>
    (restSel==='All'||c.orders.some(o=>o.rest===restSel)) &&
    (yearSel==='All'||c.year===parseInt(yearSel)) &&
    c.avgSpent>=avgMin && c.avgSpent<=avgMax &&
    c.totalSpent>=totMin && c.totalSpent<=totMax &&
    c.daysAgo>=lastMin && c.daysAgo<=lastMax &&
    c.orders>=ordMin && c.orders<=ordMax &&
    (!lostOnly||c.daysAgo>90) &&
    (!keyword||complaints.some(x=>x.phone===c.phone &&
      ((x.details||'').toLowerCase().includes(keyword)||
       (x.category||'').toLowerCase().includes(keyword)))) &&
    c.compCount>=compMin
  );
  list.sort((a,b)=>b.orders-a.orders);
  drawTable(list);
}

/* ----------  TABLE RENDER  ---------- */
function drawTable(data){
  const tbody=document.querySelector('#mainTable tbody');
  tbody.innerHTML='';
  data.forEach(c=>{
    const tr=document.createElement('tr');
    const status=c.daysAgo>90?'status-inactive':c.daysAgo>60?'status-warning':'status-active';
    const badge=`<span class="status-badge ${status}">${c.daysAgo}</span>`;
    const talabat=c.hasOldTalabat?`<span class="talabat-indicator">⚠️ Talabat</span>`:'';
    const compLink=c.compCount?`<a href="complaint-details.html?phone=${encodeURIComponent(c.phone)}" target="_blank">${c.compCount}</a>`:'0';

    tr.innerHTML=`
      <td><a href="details.html?phone=${encodeURIComponent(c.phone)}" target="_blank">${c.phone}</a>${talabat}</td>
      <td>${c.name}</td>
      <td>${c.orders}</td>
      <td>${c.totalSpent.toLocaleString('en-US',{minimumFractionDigits:2})}</td>
      <td>${c.avgSpent.toFixed(2)}</td>
      <td>${c.lastOrder.toLocaleDateString()}</td>
      <td>${badge}</td>
      <td>${compLink}</td>`;
    tbody.appendChild(tr);
  });
  document.getElementById('stats').textContent=`Showing ${data.length.toLocaleString()} customers`;
}

/* ----------  RESET  ---------- */
window.resetFilters=()=>{
  document.querySelectorAll('.filter-input').forEach(el=>el.value='');
  document.getElementById('lostOnly').checked=false;
  applyFilters();
};
