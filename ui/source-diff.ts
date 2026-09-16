/** Bounded, dependency-free source comparison. It returns plain text, never markup.
 * Splitting between tags makes minified documents readable; this is not a DOM edit script.
 */
export interface SourceLine { kind: 'same' | 'added' | 'removed'; text: string; }
export function sourceDiff(raw: string, rendered: string): { lines: SourceLine[]; truncated: boolean } {
  const split = (text: string) => text.slice(0, 120000).replace(/>\s*</g, '>\n<').split(/\r?\n/).map(line => line.slice(0, 1200));
  const left = split(raw), right = split(rendered);
  const truncated = raw.length > 120000 || rendered.length > 120000 || left.length > 300 || right.length > 300 || raw.split(/\r?\n/).some(l=>l.length>1200) || rendered.split(/\r?\n/).some(l=>l.length>1200);
  const a = left.slice(0,300), b = right.slice(0,300);
  // The 301 x 301 matrix is bounded even for multi-megabyte captured sources.
  const lengths = Array.from({length:a.length+1},()=>new Uint16Array(b.length+1));
  for (let i=a.length-1;i>=0;i--) for(let j=b.length-1;j>=0;j--) lengths[i]![j] = a[i]===b[j] ? 1+lengths[i+1]![j+1]! : Math.max(lengths[i+1]![j]!,lengths[i]![j+1]!);
  const lines: SourceLine[]=[];let i=0,j=0;
  while(i<a.length||j<b.length) {
    if(i<a.length&&j<b.length&&a[i]===b[j]) {lines.push({kind:'same',text:a[i]!});i++;j++;}
    else if(j<b.length&&(i===a.length||lengths[i]![j+1]!>=lengths[i+1]![j]!)) {lines.push({kind:'added',text:b[j]!});j++;}
    else {lines.push({kind:'removed',text:a[i]!});i++;}
  }
  return {lines,truncated};
}
