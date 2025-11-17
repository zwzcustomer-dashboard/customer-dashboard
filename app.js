/* ----------  CONFIG  ---------- */
const COL_PHONE = 'Account Phones';
const COL_NAME  = 'Account Name';
const COL_TOTAL = 'Total Price';
const COL_DATE  = 'Created';
const COL_REST  = 'Resturant';

let rawRows    = [];
let aggData    = [];
let complaints = [];
const today    = new Date();

/* ----------  LOAD + NORMALISE + DEBUG  ---------- */
Promise.all([
  fetch('data.json').then(r => r.json()),
  fetch('complaints.json').then(r => r.json())
])
.then(([dataRows, compRows]) => {
  rawRows    = dataRows.map(r => ({...r, [COL_PHONE]: (r[COL_PHONE] || '').toString().trim()}));
  complaints = compRows.map(c => ({...c, phone: (c.phone || '').toString().trim()}));
  console.log('data phones  :', [...new Set(rawRows.map(r=>r[COL_PHONE]))].slice(0,5));
  console.log('compl phones :', [...new Set(complaints.map(c=>c.phone))].slice(0,5));
  aggregate();
  populateDropdowns();
  applyFilters();
  updateKPICards();
  setStatus('Ready.', 'green');
})
.catch(err => {
  console.error(err);
  setStatus('Error loading JSON files', 'red');
});

/* ----------  STATUS  ---------- */
function setStatus(msg, color = 'black') {
  const s = document.getElementById('status');
  s.textContent = msg;
  s.style.color = color;
}

/* ----------  AGGREGATE  ---------- */
function aggregate() {
  const map = {};
  rawRows.forEach(r => {
    const phone = r[COL_PHONE];
    if (!phone) return;
    if (!map[phone]) map[phone] = { phone, name: r[COL_NAME] || '—', orders: [], total: 0 };
    const amt  = parseFloat(r[COL_TOTAL]) || 0;
    const date = new Date(r[COL_DATE] || '');
    const rest = r[COL_REST] || r['Restaurant'] || '';
    map[phone].orders.push({ date, value: amt, rest });
    map[phone].total += amt;
  });

  aggData = Object.values(map).map(x => {
    x.orders.sort((a, b) => a.date - b.date);
    const last = x.orders[x.orders.length - 1].date;
    const days = Math.floor((today - last) / 864e5);
    const compCount = complaints.filter(c => c.phone === x.phone).length;
    return {
      phone: x.phone,
      name: x.name,
      orders: x.orders.length,
      totalSpent: x.total,
      avgSpent: x.total / x.orders.length,
      lastOrder: last,
      daysAgo: days,
      year: last.getFullYear(),
      orderList: x.orders,
      complaintCount: compCount
    };
  });
}

/* ----------  UPDATE KPI CARDS  ---------- */
function updateKPICards() {
  // Total Revenue
  const totalRevenue = aggData.reduce((sum, customer) => sum + customer.totalSpent, 0);
  document.getElementById('totalRevenue').textContent = formatCurrency(totalRevenue);
  
  // Total Customers
  document.getElementById('totalCustomers').textContent = aggData.length.toLocaleString();
  
  // Average Order Value
  const totalOrders = aggData.reduce((sum, customer) => sum + customer.orders, 0);
  const avgOrderValue = totalRevenue / totalOrders;
  document.getElementById('avgOrderValue').textContent = formatCurrency(avgOrderValue);
  
  // Customers with Complaints
  const customersWithComplaints = aggData.filter(c => c.complaintCount > 0).length;
  const complaintPercentage = ((customersWithComplaints / aggData.length) * 100).toFixed(1);
  document.getElementById('withComplaints').textContent = `${complaintPercentage}%`;
  
  // Lost Customers (90+ days)
  const lostCustomers = aggData.filter(c => c.daysAgo > 90).length;
  document.getElementById('lostCustomers').textContent = lostCustomers.toLocaleString();
}

function formatCurrency(amount) {
  return '¥' + amount.toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  });
}

/* ----------  DROPDOWNS  ---------- */
function populateDropdowns() {
  const rests = ['All', ...new Set(rawRows.map(r => r[COL_REST] || r['Restaurant'] || '').filter(Boolean))].sort();
  const years = ['All', ...new Set(aggData.map(x => x.year))].sort((a, b) => b - a);
  document.getElementById('restFilter').innerHTML = rests.map(r => `<option>${r}</option>`).join('');
  document.getElementById('yearFilter').innerHTML = years.map(y => `<option>${y}</option>`).join('');
}

