import { createStore } from './store.js';
import { loadOwnerHash } from './auth.js';
import { createApp } from './app.js';

const production=process.env.NODE_ENV==='production';
const store=createStore();
const ownerHash=loadOwnerHash({ production });
const app=createApp({ store, ownerHash, production });
const portIndex=process.argv.indexOf('--port');
const port=Number(portIndex>=0 ? process.argv[portIndex+1] : process.env.PORT || 3000);
const server=app.listen(port,'0.0.0.0',()=>{
  console.log(`\nАленький цветочек · Тюмень\nLocal: http://localhost:${server.address().port}/\nКабинет: http://localhost:${server.address().port}/admin\nКод владельца: ../pass.txt\n`);
});
for(const signal of ['SIGINT','SIGTERM']) process.on(signal,()=>server.close(()=>process.exit(0)));
