export interface SecretStorage { getItemAsync(key:string):Promise<string|null>; setItemAsync(key:string,value:string):Promise<void>; deleteItemAsync(key:string):Promise<void> }
// Serialize operations and commit the small manifest last, so a failed write cannot
// replace a valid session with a partial one. Each SecureStore value stays small.
export function authStorage(store:SecretStorage) {
  let pending:Promise<unknown>=Promise.resolve();
  const run=<T>(fn:()=>Promise<T>):Promise<T>=>{const next=pending.then(fn,fn);pending=next.catch(()=>{});return next;};
  const head=(key:string)=>'auth.'+key.replace(/[^\w.-]/g,'_');
  async function manifest(key:string) {
    const raw=await store.getItemAsync(head(key));
    if(!raw)return null;
    try {const m=JSON.parse(raw);return typeof m.id==='string'&&/^[a-z0-9]+$/.test(m.id)&&Number.isInteger(m.count)&&m.count>0&&m.count<=100?m as {id:string;count:number}:null;}catch{return null;}
  }
  const part=(key:string,id:string,i:number)=>`${head(key)}.${id}.${i}`;
  async function clear(key:string,m:{id:string;count:number}|null){if(m)await Promise.all(Array.from({length:m.count},(_,i)=>store.deleteItemAsync(part(key,m.id,i))));}
  return {
    getItem:(key:string)=>run(async()=>{const m=await manifest(key);if(!m)return null;const parts=await Promise.all(Array.from({length:m.count},(_,i)=>store.getItemAsync(part(key,m.id,i))));return parts.some(p=>p===null)?null:parts.join('');}),
    setItem:(key:string,value:string)=>run(async()=>{
      if(value.length>100000)throw Error('Session too large');
      const old=await manifest(key), id=Date.now().toString(36)+Math.random().toString(36).slice(2), count=Math.max(1,Math.ceil(value.length/1500));
      try {for(let i=0;i<count;i++)await store.setItemAsync(part(key,id,i),value.slice(i*1500,(i+1)*1500));await store.setItemAsync(head(key),JSON.stringify({id,count}));}
      catch(error){await clear(key,{id,count}).catch(()=>{});throw error;}
      await clear(key,old).catch(()=>{});
    }),
    removeItem:(key:string)=>run(async()=>{const old=await manifest(key);await store.deleteItemAsync(head(key));await clear(key,old);}),
  };
}
