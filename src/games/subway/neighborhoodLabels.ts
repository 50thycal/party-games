import type { Station } from './config';

/** Find a rectangular label space wholly inside the actual polyomino, not its
 * bounding box (which may include a different neighborhood). Coordinates in pegs. */
export function neighborhoodLabel(area:Station,zoom:number) {
  const cells=area.cells??[area],has=new Set(cells.map(p=>`${p.x},${p.y}`));
  const words=area.name.split(' ');
  let best={x:cells[0].x-.43,y:cells[0].y-.43,width:.86,height:.86,font:10,lines:[area.name],lineYs:[cells[0].y-.25],sizeY:cells[0].y+.32};
  let bestScore=-1;
  for(const a of cells)for(const b of cells){
    if(b.x<a.x||b.y<a.y)continue;
    let contained=true;
    for(let x=a.x;x<=b.x;x++)for(let y=a.y;y<=b.y;y++)if(!has.has(`${x},${y}`))contained=false;
    if(!contained)continue;
    const width=b.x-a.x+.86,height=b.y-a.y+.86;
    for(const lines of [words,[area.name]]) {
      const rows=b.y-a.y+1;
      // Put names between peg rows. A one-row strip uses text above the holes
      // and its size below, keeping the empty holes and actual pegs legible.
      if(lines.length>1&&rows<=lines.length)continue;
      const font=Math.min(20/Math.max(.1,zoom),rows===1?22:38,width*82/(Math.max(...lines.map(w=>w.length))*.67+1));
      const first=rows===1?a.y-.25:a.y+.5;
      const lineYs=lines.map((_,i)=>first+i-(rows===1?0:font*.18/82));
      const sizeY=rows===1?a.y+.32:first+lines.length-1+font*.7/82;
      const score=font-(b.y-a.y)*.01;
      if(score>bestScore){bestScore=score;best={x:a.x-.43,y:a.y-.43,width,height,font,lines,lineYs,sizeY};}
    }
  }
  return best;
}
