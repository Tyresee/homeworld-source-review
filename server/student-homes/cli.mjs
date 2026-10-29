import {resolve} from 'node:path';
import {createStudentHomesService} from './app.mjs';

const args=process.argv.slice(2),options={};
for(let i=0;i<args.length;i++){
  const arg=args[i];
  if(arg==='--dist'){options.isDist=true;continue;}
  if(!['--port','--data-dir','--platform-origin','--public-origin'].includes(arg)||!args[i+1]||args[i+1].startsWith('--'))throw new Error(`Unknown or incomplete option: ${arg}`);
  options[arg.slice(2)]=args[++i];
}
const port=Number(options.port??process.env.HOMEWORLD_HOME_PORT??18801);
const dataDir=options['data-dir']??process.env.HOMEWORLD_HOME_DATA_DIR;
const platformOrigin=options['platform-origin']??process.env.HOMEWORLD_PLATFORM_ORIGIN;
const publicOrigin=options['public-origin']??process.env.HOMEWORLD_PUBLIC_ORIGIN;
if(!Number.isInteger(port)||port<1||port>65535)throw new Error('Invalid service port.');
if(!dataDir||!platformOrigin||!publicOrigin)throw new Error('Explicit data-dir, platform-origin and public-origin required (CLI flags or HOMEWORLD_* env). No demo defaults.');
const service=await createStudentHomesService({platformOrigin,publicOrigin,dataDir:resolve(dataDir),isDist:!!options.isDist});
try{await new Promise((resolve,reject)=>{service.server.once('error',reject);service.server.listen(port,'127.0.0.1',resolve);});}
catch(error){await service.close();throw error;}
console.log(`Homeworld student homes listening on 127.0.0.1:${port}; platform auth required; no local wallet.`);
let exiting=false;
for(const signal of ['SIGINT','SIGTERM'])process.on(signal,async()=>{if(exiting)return;exiting=true;try{await service.close();process.exitCode=0;}catch{process.exitCode=1;}});
