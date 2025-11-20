/* ----------  CONFIG  ---------- */
const COL_PHONE = 'Account Phones';
const COL_NAME  = 'Account Name';
const COL_TOTAL = 'Total Price';
const COL_DATE  = 'Created';
const COL_REST  = 'Resturant';
const COL_PAY   = 'Payment Method';

const today = new Date();

let rawOrders    = [];
let customersMap = new Map();   // phone -> customer object
let complaints   = [];

/* ----------  DATE NORMALISER (both formats)  ---------- */
function parseDate(d) {
  if (!d) return null;
  if (d.includes('-')) return new Date(d);           // ISO
  const [day, month, year] = d.split('/').map(Number);
  return new Date(year, month - 1, day);             // dd/m/yyyy
}

/* ----------  LOAD & BOOT  ---------- */
Promise.all([
  fetch('data.json').then(r => r.json()),
  fetch('complaints.json').then(r => r.json()).catch(() => [])
])
.then(([orders, comps]) => {
  rawOrders   = orders.map(r => ({...r, [COL_PHONE]: String(r[COL_PHONE]||'').trim()}));
  complaints = (comps||[]).map(c => ({...c, phone:String(c.phone||'').trim()}));
  buildCustomers();
  populateDropdowns();
  wireFilters();
  applyFilters();
  updateKPICards();
  setStatus('Ready.','green');
})
.catch(err => setStatus('Error loading JSON – '+err.message,'red'));

/* ----------  STATUS BAR  ---------- */
function setStatus(msg, color='black'){
  const bar=document.getElementById('status');
  bar.textContent=msg; bar.style.color=color;
}

/* ----------  BUILD CUSTOMER MAP (FIXED)  ---------- */
function buildCustomers(){
  customersMap.clear();
  rawOrders.forEach(o=>{
    const phone = o[COL_PHONE];
    if(!phone) return;

    if(!customersMap.has(phone)){
      customersMap.set(phone,{
        phone,
        name:o[COL_NAME]||'—',
        orders:[],               // ← ARRAY of order objects
        total:0
      });
    }
    const cust = customersMap.get(phone);

    const amt  = parseFloat(o[COL_TOTAL])||0;
    const date = parseDate(o[COL_DATE]);
    const rest = o[COL_REST]||'';
    const pay  = o[COL_PAY]||'';

    cust.orders.push({date, value:amt, rest, pay});
    cust.total += amt;
  });
}

/* ----------  KPI CARDS  ---------- */
function updateKPICards(){
  const list = [...customersMap.values()];
  const totalRev   = list.reduce((s,c)=>s+c.total,0);
  const totalOrd   = list.reduce((s,c)=>s+c.orders.length,0);
  const lostCnt    = list.filter(c=>daysAgo(c)<0).length;          // helper below
  const withComp   = list.filter(c=>complaints.filter(x=>x.phone===c.phone).length>0).length;
  const oldTala    = list.filter(c=>c.orders.some(o=>['Talabat','Elmenus','Instashop'].includes(o.rest))).length;

  document.getElementById('totalRevenue').textContent   = 'EGP '+totalRev.toLocaleString('en-US',{minimumFractionDigits:2});
  document.getElementById('totalCustomers').textContent = list.length.toLocaleString();
  document.getElementById('avgOrderValue').textContent  = 'EGP '+(totalRev/totalOrd).toFixed(2);
  document.getElementById('withComplaints').textContent = (withComp/list.length*100).toFixed(1)+'%';
  document.getElementById('lostCustomers').textContent  = lostCnt.toLocaleString();
  document.getElementById('oldTalabatData').textContent = (oldTala/list.length*100).toFixed(1)+'%';
}

/* ----------  DROPDOWNS  ---------- */
function populateDropdowns(){
  const rests=['All',...new Set(rawOrders.map(o=>o[COL_REST]||''))].sort();
  const years=['All',...new Set([...customersMap.values()].map(c=>lastOrderYear(c)))].sort((a,b)=>b-a);
  document.getElementById('restFilter').innerHTML=rests.map(r=>`<option>${r}</option>`).join('');
  document.getElementById('yearFilter').innerHTML=years.map(y=>`<option>${y}</option>`).join('');
}

/* ----------  FILTER WIRING  ---------- */
function wireFilters(){
  ['restFilter','yearFilter','avgMin','avgMax','totMin','totMax',
   'lastMin','lastMax','ordMin','ordMax','lostOnly','complaintKeyword','compMin']
   .forEach(id=>document.getElementById(id).addEventListener('input',applyFilters));
}

/* ----------  LIVE FILTERS  ---------- */
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

  let list=[...customersMap.values()].filter(c=>{
    const yrs = lastOrderYear(c);
    const days= daysAgo(c);
    const avg = c.total/c.orders.length;
    return (
      (restSel==='All'||c.orders.some(o=>o.rest===restSel)) &&
      (yearSel==='All'||yrs===parseInt(yearSel)) &&
      avg>=avgMin && avg<=avgMax &&
      c.total>=totMin && c.total<=totMax &&
      days>=lastMin && days<=lastMax &&
      c.orders.length>=ordMin && c.orders.length<=ordMax &&
      (!lostOnly||days>90) &&
      (!keyword||complaints.some(x=>x.phone===c.phone &&
        ((x.details||'').toLowerCase().includes(keyword)||
         (x.category||'').toLowerCase().includes(keyword)))) &&
      complaints.filter(x=>x.phone===c.phone).length>=compMin
    );
  });
  list.sort((a,b)=>b.orders.length-a.orders.length);
  drawTable(list);
}

/* ----------  TABLE RENDER  ---------- */
function drawTable(data){
  const tbody=document.querySelector('#mainTable tbody');
  tbody.innerHTML='';
  data.forEach(c=>{
    const days = daysAgo(c);
    const status=days>90?'status-inactive':days>60?'status-warning':'status-active';
    const badge=`<span class="status-badge ${status}">${days}</span>`;
    const talabat=c.orders.some(o=>['Talabat','Elmenus','Instashop'].includes(o.rest))?'<span class="talabat-indicator">⚠️ Old</span>':'';
    const compCount=complaints.filter(x=>x.phone===c.phone).length;
    const compLink=compCount?`<a href="complaint-details.html?phone=${encodeURIComponent(c.phone)}" target="_blank">${compCount}</a>`:'0';

    const tr=document.createElement('tr');
    tr.innerHTML=`
      <td><a href="details.html?phone=${encodeURIComponent(c.phone)}" target="_blank">${c.phone}</a>${talabat}</td>
      <td>${c.name}</td>
      <td>${c.orders.length}</td>
      <td>${c.total.toLocaleString('en-US',{minimumFractionDigits:2})}</td>
      <td>${(c.total/c.orders.length).toFixed(2)}</td>
      <td>${lastOrderDate(c).toLocaleDateString()}</td>
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

/* ----------  HELPERS  ---------- */
function lastOrderDate(c){ return c.orders.at(-1)?.date || new Date(0); }
function lastOrderYear(c){ return lastOrderDate(c).getFullYear(); }
function daysAgo(c){ return Math.floor((today - lastOrderDate(c))/864e5); }
