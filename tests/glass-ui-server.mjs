/** Controlled owner-authentication fixture. This test host cannot make external network requests. */
import { chromium } from 'playwright';
import { startStudio } from '../dist/studio/server.js';
const origin = 'https://owner-fixture.example';
const credential = 'fixture-only-automation-credential';
const html = (body) => new Response(body, {headers:{'content-type':'text/html; charset=utf-8'}});
const app = await startStudio({port:Number(process.env.TEST_PORT),directory:process.env.TEST_DATA_DIR,open:false,hooks:{
  fetchImpl:async (input, init) => {
    const url = new URL(String(input));
    if (url.origin !== origin) throw new Error('Only the controlled owner fixture is available.');
    if (new Headers(init?.headers).get('x-vercel-protection-bypass') !== credential) return new Response('<title>Vercel Security Checkpoint</title>',{status:429,headers:{'content-type':'text/html','x-vercel-mitigated':'challenge'}});
    if (url.pathname === '/robots.txt') return new Response('User-agent: *\nAllow: /');
    if (url.pathname === '/') return html('<!doctype html><html><head><title>Owner fixture</title></head><body><main id="app"></main><script src="/app.js"></script></body></html>');
    if (url.pathname === '/app.js') return new Response('fetch("/api/data").then(r=>r.json()).then(data=>{document.title="Authorized JavaScript site";document.querySelector("#app").innerHTML="<h1>Owned learning site</h1><p>Rendered price: "+data.price+"</p><a href=/guide>Guide</a>";});', {headers:{'content-type':'application/javascript'}});
    if (url.pathname === '/api/data') return new Response(JSON.stringify({price:24,echo:credential}),{headers:{'content-type':'application/json'}});
    if (url.pathname === '/guide') return html('<h1>Learning guide</h1><p>Tested owner-authorized crawling.</p><a href="/">Home</a>');
    return new Response('Not found',{status:404});
  },
  browserFactory:options=>chromium.launch({...options,...(process.env.CHROMIUM_EXECUTABLE?{executablePath:process.env.CHROMIUM_EXECUTABLE}:{}),...(process.platform==='linux'&&process.getuid?.()===0?{chromiumSandbox:false}:{})})
}});
console.log(app.address);
for(const signal of ['SIGINT','SIGTERM'])process.on(signal,()=>void app.close().then(()=>process.exit(0)));