/* ----------  LIVE FILTERS  ---------- */
function setupEventListeners() {
  ['restFilter','yearFilter','avgMin','avgMax','totMin','totMax','lastMin','lastMax','ordMin','ordMax','complaintKeyword','compMin']
    .forEach(id => document.getElementById(id).addEventListener('input', applyFilters));
  
  document.getElementById('lostOnly').addEventListener('change', applyFilters);
}

// Initialize event listeners when DOM is loaded
document.addEventListener('DOMContentLoaded', setupEventListeners);

function applyFilters() {
  const restSel  = document.getElementById('restFilter').value;
  const yearSel  = document.getElementById('yearFilter').value;
  const avgMin   = parseFloat(document.getElementById('avgMin').value) || 0;
  const avgMax   = parseFloat(document.getElementById('avgMax').value) || Infinity;
  const totMin   = parseFloat(document.getElementById('totMin').value) || 0;
  const totMax   = parseFloat(document.getElementById('totMax').value) || Infinity;
  const lastMin  = parseInt(document.getElementById('lastMin').value) || 0;
  const lastMax  = parseInt(document.getElementById('lastMax').value) || Infinity;
  const ordMin   = parseInt(document.getElementById('ordMin').value) || 0;
  const ordMax   = parseInt(document.getElementById('ordMax').value) || Infinity;
  const lostOnly = document.getElementById('lostOnly').checked;
  const keyword  = document.getElementById('complaintKeyword').value.trim().toLowerCase();
  const compMin  = parseInt(document.getElementById('compMin').value) || 0;

  let list = aggData.filter(x =>
    (restSel === 'All' || x.orderList.some(o => o.rest === restSel)) &&
    (yearSel === 'All' || x.year === parseInt(yearSel)) &&
    x.avgSpent >= avgMin && x.avgSpent <= avgMax &&
    x.totalSpent >= totMin && x.totalSpent <= totMax &&
    x.daysAgo >= lastMin && x.daysAgo <= lastMax &&
    x.orders >= ordMin && x.orders <= ordMax &&
    (!lostOnly || x.daysAgo > 90) &&
    (!keyword || complaints.some(c => c.phone === x.phone && (
      (c.details   || '').toLowerCase().includes(keyword) ||
      (c.category  || '').toLowerCase().includes(keyword)
    ))) &&
    x.complaintCount >= compMin
  );
  list.sort((a, b) => b.orders - a.orders);
  drawTable(list);
}

function resetFilters() {
  document.getElementById('restFilter').value = 'All';
  document.getElementById('yearFilter').value = 'All';
  document.getElementById('avgMin').value = '';
  document.getElementById('avgMax').value = '';
  document.getElementById('totMin').value = '';
  document.getElementById('totMax').value = '';
  document.getElementById('lastMin').value = '';
  document.getElementById('lastMax').value = '';
  document.getElementById('ordMin').value = '';
  document.getElementById('ordMax').value = '';
  document.getElementById('lostOnly').checked = false;
  document.getElementById('complaintKeyword').value = '';
  document.getElementById('compMin').value = '';
  
  applyFilters();
}

function drawTable(data) {
  const tbody = document.querySelector('#mainTable tbody');
  tbody.innerHTML = '';
  data.forEach(r => {
    const tr = document.createElement('tr');
    
    // Determine status badge based on days ago
    let statusClass = 'status-active';
    let statusText = r.daysAgo;
    if (r.daysAgo > 90) {
      statusClass = 'status-inactive';
    } else if (r.daysAgo > 60) {
      statusClass = 'status-warning';
    }
    
    // Add complaints-high class if complaint count is high
    const rowClass = r.complaintCount >= 3 ? 'complaints-high' : '';
    
    tr.className = rowClass;
    tr.innerHTML = `
      <td><a href="details.html?phone=${encodeURIComponent(r.phone)}" target="_blank">${r.phone}</a></td>
      <td>${r.name}</td>
      <td>${r.orders}</td>
      <td>${formatCurrency(r.totalSpent)}</td>
      <td>${formatCurrency(r.avgSpent)}</td>
      <td>${r.lastOrder.toLocaleDateString()}</td>
      <td><span class="status-badge ${statusClass}">${statusText}</span></td>
      <td>${r.complaintCount > 0 ? `<a href="complaints.html?phone=${encodeURIComponent(r.phone)}" target="_blank">${r.complaintCount}</a>` : 0}</td>`;
    tbody.appendChild(tr);
  });
  document.getElementById('stats').textContent = `Showing ${data.length.toLocaleString()} customers`;
}
