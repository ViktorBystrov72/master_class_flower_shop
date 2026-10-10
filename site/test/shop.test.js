import { test } from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { randomUUID } from 'node:crypto';
import { createApp, deliveryFor } from '../server/app.js';
import { createStore } from '../server/store.js';
import { hashCode } from '../server/auth.js';

async function fixture(t,production=false) {
  const store=createStore(), code='test-owner-'+randomUUID();
  const server=createApp({ store,ownerHash:hashCode(code),production }).listen(0,'127.0.0.1');
  await once(server,'listening'); t.after(()=>new Promise(resolve=>server.close(resolve)));
  const base=`http://127.0.0.1:${server.address().port}`;
  const request=(path,options={})=>fetch(base+path,options);
  const json=(path,body,options={})=>request(path,{ method:'POST',...options,headers:{'Content-Type':'application/json',...options.headers},body:JSON.stringify(body) });
  const login=async()=>{
    const response=await request('/admin/login',{ method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({code}),redirect:'manual' });
    assert.equal(response.status,303); assert.equal(response.headers.get('location'),'/admin');
    return response.headers.get('set-cookie');
  };
  const today=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Yekaterinburg',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
  const order=(product='lilac',quantity=1)=>({ name:'Проверка заказа',phone:'+70000000000',address:'Тестовая улица, дом 1',comment:'Автоматическая проверка',deliveryDate:today,deliveryTime:'agree',consent:true,requestKey:randomUUID(),items:[{id:product,quantity}],expectedSubtotal:store.product(product).price*quantity });
  return {store,request,json,login,order};
}
test('Доставка: 200 ₽ ниже 2 000 ₽, бесплатно ровно от 2 000 ₽',()=>{
  assert.equal(deliveryFor(1900),200); assert.equal(deliveryFor(1999),200); assert.equal(deliveryFor(2000),0); assert.equal(deliveryFor(2001),0);
});
test('Заказ возвращается после сохранения, уменьшает остаток, повторная отправка не создаёт дубль',async t=>{
  const f=await fixture(t), body=f.order();
  const result=await f.json('/api/orders',body); assert.equal(result.status,201);
  const saved=await result.json(); assert.match(saved.number,/^АЦ-/); assert.equal(saved.total,2100); assert.equal(saved.delivery,200);
  assert.equal(f.store.orders().length,1); assert.equal(f.store.product('lilac').stock,14);
  const repeat=await f.json('/api/orders',body); assert.equal((await repeat.json()).number,saved.number);
  assert.equal(f.store.orders().length,1); assert.equal(f.store.product('lilac').stock,14);
  const changed=await f.json('/api/orders',{...body,address:'Другой адрес 2'}); assert.equal(changed.status,409);
  const cookie=await f.login();
  const orders=await(await f.request('/api/admin/orders',{headers:{Cookie:cookie}})).json();
  assert.equal(orders.orders[0].items[0].name,'Сиреневое письмо'); assert.equal(orders.orders[0].number,saved.number);
  assert.equal('fingerprint' in orders.orders[0],false);
  const stats=await(await f.request('/api/admin/analytics',{headers:{Cookie:cookie}})).json();
  assert.equal(stats.count,1); assert.equal(stats.total,2100); assert.equal(stats.average,2100); assert.equal(stats.top[0].quantity,1); assert.equal(stats.days.reduce((n,d)=>n+d.count,0),1);
});
test('Сервер отклоняет подмену цены, недоступный букет и недостаточный остаток без частичной записи',async t=>{
  const f=await fixture(t);
  let result=await f.json('/api/orders',{...f.order(),expectedSubtotal:1}); assert.equal(result.status,409);
  f.store.product('morning').stock=0;
  const b=f.order(); b.items.push({id:'morning',quantity:1}); b.expectedSubtotal+=2400;
  result=await f.json('/api/orders',b); assert.equal(result.status,409); assert.equal(f.store.orders().length,0); assert.equal(f.store.product('lilac').stock,15);
  f.store.product('lilac').visible=0;
  result=await f.json('/api/orders',f.order()); assert.equal(result.status,409);
  const catalog=await(await f.request('/api/catalog')).json(); assert.equal(catalog.products.some(p=>p.id==='lilac'),false);
});
test('Одновременные заказы не продают последний букет дважды',async t=>{
  const f=await fixture(t); f.store.product('lilac').stock=1;
  const results=await Promise.all([f.json('/api/orders',f.order()),f.json('/api/orders',f.order())]);
  assert.deepEqual(results.map(r=>r.status).sort(),[201,409]); assert.equal(f.store.product('lilac').stock,0); assert.equal(f.store.orders().length,1);
});
test('Кабинет и контакты закрыты; неверный код и поддельная cookie не дают доступ; выход отзывает сессию',async t=>{
  const f=await fixture(t);
  for(const path of ['/api/admin/orders','/api/admin/products','/api/admin/analytics']) assert.equal((await f.request(path)).status,401);
  assert.equal((await f.request('/api/admin/orders',{headers:{Cookie:'flower_session=1'}})).status,401);
  assert.equal((await f.request('/api/admin/orders',{headers:{Cookie:'flower_session='+'a'.repeat(64)}})).status,401);
  const page=await(await f.request('/admin')).text(); assert.match(page,/Личный код доступа/); assert.doesNotMatch(page,/orders-list/);
  const wrong=await f.request('/admin/login',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:'code=wrong',redirect:'manual'});
  assert.equal(wrong.headers.get('location'),'/admin?error=code'); assert.equal(wrong.headers.get('set-cookie'),null);
  const cookie=await f.login(); assert.match(cookie,/HttpOnly/); assert.match(cookie,/SameSite=Lax/); assert.match(cookie,/Max-Age=86400/);
  assert.equal((await f.request('/api/admin/orders',{headers:{Cookie:cookie}})).status,200);
  const logout=await f.request('/admin/logout',{method:'POST',headers:{Cookie:cookie},redirect:'manual'}); assert.equal(logout.headers.get('location'),'/admin');
  assert.equal((await f.request('/api/admin/orders',{headers:{Cookie:cookie}})).status,401);
});
test('Владелец добавляет/правит/скрывает букет и меняет статус; перезапуск сбрасывает данные',async t=>{
  const f=await fixture(t), cookie=await f.login(),headers={Cookie:cookie};
  const product={name:'Проверочный букет',category:'Проверка',description:'Только для проверки сохранения',price:2000,stock:2,visible:true,image:'/images/red.png',label:''};
  const created=await f.json('/api/admin/products',product,{headers}); assert.equal(created.status,201);
  const p=(await created.json()).product; assert.equal(f.store.product(p.id).price,2000);
  assert.equal((await f.json('/api/admin/products/'+p.id,{...product,visible:false,price:2200},{method:'PUT',headers})).status,200);
  assert.equal((await(await f.request('/api/catalog')).json()).products.some(x=>x.id===p.id),false);
  assert.equal((await f.json('/api/admin/products',product)).status,401);
  await f.json('/api/orders',f.order()); const o=f.store.orders()[0];
  assert.equal((await f.json('/api/admin/orders/'+o.id,{status:'accepted'},{method:'PATCH',headers})).status,200); assert.equal(o.status,'accepted');
  const restarted=createStore(); assert.equal(restarted.orders().length,0); assert.equal(restarted.product('lilac').stock,15); assert.equal(restarted.products(true).length,6); assert.equal(restarted.product(p.id),undefined);
});
test('Чужой сайт не может отправить форму; prod-cookie защищена Secure',async t=>{
  const f=await fixture(t,true);
  const response=await f.json('/api/orders',f.order(),{headers:{Origin:'https://another.example'}}); assert.equal(response.status,403);
  assert.match(await f.login(),/Secure/);
});
