/** A real local HTTP fixture for the visual workspace. All artwork and content are demonstrations. */
import { createServer } from 'node:http';
import { once } from 'node:events';
import { deflateSync } from 'node:zlib';

const artworkNames = ['coast', 'dunes', 'forest', 'alpine', 'ocean', 'sunset', 'river', 'night'];
const artworks = new Map<string, Buffer>();
function crc32(data: Buffer): number {
  let value = 0xffffffff;
  for (const byte of data) { value ^= byte; for (let bit = 0; bit < 8; bit++) value = value & 1 ? (value >>> 1) ^ 0xedb88320 : value >>> 1; }
  return (value ^ 0xffffffff) >>> 0;
}
function chunk(type: string, data: Buffer): Buffer {
  const name = Buffer.from(type); const length = Buffer.alloc(4); length.writeUInt32BE(data.length);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(Buffer.concat([name, data])));
  return Buffer.concat([length, name, data, crc]);
}
/** Known local raster fixtures can be viewed after the demo HTTP server has closed. */
export function demoArtwork(path: string): Buffer | undefined {
  const match = /^\/media\/([a-z]+)\.png$/.exec(path);
  const index = artworkNames.indexOf(match?.[1] ?? '');
  if (index < 0) return undefined;
  const cached = artworks.get(path); if (cached) return cached;
  const width = 480, height = 300;
  const palettes = [[37,130,167],[198,142,84],[41,125,106],[79,113,159],[35,120,168],[199,112,122],[68,141,132],[69,71,124]];
  const [r=0,g=0,b=0] = palettes[index]!;
  const raw = Buffer.alloc((width * 3 + 1) * height);
  for (let y=0;y<height;y++) for (let x=0;x<width;x++) {
    const at = y*(width*3+1)+1+x*3; const wave = Math.sin(x/89+index)*22+Math.cos(x/52)*13;
    const layer = y > 210+wave ? .48 : y > 163+wave ? .68 : y > 120+wave ? .84 : 1.17-y/900;
    const sun = (x-(355-index*19))**2+(y-65)**2 < 29**2;
    raw[at] = Math.min(255, sun ? 246 : r*layer+28); raw[at+1]=Math.min(255,sun?220:g*layer+27);raw[at+2]=Math.min(255,sun?173:b*layer+24);
  }
  const header=Buffer.alloc(13); header.writeUInt32BE(width);header.writeUInt32BE(height,4);header[8]=8;header[9]=2;
  const bytes=Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),chunk('IHDR',header),chunk('IDAT',deflateSync(raw)),chunk('IEND',Buffer.alloc(0))]);
  artworks.set(path,bytes);return bytes;
}

export async function startAtlasDemoSite() {
  const groups: Record<string,string[]> = {
    guides: ['start','crawling','images','reports','deployment'],
    journal: ['field-notes','design','performance','accessibility','reliability'],
    products: ['explorer','collector','lens','notebook','studio'],
    research: ['networks','navigation','content','patterns','experiments'],
    company: ['about','team','contact','careers','values'],
    gallery: ['coast','forest','alpine','ocean','sunset'],
  };
  const pages = ['/', ...Object.entries(groups).flatMap(([group,children])=>[`/${group}`,...children.map(child=>`/${group}/${child}`)])];
  const title=(path:string)=>path==='/'?'Fieldnotes · Visual atlas':path.split('/').filter(Boolean).map(s=>s[0]!.toUpperCase()+s.slice(1).replaceAll('-',' ')).join(' / ');
  const server=createServer((req,res)=>{
    const path=new URL(req.url??'/','http://local').pathname;
    if(path==='/robots.txt'){res.writeHead(200,{'Content-Type':'text/plain'});res.end('User-agent: *\nDisallow: /private\n');return;}
    const image=demoArtwork(path);if(image){res.writeHead(200,{'Content-Type':'image/png'});res.end(image);return;}
    if(path==='/start'){res.writeHead(302,{Location:'/guides/start'});res.end();return;}
    const index=pages.indexOf(path);
    if(index<0){res.writeHead(404,{'Content-Type':'text/html'});res.end('<h1>Demonstration: missing page</h1>');return;}
    const group=path.split('/')[1]??'';
    const targets=[...new Set(['/',...Object.keys(groups).map(g=>`/${g}`),...(groups[group]??[]).map(child=>`/${group}/${child}`),pages[(index+7)%pages.length]!,pages[(index+11)%pages.length]!])];
    if(path==='/research')targets.push('/missing-reference','/private');
    if(path==='/')targets.push('/start');
    const art=artworkNames[index%artworkNames.length]!,art2=artworkNames[(index+3)%artworkNames.length]!;
    const label=title(path);const description='A locally served demonstration page for exploring links, media and site structure. Not a real company or a public crawl.';
    res.writeHead(200,{'Content-Type':'text/html; charset=utf-8'});
    res.end(`<!doctype html><html lang="en"><head><title>${label}</title>${path==='/company/careers'?'':`<meta name="description" content="${description}">`}<link rel="stylesheet" href="/assets/site.css"><script src="/assets/site.js" defer></script></head><body><header><h1>${label}</h1><nav>${targets.map(link=>`<a href="${link}">${title(link)}</a>`).join(' ')}</nav></header><main><p>${description}</p><h2 id="overview">Overview</h2><p>Compare URL paths with actual hyperlinks. Browse images and inspect the pages that reference them.</p><figure><img src="/media/${art}.png" ${(index===5||index===12)?'':`alt="${art} — locally generated demonstration artwork"`} width="480" height="300"><figcaption>Demo artwork: ${art}</figcaption></figure><h2 id="details">Details</h2><h3>Related resources</h3><img data-src="/media/${art2}.png" alt="" loading="lazy" width="480" height="300"><a href="https://example.com/" rel="nofollow">External example (not crawled)</a>${path==='/guides/reports'?'<a href="/files/guide.pdf">Download guide</a>':''}${path==='/company/contact'?'<form action="/contact/send" method="post"><input name="name"><input type="email" name="email"><textarea name="message"></textarea><button type="submit">Send</button></form>':''}${path==='/gallery'?'<video src="/media/tour.mp4" poster="/media/coast.png"></video><audio src="/media/intro.ogg"></audio><iframe src="https://example.com/embed" title="Demo frame"></iframe>':''}</main></body></html>`);
  });
  server.listen(0,'127.0.0.1');await once(server,'listening');
  return {url:`http://127.0.0.1:${(server.address() as {port:number}).port}/`,close:()=>{server.closeAllConnections();server.close();}};
}
