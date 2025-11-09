/* ----------  GLOBALS  ---------- */
let rawRows = [];          // every single order
let aggData = [];          // rolled-up per customer+restaurant
const today = new Date();

/* ----------  HOOK UP BUTTONS  ---------- */
document.getElementById('fileInput').addEventListener('change', handleFile);
document.getElementById('applyBtn').addEventListener('click', applyFilters);

/* ----------  EXCEL UPLOAD  ---------- */
function handleFile(e) {
  const file = e.target.files[0];
  if (!file) return;

  document.getElementById('fileName').textContent = file.name; // span next to the button
  const reader = new FileReader();

  reader.onload = function (evt) {
    // stash the binary string so details.html can read the same file
    localStorage.setItem('lastExcel', evt.target.result);

    const wb = XLSX.read(evt.target.result, { type: 'binary' });
    const ws = wb.Sheets[wb.SheetNames[0]];
    rawRows = XLSX.utils.sheet_to_json(ws, { defval: '' });

    aggregate();
    populateDropdowns();
    applyFilters();
  };
  reader.readAsBinaryString(file);
}

/* ----------  BUILD CUSTOMER SUMMARIES  ---------- */
function aggregate() {
  const map = {}; // phone → {name, phone, orders[], total}

  rawRows.forEach(r => {
    const phone = (r['Account Phones'] || '').toString().trim();
    if (!phone) return; // skip blank rows

    if (!map[phone]) {
      map[phone] = {
        name: r['Account Name'] || '—',
        phone: phone,
        orders: [],
        total: 0
      };
    }

    const amt = parseFloat(r['Total Price']) || 0;
    const date = new Date(r['Created'] || r['OrderDate'] || '');
    const rest = r['Resturant'] || r['Restaurant'] || '';
    const pay  = r['Payment Method'] || '';

    map[phone].orders.push({ date, value: amt, rest, pay });
    map[phone].total += amt;
  });

  aggData = Object.values(map).map(x => {
    x.orders.sort((a, b) => a.date - b.date);
    const last = x.orders[x.orders.length - 1].date;
    const days = Math.floor((today - last) / 864e5);
    return {
      phone: x.phone,
      name: x.name,
      orders: x.orders.length,
      totalSpent: x.total,
      avgSpent: x.total / x.orders.length,
      lastOrder: last,
      daysAgo: days,
      year: last.getFullYear(),
      orderList: x.orders
    };
  });
}

/* ----------  FILL DROP-DOWNS  ---------- */
function populateDropdowns() {
  const rests = ['All', ...new Set(rawRows.map(r => r['Resturant'] || r['Restaurant'] || '').filter(Boolean))].sort();
  const years = ['All', ...new Set(aggData.map(x => x.year))].sort((a, b) => b - a);

  document.getElementById('restFilter').innerHTML = rests.map(v => `<option>${v}</option>`).join('');
  document.getElementById('yearFilter').innerHTML = years.map(v => `<option>${v}</option>`).join('');
}

/* ----------  FILTER & DRAW  ---------- */
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

  let out = aggData.filter(x =>
    (restSel === 'All' || x.orderList.some(o => o.rest === restSel)) &&
    (yearSel === 'All' || x.year === parseInt(yearSel)) &&
    x.avgSpent >= avgMin && x.avgSpent <= avgMax &&
    x.totalSpent >= totMin && x.totalSpent <= totMax &&
    x.daysAgo >= lastMin && x.daysAgo <= lastMax &&
    x.orders >= ordMin && x.orders <= ordMax &&
    (!lostOnly || x.daysAgo > 90)
  );
  out.sort((a, b) => b.orders - a.orders);
  drawTable(out);
}

/* ----------  RENDER TABLE  ---------- */
function drawTable(data) {
  const tbody = document.querySelector('#mainTable tbody');
  tbody.innerHTML = '';
  data.forEach(r => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td><a href="details.html?phone=${encodeURIComponent(r.phone)}" target="_blank">${r.phone}</a></td>
      <td>${r.name}</td>
      <td>${r.orders}</td>
      <td>${r.totalSpent.toFixed(2)}</td>
      <td>${r.avgSpent.toFixed(2)}</td>
      <td>${r.lastOrder.toLocaleDateString()}</td>
      <td>${r.daysAgo}</td>`;
    tbody.appendChild(tr);
  });
  document.getElementById('stats').textContent = `Showing ${data.length} phones`;
}
