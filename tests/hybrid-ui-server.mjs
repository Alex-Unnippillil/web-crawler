/** Controlled local-fixture host for GUI acceptance tests. Never used by the launcher.
 * Non-demo public targets are rejected; the root-only sandbox override is for CI containers.
 */
import { chromium } from 'playwright';
import { startStudio } from '../dist/studio/server.js';
const app = await startStudio({port:Number(process.env.TEST_PORT ?? 4321),directory:process.env.TEST_DATA_DIR,open:false,
  hooks:{fetchImpl:async()=>{throw new Error('This acceptance-test host only accepts built-in demos.');},
    browserFactory:options=>chromium.launch({...options,
      ...(process.env.CHROMIUM_EXECUTABLE?{executablePath:process.env.CHROMIUM_EXECUTABLE}:{}),
      ...(process.platform==='linux'&&process.getuid?.()===0?{chromiumSandbox:false}:{})})}});
console.log(app.address);
process.on('SIGTERM',()=>void app.close().then(()=>process.exit(0)));
process.on('SIGINT',()=>void app.close().then(()=>process.exit(0)));
