// Archived protobuf reader for RBTV; unknown fields are skipped.
export type Fields = Map<number, (number | Uint8Array)[]>;
export function wireFields(bytes: Uint8Array): Fields {
 if(bytes.length>4*1024*1024)throw new Error('La respuesta deportiva es demasiado grande.');
 let offset=0;const fields:Fields=new Map();
 const integer=()=>{let value=0,shift=0;while(offset<bytes.length&&shift<56){const byte=bytes[offset++];value+=(byte&127)*2**shift;if(!(byte&128)){if(!Number.isSafeInteger(value))throw new Error('Número inválido.');return value;}shift+=7;}throw new Error('Respuesta deportiva incompleta.');};
 while(offset<bytes.length){const tag=integer(),field=Math.floor(tag/8),wire=tag%8;if(!field)throw new Error('Campo deportivo inválido.');let value:number|Uint8Array;
  if(wire===0)value=integer();else if(wire===2){const length=integer();if(length>bytes.length-offset)throw new Error('Respuesta deportiva truncada.');value=bytes.slice(offset,offset+length);offset+=length;}
  else if(wire===1||wire===5){offset+=wire===1?8:4;if(offset>bytes.length)throw new Error('Respuesta deportiva truncada.');continue;}else throw new Error('Formato deportivo desconocido.');
  const values=fields.get(field)||[];values.push(value);fields.set(field,values);
 }return fields;
}
export const message=(fields:Fields,key:number):Fields=>wireFields(fields.get(key)?.[0] instanceof Uint8Array?fields.get(key)![0] as Uint8Array:new Uint8Array());
export const messages=(fields:Fields,key:number):Fields[]=> (fields.get(key)||[]).filter((value):value is Uint8Array=>value instanceof Uint8Array).map(wireFields);
export const number=(fields:Fields,key:number,fallback=0):number=>typeof fields.get(key)?.[0]==='number'?fields.get(key)![0] as number:fallback;
export const text=(fields:Fields,key:number):string=>fields.get(key)?.[0] instanceof Uint8Array?new TextDecoder().decode(fields.get(key)![0] as Uint8Array):'';
export function payload(bytes:Uint8Array):Fields{const envelope=wireFields(bytes);if(number(envelope,2)!==0)throw new Error(text(envelope,3)||'RBTV+ no pudo completar la consulta.');if(!envelope.has(10))throw new Error('RBTV+ devolvió una respuesta vacía.');return message(envelope,10);}
// MD5 is only the API's public request fingerprint, never used for passwords/security.
export function requestFingerprint(input:string):string {
 const raw=new TextEncoder().encode(input),length=Math.ceil((raw.length+9)/64)*64,data=new Uint8Array(length);data.set(raw);data[raw.length]=128;const view=new DataView(data.buffer);view.setUint32(length-8,raw.length*8,true);
 const shifts=[7,12,17,22,5,9,14,20,4,11,16,23,6,10,15,21],constants=Array.from({length:64},(_,i)=>Math.floor(Math.abs(Math.sin(i+1))*2**32));let state=[0x67452301,0xefcdab89,0x98badcfe,0x10325476];
 for(let offset=0;offset<length;offset+=64){let [a,b,c,d]=state;for(let i=0;i<64;i++){let f:number,g:number;if(i<16){f=(b&c)|(~b&d);g=i;}else if(i<32){f=(d&b)|(~d&c);g=(5*i+1)%16;}else if(i<48){f=b^c^d;g=(3*i+5)%16;}else{f=c^(b|~d);g=7*i%16;}const sum=(a+f+constants[i]+view.getUint32(offset+g*4,true))|0,shift=shifts[Math.floor(i/16)*4+i%4];[a,b,c,d]=[d,(b+((sum<<shift)|(sum>>>(32-shift))))|0,b,c];}state=state.map((value,i)=>(value+[a,b,c,d][i])|0);}
 return state.flatMap(word=>Array.from({length:4},(_,i)=>((word>>>(i*8))&255).toString(16).padStart(2,'0'))).join('');
}
