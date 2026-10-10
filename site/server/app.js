import express from 'express';
import { randomBytes, randomUUID } from 'node:crypto';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { digest, verifyCode, cookieToken } from './auth.js';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
export const deliveryFor = subtotal => subtotal >= 2000 ? 0 : 200;
const publicProduct = p => ({ ...p, price: Number(p.price), stock: Number(p.stock), visible: Boolean(p.visible) });
const fail = (status, message) => Object.assign(new Error(message), { status });
const dateInTyumen = date => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Yekaterinburg', year: 'numeric', month: '2-digit', day: '2-digit' }).format(date);
const trimmed = (value, min, max, label) => {
  if (typeof value !== 'string' || value.trim().length < min || value.trim().length > max) throw fail(400, `Проверьте поле «${label}».`);
  return value.trim();
};
function rateLimit(limit, windowMs) {
  const hits = new Map();
  return (req,res,next) => {
    const now=Date.now(), key=req.ip, record=hits.get(key);
    if (hits.size > 5000) for (const [k,v] of hits) if (v.until<now) hits.delete(k);
    const entry=record && record.until>now ? record : { count:0, until:now+windowMs };
    entry.count++; hits.set(key,entry);
    if(entry.count>limit) { res.set('Retry-After',String(Math.ceil((entry.until-now)/1000))); return res.status(429).json({ error:'Слишком много попыток. Подождите несколько минут.' }); }
    next();
  };
}
export function createApp({ store, ownerHash, production = false }) {
  const app = express();
  app.disable('x-powered-by');
  if(production) app.set('trust proxy',1);
  app.use((req,res,next) => {
    res.set({
      'X-Content-Type-Options':'nosniff',
      'Referrer-Policy':'strict-origin-when-cross-origin',
      'X-Frame-Options':'DENY',
      'Permissions-Policy':'camera=(), microphone=(), geolocation=()',
      'Content-Security-Policy':"default-src 'self'; img-src 'self'; style-src 'self'; script-src 'self'; font-src 'self'; connect-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'",
    });
    if(production) res.set('Strict-Transport-Security','max-age=31536000');
    if(req.path.startsWith('/api') || req.path.startsWith('/admin')) res.set('Cache-Control','no-store');
    next();
  });
  app.use(express.json({ limit:'32kb' }));
  app.use(express.urlencoded({ extended:false, limit:'4kb' }));
  app.use((req,res,next) => {
    if(['GET','HEAD','OPTIONS'].includes(req.method)) return next();
    if(req.get('Sec-Fetch-Site')==='cross-site') return next(fail(403,'Отправьте запрос со страницы магазина.'));
    const origin=req.get('Origin');
    if(origin) {
      let expectedHost=req.get('host');
      if(production && process.env.PUBLIC_URL) expectedHost=new URL(process.env.PUBLIC_URL).host;
      try { if(new URL(origin).host!==expectedHost) return next(fail(403,'Отправьте запрос со страницы магазина.')); }
      catch { return next(fail(403,'Некорректный источник запроса.')); }
    }
    next();
  });
  const session = async req => {
    const token=cookieToken(req);
    return token ? store.session(digest(token)) : false;
  };
  const requireOwner = async (req,res,next) => {
    if(await session(req)) return next();
    return res.status(401).json({ error:'Войдите в кабинет владельца.' });
  };
  const cookieOptions={ httpOnly:true, sameSite:'lax', secure:production, path:'/', maxAge:86400000 };
  app.get('/health',(req,res) => res.json({ ok:true }));
  app.get('/api/catalog',async (req,res) => {
    const products=store.products().map(publicProduct);
    const order=['morning','sunset','cloud','lilac','garden','red'];
    products.sort((a,b) => (order.indexOf(a.id)<0?99:order.indexOf(a.id))-(order.indexOf(b.id)<0?99:order.indexOf(b.id)));
    res.json({ products, delivery:{ city:'Тюмень', fee:200, freeFrom:2000 }, payment:'upon_receipt' });
  });
  app.post('/api/orders',rateLimit(30,600000),async (req,res) => {
    const body=req.body;
    if(!body || typeof body!=='object') throw fail(400,'Проверьте данные заказа.');
    const name=trimmed(body.name,2,80,'Имя');
    const phone=trimmed(body.phone,10,24,'Телефон').replace(/[^0-9]/g,'');
    if(!/^[78]\d{10}$/.test(phone)) throw fail(400,'Укажите российский номер телефона: +7 и 10 цифр.');
    const address=trimmed(body.address,5,240,'Улица, дом, квартира');
    const comment=trimmed(body.comment ?? '',0,1000,'Комментарий');
    const today=dateInTyumen(new Date());
    const deliveryDate=trimmed(body.deliveryDate,10,10,'Дата доставки');
    if(!/^\d{4}-\d{2}-\d{2}$/.test(deliveryDate) || Number.isNaN(Date.parse(deliveryDate)) || deliveryDate<today || deliveryDate>dateInTyumen(new Date(Date.now()+90*86400000))) throw fail(400,'Выберите дату доставки: сегодня или в ближайшие 90 дней.');
    const deliveryTime=body.deliveryTime;
    if(!['agree','morning','afternoon','evening'].includes(deliveryTime)) throw fail(400,'Выберите удобное время доставки.');
    if(body.consent!==true) throw fail(400,'Подтвердите обработку контактов для выполнения заказа.');
    if(!/^[a-zA-Z0-9-]{16,80}$/.test(body.requestKey || '')) throw fail(400,'Обновите страницу оформления заказа.');
    if(!Array.isArray(body.items) || body.items.length<1 || body.items.length>30) throw fail(400,'Добавьте букет в корзину.');
    const items=body.items.map(item => {
      if(!item || typeof item.id!=='string' || item.id.length>80 || !Number.isSafeInteger(item.quantity) || item.quantity<1 || item.quantity>50) throw fail(400,'Проверьте количество букетов.');
      return { id:item.id, quantity:item.quantity };
    }).sort((a,b)=>a.id.localeCompare(b.id));
    if(new Set(items.map(i=>i.id)).size!==items.length) throw fail(400,'В корзине повторяются позиции. Обновите страницу.');
    const fingerprint=digest(JSON.stringify({ name,phone,address,comment,deliveryDate,deliveryTime,items }));
    const existing=store.orderByKey(body.requestKey);
    if(existing) {
      if(existing.fingerprint!==fingerprint) throw fail(409,'Этот заказ уже оформлен. Начните новый заказ.');
      return res.status(201).json({ number:existing.number,total:existing.total,subtotal:existing.subtotal,delivery:existing.delivery });
    }
    let subtotal=0;
    const lines=[];
    for(const item of items) {
      const p=store.product(item.id);
      if(!p || !p.visible) throw fail(409,'Один из букетов больше недоступен. Обновите корзину.');
      if(p.stock<item.quantity) throw fail(409,`Букет «${p.name}»: осталось ${p.stock} шт. Уменьшите количество.`);
      subtotal+=p.price*item.quantity;
      lines.push({ product_id:p.id,name:p.name,price:p.price,quantity:item.quantity });
    }
    if(!Number.isSafeInteger(body.expectedSubtotal) || body.expectedSubtotal!==subtotal) throw fail(409,'Цены обновились. Обновите корзину и проверьте новую сумму.');
    const delivery=deliveryFor(subtotal), total=subtotal+delivery;
    const id=randomUUID(), number=`АЦ-${randomBytes(5).toString('hex').toUpperCase()}`;
    store.addOrder({ id,request_key:body.requestKey,fingerprint,number,created_at:new Date().toISOString(),customer_name:name,phone:`+7${phone.slice(1)}`,address:`Тюмень, ${address}`,delivery_date:deliveryDate,delivery_time:deliveryTime,comment,subtotal,delivery,total,status:'new',items:lines });
    const saved={ number,total,subtotal,delivery };
    res.status(201).json(saved);
  });
  app.get('/admin',async (req,res) => res.sendFile(await session(req) ? 'admin.html':'login.html',{ root:resolve(root,'server/views') }));
  app.post('/admin/login',rateLimit(10,900000),async (req,res) => {
    if(!req.is('application/x-www-form-urlencoded')) throw fail(415,'Используйте форму входа.');
    if(!verifyCode(req.body.code,ownerHash)) return res.redirect(303,'/admin?error=code');
    const old=cookieToken(req);
    if(old) store.removeSession(digest(old));
    const token=randomBytes(32).toString('hex');
    store.addSession(digest(token),Date.now()+86400000);
    res.cookie('flower_session',token,cookieOptions);
    res.redirect(303,'/admin');
  });
  app.post('/admin/logout',async (req,res) => {
    const token=cookieToken(req);
    if(token) store.removeSession(digest(token));
    res.clearCookie('flower_session',{ ...cookieOptions, maxAge:undefined });
    res.redirect(303,'/admin');
  });
  app.use('/api/admin',requireOwner);
  app.get('/api/admin/products',async (req,res) => res.json({ products:store.products(true).map(publicProduct) }));
  const validateProduct = body => {
    const name=trimmed(body.name,2,100,'Название'), category=trimmed(body.category,2,40,'Категория'), description=trimmed(body.description,5,400,'Описание');
    if(!Number.isSafeInteger(body.price) || body.price<1 || body.price>1000000) throw fail(400,'Цена — целое число от 1 до 1 000 000 ₽.');
    if(!Number.isSafeInteger(body.stock) || body.stock<0 || body.stock>10000) throw fail(400,'Остаток — целое число от 0 до 10 000.');
    if(typeof body.visible!=='boolean') throw fail(400,'Укажите видимость букета.');
    if(!/^\/images\/(morning|sunset|cloud|lilac|garden|red)\.png$/.test(body.image)) throw fail(400,'Выберите фотографию букета.');
    return { name, category, description, price:body.price, stock:body.stock, visible:body.visible?1:0, image:body.image, label:trimmed(body.label??'',0,40,'Метка') };
  };
  app.post('/api/admin/products',async (req,res) => {
    const p=validateProduct(req.body), id=randomUUID();
    store.addProduct({ id,...p });
    res.status(201).json({ product:publicProduct({ id,...p }) });
  });
  app.put('/api/admin/products/:id',async (req,res) => {
    const p=validateProduct(req.body);
    const result=store.updateProduct(req.params.id,p);
    if(!result) throw fail(404,'Букет не найден.');
    res.json({ product:publicProduct({ id:req.params.id,...p }) });
  });
  app.get('/api/admin/orders',async (req,res) => {
    res.json({ orders:store.orders().slice(0,500).map(({ request_key,fingerprint,...order })=>order) });
  });
  app.patch('/api/admin/orders/:id',async (req,res) => {
    if(!['new','accepted','completed'].includes(req.body.status)) throw fail(400,'Выберите статус заявки.');
    const result=store.updateOrder(req.params.id,req.body.status);
    if(!result) throw fail(404,'Заявка не найдена.');
    res.json({ ok:true });
  });
  app.get('/api/admin/analytics',async (req,res) => {
    const today=dateInTyumen(new Date());
    const days=Array.from({ length:7 },(_,i)=>{ const d=new Date(`${today}T12:00:00+05:00`); d.setUTCDate(d.getUTCDate()-6+i); return { date:dateInTyumen(d), count:0 }; });
    const orders=store.orders().filter(o=>Date.parse(o.created_at)>=Date.parse(`${days[0].date}T00:00:00+05:00`));
    const top=new Map(); let sum=0;
    for(const o of orders) {
      const day=days.find(d=>d.date===dateInTyumen(new Date(o.created_at)));
      if(day) { day.count++; sum+=Number(o.total); }
    }
    const lines=orders.flatMap(o=>o.items);
    for(const line of lines) { const p=top.get(line.product_id) || { name:line.name, quantity:0 }; p.quantity+=Number(line.quantity); top.set(line.product_id,p); }
    res.json({ count:orders.length, total:sum, average:orders.length?Math.round(sum/orders.length):0, days, top:[...top.values()].sort((a,b)=>b.quantity-a.quantity).slice(0,3) });
  });
  app.use(express.static(resolve(root,'public'),{ index:'index.html', dotfiles:'deny' }));
  app.use((req,res) => res.status(404).json({ error:'Страница не найдена.' }));
  app.use((error,req,res,next) => {
    const status=Number.isInteger(error.status) && error.status>=400 && error.status<600 ? error.status : 500;
    if(status>=500) console.error('Ошибка сервера:',error.code || error.name);
    res.status(status).json({ error:status>=500 ? 'Не удалось сохранить данные. Попробуйте ещё раз. Ваша корзина сохранена.':error.message });
  });
  return app;
}
