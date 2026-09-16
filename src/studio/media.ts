/** Opt-in image previews: only recorded URLs, checked public destinations, raster bytes, bounded work. */
import { isIP } from 'node:net';
import { publicFetch, isPublicAddress } from './network.js';
import { demoArtwork } from './atlas-demo.js';
import type { Job } from './jobs.js';

const MAX_BYTES = 4 * 1024 * 1024;
export function recordedImage(job: Job, url: string): boolean {
  return Object.values(job.result?.pages ?? {}).some(p => p.image_urls.includes(url) || p.elements?.images.some(image => image.candidates.includes(url)));
}
function validURL(value: string): URL {
  const url = new URL(value);
  const host = url.hostname.replace(/^\[|\]$/g,'');
  if (!['http:','https:'].includes(url.protocol) || url.username || url.password || (isIP(host) && !isPublicAddress(host))) throw new Error('Image preview target must be a public HTTP(S) URL without credentials.');
  return url;
}
/** Declared content type is insufficient: reject SVG/HTML and require a raster signature. */
export function rasterType(data: Buffer): string | undefined {
  if(data.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])))return 'image/png';
  if(data[0]===255&&data[1]===216&&data[2]===255)return 'image/jpeg';
  if(['GIF87a','GIF89a'].includes(data.subarray(0,6).toString()))return 'image/gif';
  if(data.subarray(0,4).toString()==='RIFF'&&data.subarray(8,12).toString()==='WEBP')return 'image/webp';
  if(data.subarray(4,8).toString()==='ftyp'&&/avif|avis/.test(data.subarray(8,40).toString()))return 'image/avif';
  return undefined;
}
export class MediaPreviews {
  private active=0;
  async load(job:Job, value:string, fetcher:typeof fetch=publicFetch):Promise<{bytes:Buffer;type:string}> {
    if(!recordedImage(job,value))throw new Error('This image URL was not recorded in this crawl.');
    // Demo artwork is trusted, generated locally and tied to the saved demo origin.
    if(job.demo){
      const url=new URL(value);
      const bytes=url.origin===new URL(job.url).origin?demoArtwork(url.pathname):undefined;
      if(!bytes)throw new Error('No raster preview is available for this demonstration image.');
      return {bytes,type:'image/png'};
    }
    if(this.active>=4)throw new Error('Image preview limit reached. Try again after other previews finish.');
    this.active++;
    const controller=new AbortController();const timer=setTimeout(()=>controller.abort(new Error('Image preview timed out.')),10000);
    try{
      let url=validURL(value);
      for(let redirects=0;redirects<=3;redirects++){
        const response=await fetcher(url,{redirect:'manual',signal:controller.signal,headers:{Accept:'image/png,image/jpeg,image/webp,image/gif,image/avif','User-Agent':'CrawlerStudio/4.0 ImagePreview'}});
        if([301,302,303,307,308].includes(response.status)){
          await response.body?.cancel();const location=response.headers.get('location');
          if(!location||redirects===3)throw new Error('Image preview exceeded its redirect limit.');
          url=validURL(new URL(location,url).href);continue;
        }
        if(!response.ok){await response.body?.cancel();throw new Error(`Image preview returned HTTP ${response.status}.`);}
        if(!/^image\/(png|jpeg|webp|gif|avif)(?:;|$)/i.test(response.headers.get('content-type')??'')) {await response.body?.cancel();throw new Error('Only raster image previews are allowed; SVG and other content remain URL-only.');}
        if(Number(response.headers.get('content-length')??0)>MAX_BYTES){await response.body?.cancel();throw new Error('Image preview exceeds 4 MiB.');}
        if(!response.body)throw new Error('Image preview was empty.');
        const reader=response.body.getReader();const chunks:Buffer[]=[];let size=0;
        try{while(true){const {done,value:part}=await reader.read();if(done)break;size+=part.byteLength;if(size>MAX_BYTES)throw new Error('Image preview exceeds 4 MiB.');chunks.push(Buffer.from(part));}}
        catch(error){await reader.cancel().catch(()=>{});throw error;}finally{reader.releaseLock();}
        const bytes=Buffer.concat(chunks);const type=rasterType(bytes);
        if(!type)throw new Error('The response is not a supported raster image.');
        return {bytes,type};
      }
      throw new Error('Image preview could not be loaded.');
    }finally{clearTimeout(timer);this.active--;}
  }
}
