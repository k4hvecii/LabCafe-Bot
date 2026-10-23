import 'dotenv/config';
import {startObserver} from '../observability/observer.js';
void startObserver().then(server=>{const stop=()=>{server.close();server.closeAllConnections();};process.once('SIGINT',stop);process.once('SIGTERM',stop);}).catch(()=>{console.error(JSON.stringify({time:new Date().toISOString(),level:'error',module:'Observer',message:'Observer configuration or startup failed.'}));process.exitCode=1;});
