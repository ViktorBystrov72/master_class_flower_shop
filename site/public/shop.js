const $=s=>document.querySelector(s);
const money=n=>new Intl.NumberFormat('ru-RU').format(n)+' ₽';
const escape=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const dateInTyumen=d=>new Intl.DateTimeFormat('en-CA',{ timeZone:'Asia/Yekaterinburg',year:'numeric',month:'2-digit',day:'2-digit' }).format(d);
let products=[], category='Все букеты', cart={}, requestKey=crypto.randomUUID(), loading=false;
try { const saved=JSON.parse(localStorage.getItem('flower-cart') || '{}'); if(saved && typeof saved==='object' && !Array.isArray(saved)) for(const [id,q] of Object.entries(saved)) if(Number.isInteger(q) && q>0 && q<=50) cart[id]=q; } catch {}
const persist=()=>{ try{ localStorage.setItem('flower-cart',JSON.stringify(cart)); }catch{} };
const entries=()=>Object.entries(cart).map(([id,quantity])=>({ product:products.find(p=>p.id===id),id,quantity }));
const subtotal=()=>entries().reduce((n,i)=>n+(i.product?.price || 0)*i.quantity,0);
let toastTimer;
function toast(message) { const target=$('#cart-dialog').open?$('#cart-toast'):$('#toast'); $('#toast').hidden=true; $('#cart-toast').hidden=true; target.textContent=message; target.hidden=false; clearTimeout(toastTimer); toastTimer=setTimeout(()=>target.hidden=true,3500); }
function updateCount() { const count=Object.values(cart).reduce((n,q)=>n+q,0); $('#cart-count').textContent=count; $('#open-cart').setAttribute('aria-label',`Открыть корзину, букетов: ${count}`); $('#drawer-count').textContent=count?'('+count+')':''; }
function renderProducts() {
  const categories=['Все букеты',...new Set(products.map(p=>p.category))];
  if(!categories.includes(category)) category='Все букеты';
  $('#filters').innerHTML=categories.map(c=>`<button class="filter ${category===c?'active':''}" data-category="${escape(c)}" aria-pressed="${category===c}">${escape(c)}</button>`).join('');
  const filtered=products.filter(p=>category==='Все букеты' || p.category===category);
  $('#product-count').textContent=`${filtered.length} из ${products.length} букетов`;
  $('#product-grid').innerHTML=filtered.map(p=>`<article class="product-card"><div class="product-photo"><img src="${escape(p.image.replace('.png','.webp'))}" alt="${escape(p.name)} — ${escape(p.description)}" width="1254" height="1254" loading="lazy">${p.label?`<span class="product-label">${escape(p.label)}</span>`:''}${!p.stock?'<span class="unavailable">Скоро вернётся</span>':''}</div><div class="product-meta"><span>${escape(p.category)} букеты</span><span>${p.stock?'В наличии':'Нет в наличии'}</span></div><div class="product-title"><h3>${escape(p.name)}</h3><span>${money(p.price)}</span></div><p class="product-description">${escape(p.description)}</p><button class="product-add" data-add="${escape(p.id)}" aria-label="Добавить ${escape(p.name)} в корзину" ${!p.stock?'disabled':''}><span>${p.stock?'В корзину':'Нет в наличии'}</span><span aria-hidden="true">+</span></button></article>`).join('') || '<p class="empty">В этой категории пока нет букетов.</p>';
}
function renderCart() {
  updateCount();
  const list=entries();
  $('#cart-lines').innerHTML=list.length?list.map(({ product:p,id,quantity:q })=>`<article class="cart-line">${p?`<img src="${escape(p.image.replace('.png','.webp'))}" alt="${escape(p.name)}" width="80" height="95">`:''}<div class="cart-line-info"><h3>${escape(p?.name || 'Букет больше недоступен')}</h3><p class="muted">${p?money(p.price):'Удалите позицию из корзины'}</p><div class="quantity"><button type="button" data-minus="${escape(id)}" aria-label="Уменьшить количество ${escape(p?.name || '')}" ${loading?'disabled':''}>−</button><span>${q}</span><button type="button" data-plus="${escape(id)}" aria-label="Увеличить количество ${escape(p?.name || '')}" ${loading || !p || q>=Math.min(p.stock,50)?'disabled':''}>+</button></div>${p && q>p.stock?`<p class="error-text">Осталось ${p.stock} шт. Измените количество.</p>`:''}</div><div class="cart-line-end"><strong>${p?money(p.price*q):''}</strong><button class="remove" data-remove="${escape(id)}" ${loading?'disabled':''}>Убрать</button></div></article>`).join(''):'<div class="cart-empty"><span>✳</span><h3>Здесь скоро расцветёт букет</h3><p>Выберите цветы для себя или близкого человека.</p><button class="button primary" data-close>К букетам ↗</button></div>';
  const sum=subtotal(),fee=sum>=2000?0:200;
  $('#cart-summary').innerHTML=list.length?`<div class="free-delivery">${sum>=2000?'↗ Доставим по Тюмени бесплатно':`До бесплатной доставки — ${money(2000-sum)}`}</div><div class="totals"><p><span>Букеты</span><strong>${money(sum)}</strong></p><p><span>Доставка по Тюмени</span><strong>${fee?money(fee):'Бесплатно'}</strong></p><p class="grand-total"><span>Итого</span><strong>${money(sum+fee)}</strong></p></div>`:'';
  $('#checkout-form').hidden=!list.length;
  $('#submit-order').disabled=loading || list.some(i=>!i.product || i.quantity>i.product.stock);
  $('#submit-order').textContent=loading?'Сохраняем заказ…':`Оформить заказ · ${money(sum+fee)} ↗`;
}
function change(id,delta,remove=false) {
  if(loading) return;
  const p=products.find(p=>p.id===id);
  const next=remove?0:(cart[id] || 0)+delta;
  if(next>0 && (!p || next>Math.min(p.stock,50))) return toast('Нужного количества букетов пока нет в наличии.');
  if(next<=0) { delete cart[id]; toast(`«${p?.name || 'Букет'}» убран из корзины`); }
  else { cart[id]=next; toast(delta>0?`«${p.name}» добавлен в корзину`:`Количество «${p.name}» уменьшено`); }
  requestKey=crypto.randomUUID(); persist(); updateCount(); if($('#cart-dialog').open) renderCart();
}
async function loadCatalog() {
  const response=await fetch('/api/catalog');
  if(!response.ok) throw new Error('Не удалось загрузить букеты. Обновите страницу через минуту.');
  products=(await response.json()).products;
  renderProducts(); updateCount();
}
document.addEventListener('click',event=>{
  const b=event.target.closest('button'); if(!b) return;
  if(b.hasAttribute('data-category')) { category=b.dataset.category; renderProducts(); }
  if(b.hasAttribute('data-add')) change(b.dataset.add,1);
  if(b.hasAttribute('data-plus')) change(b.dataset.plus,1);
  if(b.hasAttribute('data-minus')) change(b.dataset.minus,-1);
  if(b.hasAttribute('data-remove')) change(b.dataset.remove,0,true);
  if(b.hasAttribute('data-close') && !loading) $('#cart-dialog').close();
});
$('#open-cart').addEventListener('click',async()=>{
  $('#order-success').hidden=true; $('#cart-lines').hidden=false; $('#cart-summary').hidden=false;
  renderCart(); $('#cart-dialog').showModal();
  try { await loadCatalog(); renderCart(); }catch(error){ toast(error.message); }
});
$('#cart-dialog').addEventListener('click',event=>{ if(event.target===$('#cart-dialog') && !loading) $('#cart-dialog').close(); });
$('#cart-dialog').addEventListener('cancel',event=>{ if(loading) event.preventDefault(); });
$('#checkout-form').addEventListener('input',()=>{requestKey=crypto.randomUUID();});
$('#checkout-form').addEventListener('submit',async event=>{
  event.preventDefault(); if(loading) return;
  const form=event.currentTarget, values=Object.fromEntries(new FormData(form));
  loading=true; $('#checkout-error').hidden=true; renderCart();
  try {
    const response=await fetch('/api/orders',{ method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({ ...values,consent:form.elements.consent.checked,requestKey,expectedSubtotal:subtotal(),items:Object.entries(cart).map(([id,quantity])=>({ id,quantity })) }) });
    const result=await response.json();
    if(!response.ok) throw new Error(result.error || 'Не удалось оформить заказ. Попробуйте снова.');
    cart={}; persist(); updateCount(); requestKey=crypto.randomUUID(); form.reset(); $('#delivery-date').value=dateInTyumen(new Date());
    $('#cart-lines').hidden=true; $('#cart-summary').hidden=true; form.hidden=true;
    $('#order-success').innerHTML=`<div class="success"><span class="success-flower">✳</span><p class="eyebrow">ВЫ СДЕЛАЛИ ЧЕЙ-ТО ДЕНЬ</p><h2>Заказ принят<span>с любовью.</span></h2><p>Номер заказа</p><strong class="order-number">${escape(result.number)}</strong><p>Итого: <strong>${money(result.total)}</strong><br>Оплата при получении.</p><p class="muted">Свяжемся с вами, чтобы подтвердить<br>букет и время доставки.</p><button class="button primary" data-close>Спасибо! ↗</button></div>`;
    $('#order-success').hidden=false;
    await loadCatalog();
  }catch(error) {
    $('#checkout-error').textContent=error.message; $('#checkout-error').hidden=false;
    try { await loadCatalog(); }catch{}
  }finally { loading=false; if(!$('#checkout-form').hidden) renderCart(); }
});
$('#year').textContent=new Date().getFullYear();
$('#delivery-date').min=dateInTyumen(new Date()); $('#delivery-date').value=dateInTyumen(new Date());
$('#delivery-date').max=dateInTyumen(new Date(Date.now()+90*86400000));
updateCount();
loadCatalog().catch(error=>{ $('#catalog-error').textContent=error.message; $('#catalog-error').hidden=false; $('#product-grid').innerHTML=''; });
