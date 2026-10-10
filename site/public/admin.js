const $=s=>document.querySelector(s);
const escape=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const money=n=>new Intl.NumberFormat('ru-RU').format(n)+' ₽';
const statusLabels={ new:'Новая',accepted:'Принята',completed:'Выполнена' };
const timeLabels={ agree:'Согласовать по телефону',morning:'Утро',afternoon:'День',evening:'Вечер' };
let products=[],orders=[],saving=false,toastTimer;
function toast(message) { $('#toast').textContent=message; $('#toast').hidden=false; clearTimeout(toastTimer); toastTimer=setTimeout(()=>$('#toast').hidden=true,3000); }
async function api(path,options={}) {
  const response=await fetch('/api/admin/'+path,{ ...options,headers:{'Content-Type':'application/json',...options.headers} });
  if(response.status===401) { location.assign('/admin'); throw new Error('Сессия закончилась. Войдите снова.'); }
  const result=await response.json();
  if(!response.ok) throw new Error(result.error || 'Не удалось сохранить изменения.');
  return result;
}
function renderAnalytics(a) {
  $('#stats').innerHTML=[['Заказы за семь дней',a.count],['Сумма заказов',money(a.total)],['Средний чек',money(a.average)]].map(([title,value])=>`<article class="stat"><p>${title}</p><strong>${value}</strong></article>`).join('');
  const max=Math.max(1,...a.days.map(d=>d.count));
  $('#daily-chart').innerHTML=a.days.map(d=>`<div class="bar-column"><strong>${d.count}</strong><div class="bar-track"><svg class="day-bar" viewBox="0 0 20 80" height="80" preserveAspectRatio="none" role="img" aria-label="${escape(d.date)}: ${d.count} заказов"><rect x="0" y="${80-Math.max(2,Math.round(d.count/max*80))}" width="20" height="${Math.max(2,Math.round(d.count/max*80))}" fill="#263b32"/></svg></div><span>${d.date.slice(8)}.${d.date.slice(5,7)}</span></div>`).join('');
  $('#top-products').innerHTML=a.top.length?a.top.map(p=>`<p class="top-item"><span>${escape(p.name)}</span><strong>${p.quantity} шт.</strong></p>`).join(''):'<p class="muted">Когда появятся заказы, здесь будут любимые букеты покупателей.</p>';
}
function renderOrders() {
  $('#orders-count').textContent=orders.length?`(${orders.length})`:'';
  const filtered=orders.filter(o=>$('#order-filter').value==='all' || o.status===$('#order-filter').value);
  $('#orders-list').innerHTML=filtered.length?filtered.map(o=>`<article class="order-card"><div class="order-card-header"><div><h3>${escape(o.number)}</h3><p>${new Date(o.created_at).toLocaleString('ru-RU',{ timeZone:'Asia/Yekaterinburg' })}</p></div><select data-status="${escape(o.id)}" aria-label="Статус заявки ${escape(o.number)}">${Object.entries(statusLabels).map(([s,label])=>`<option value="${s}" ${o.status===s?'selected':''}>${label}</option>`).join('')}</select></div><div class="order-details"><div><p><strong>${escape(o.customer_name)}</strong></p><p><a href="tel:${escape(o.phone)}">${escape(o.phone)}</a></p><p>${escape(o.address)}</p><p class="muted">${escape(o.delivery_date)} · ${timeLabels[o.delivery_time] || ''}</p>${o.comment?`<p>Комментарий: ${escape(o.comment)}</p>`:''}</div><div><ul>${o.items.map(i=>`<li>${escape(i.name)} × ${i.quantity} — ${money(i.price*i.quantity)}</li>`).join('')}</ul><p>Доставка: ${o.delivery?money(o.delivery):'бесплатно'}</p><p class="order-total">Итого: <strong>${money(o.total)}</strong></p><p class="muted">Оплата при получении</p></div></div></article>`).join(''):'<p class="empty">Заявок пока нет. Новые заказы появятся здесь после оформления на витрине.</p>';
}
function renderProducts() {
  $('#admin-products').innerHTML=products.map(p=>`<article class="admin-product"><img src="${escape(p.image.replace('.png','.webp'))}" alt="${escape(p.name)}" width="90" height="110" loading="lazy"><div><span class="visibility ${p.visible?'':'off'}">${p.visible?'На витрине':'Скрыт'}</span><h3>${escape(p.name)}</h3><p>${escape(p.category)} · ${money(p.price)} · ${p.stock} шт.</p><button data-edit="${escape(p.id)}">Изменить букет ↗</button></div></article>`).join('');
  $('#category-options').innerHTML=[...new Set(products.map(p=>p.category))].map(c=>`<option value="${escape(c)}"></option>`).join('');
}
async function refresh() {
  $('#refresh').disabled=true; $('#admin-error').hidden=true;
  try {
    const [p,o,a]=await Promise.all([api('products'),api('orders'),api('analytics')]);
    products=p.products; orders=o.orders; renderProducts(); renderOrders(); renderAnalytics(a);
  }catch(error){ $('#admin-error').textContent=error.message; $('#admin-error').hidden=false; }
  finally { $('#refresh').disabled=false; }
}
function edit(p) {
  const form=$('#product-form'); form.reset();
  form.elements.id.value=p?.id || '';
  for(const key of ['name','category','label','description','price','stock','image']) if(p) form.elements[key].value=p[key];
  form.elements.visible.checked=p?p.visible:true;
  $('#product-preview').src=form.elements.image.value.replace('.png','.webp');
  $('#edit-title').textContent=p?'Изменить букет':'Новый букет'; $('#product-error').hidden=true;
  $('#product-dialog').showModal();
}
function setTab(tab) {
  for(const name of ['orders','products']) {
    const active=name===tab;
    $('#'+name+'-tab').classList.toggle('active',active);
    $('#'+name+'-tab').setAttribute('aria-selected',String(active));
    $('#'+name+'-section').hidden=!active;
  }
}
$('#orders-tab').addEventListener('click',()=>setTab('orders'));
$('#products-tab').addEventListener('click',()=>setTab('products'));
$('#refresh').addEventListener('click',refresh);
$('#order-filter').addEventListener('change',renderOrders);
$('#new-product').addEventListener('click',()=>edit(null));
$('#close-edit').addEventListener('click',()=>{if(!saving) $('#product-dialog').close();});
$('#product-dialog').addEventListener('cancel',e=>{if(saving)e.preventDefault();});
$('#product-form').elements.image.addEventListener('change',event=>$('#product-preview').src=event.target.value.replace('.png','.webp'));
document.addEventListener('click',event=>{ const button=event.target.closest('[data-edit]'); if(button) edit(products.find(p=>p.id===button.dataset.edit)); });
document.addEventListener('change',async event=>{
  if(!event.target.matches('[data-status]')) return;
  const input=event.target; input.disabled=true;
  try { await api('orders/'+input.dataset.status,{ method:'PATCH',body:JSON.stringify({ status:input.value }) }); toast('Статус заявки изменён'); await refresh(); }
  catch(error){ toast(error.message); await refresh(); }
  finally { input.disabled=false; }
});
$('#product-form').addEventListener('submit',async event=>{
  event.preventDefault(); if(saving) return;
  saving=true; $('#save-product').disabled=true; $('#save-product').textContent='Сохраняем…'; $('#product-error').hidden=true;
  const form=event.currentTarget, values=Object.fromEntries(new FormData(form));
  try {
    const body={ ...values,price:Number(values.price),stock:Number(values.stock),visible:form.elements.visible.checked };
    await api(values.id?'products/'+values.id:'products',{ method:values.id?'PUT':'POST',body:JSON.stringify(body) });
    $('#product-dialog').close(); toast('Букет сохранён'); await refresh();
  }catch(error){ $('#product-error').textContent=error.message; $('#product-error').hidden=false; }
  finally { saving=false; $('#save-product').disabled=false; $('#save-product').textContent='Сохранить букет ↗'; }
});
refresh();
