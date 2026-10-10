import { seedProducts } from './seed.js';

// One independent store per server process, matching bakery-layero.
// Restarting intentionally restores the catalog and clears orders/sessions.
export function createStore() {
  const products=seedProducts.map(p=>({ ...p,visible:1 }));
  const orders=[];
  const sessions=new Map();
  return {
    products:(includeHidden=false)=>products.filter(p=>includeHidden || p.visible),
    product:id=>products.find(p=>p.id===id),
    addProduct:p=>{ products.push(p); return p; },
    updateProduct:(id,p)=>{ const product=products.find(p=>p.id===id); if(!product) return null; Object.assign(product,p); return product; },
    orders:()=>orders,
    orderByKey:key=>orders.find(o=>o.request_key===key),
    addOrder:order=>{
      // All validation runs synchronously before this commit; no partial orders.
      orders.unshift(order);
      for(const item of order.items) products.find(p=>p.id===item.product_id).stock-=item.quantity;
      return order;
    },
    updateOrder:(id,status)=>{ const order=orders.find(o=>o.id===id); if(!order) return null; order.status=status; return order; },
    session:hash=>{ const expiry=sessions.get(hash); if(!expiry) return false; if(expiry<Date.now()) { sessions.delete(hash); return false; } return true; },
    addSession:(hash,expiry)=>{ for(const [key,time] of sessions) if(time<Date.now()) sessions.delete(key); sessions.set(hash,expiry); },
    removeSession:hash=>sessions.delete(hash),
  };
}
