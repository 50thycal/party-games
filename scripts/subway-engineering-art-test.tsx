import assert from "node:assert/strict";
import { renderToStaticMarkup } from "react-dom/server";
import { ENGINEERING_CARDS } from "../src/games/subway/config";
import { ENGINEERING_DIAGRAMS, EngineeringArt } from "../src/games/subway/EngineeringArt";
import { EngineeringCardFace } from "../src/games/subway/CardArt";

assert.equal(ENGINEERING_CARDS.length,21);
assert.deepEqual(Object.keys(ENGINEERING_DIAGRAMS).sort(),ENGINEERING_CARDS.map(c=>c.id).sort());
const drawings = new Set<string>();
for (const card of ENGINEERING_CARDS) {
  const d = ENGINEERING_DIAGRAMS[card.id];
  const colored = new Set(d.lines.filter(l=>!l.support).map(l=>l.color));
  if (card.tags.includes("Single Line")) assert.equal(colored.size,1,`${card.id}: single qualifying color`);
  if (card.tags.includes("Connected Network")) assert.ok(colored.size>=2,`${card.id}: multiple network colors`);
  // No duplicated/stacked stations; all station centers sit inside the picture.
  const points = d.lines.flatMap((l,line)=>l.points.map(p=>({p,line})));
  assert.equal(new Set(points.map(({p})=>p.join(","))).size,points.length,`${card.id}: no stacked stations`);
  for (const {p:[x,y]} of points) assert.ok(x>=5&&x<=235&&y>=20&&y<=166,`${card.id}: station bounds`);
  for (const area of d.areas??[]) {
    if (!area.size) continue;
    // The label occupies the top-left reserved 22x20 area. Segments may not cross it.
    const box = {left:area.x+3,right:area.x+23,top:area.y+3,bottom:area.y+21};
    for (const l of d.lines) for (let j=1;j<l.points.length;j++) {
      const a=l.points[j-1],b=l.points[j];
      for(let t=0;t<=100;t++) {
        const x=a[0]+(b[0]-a[0])*t/100,y=a[1]+(b[1]-a[1])*t/100;
        assert.ok(!(x>box.left-3&&x<box.right+3&&y>box.top-3&&y<box.bottom+3),`${card.id}: label clear of route`);
      }
    }
  }
  for (const marker of d.ends??[]) assert.ok(d.lines.some(l=>[l.points[0],l.points.at(-1)!].some(p=>p[0]===marker.at[0]&&p[1]===marker.at[1])),`${card.id}: marked end belongs to line end`);
  if(card.tags.includes("Complete Line")) assert.deepEqual(d.ends?.map(e=>e.kind).sort(),["finish","start"],`${card.id}: completion markers`);
  // Whole transfer components, using the diagram's orthogonal one-hole spacing.
  const parent=points.map((_,i)=>i);
  const root=(i:number):number=>parent[i]===i?i:root(parent[i]);
  for(let i=0;i<points.length;i++)for(let j=i+1;j<points.length;j++){
    const a=points[i],b=points[j];
    if(a.line!==b.line && ((a.p[0]===b.p[0]&&Math.abs(a.p[1]-b.p[1])===16)||(a.p[1]===b.p[1]&&Math.abs(a.p[0]-b.p[0])===16))) parent[root(i)]=root(j);
  }
  const groups=new Map<number,number[]>();
  points.forEach((_,i)=>groups.set(root(i),[...(groups.get(root(i))??[]),i]));
  const transfers=Array.from(groups.values()).filter(g=>g.length>1);
  assert.equal(transfers.length,d.transfers?.length??0,`${card.id}: drawn transfers match physical adjacency`);
  for(const group of transfers) assert.ok(d.transfers?.some(t=>group.every(i=>{const [x,y]=points[i].p;return x>t.x&&x<t.x+t.w&&y>t.y&&y<t.y+t.h;})),`${card.id}: outline encloses entire transfer`);
  // Every network is connected by its pictured transfers, not by mere crossings.
  if(card.tags.includes("Connected Network")){
    const reached=new Set([0]);
    for(let pass=0;pass<d.lines.length;pass++)for(const group of transfers){
      const lines=group.map(i=>points[i].line);
      if(lines.some(l=>reached.has(l)))lines.forEach(l=>reached.add(l));
    }
    assert.equal(reached.size,d.lines.length,`${card.id}: connected network`);
  }
  const svg=renderToStaticMarkup(<EngineeringArt id={card.id}/>);
  assert.ok(svg.includes('role="img"')&&svg.includes("<title")&&svg.includes("<desc"));
  drawings.add(JSON.stringify(d.lines));
  for(const state of ["idle","selected","committed","met","missed"] as const){
    const html=renderToStaticMarkup(<EngineeringCardFace card={card} color="#ff00ff" state={state} compact onClick={()=>{}} disabled footer={<button>Footer action</button>}/>);
    assert.ok(html.includes(`data-engineering-art="${card.id}"`));
    assert.ok(html.includes("Rules &amp; symbols")&&html.includes("<details"));
    assert.ok(html.includes(card.requirement.replaceAll("&","&amp;")),`${card.id}: full rule preserved`);
    assert.ok(html.includes(`${card.vp} <span`),`${card.id}: VP unchanged`);
    assert.ok(html.includes(`>${card.category}</p>`),`${card.id}: category alone`);
    assert.ok(!/<button[^>]*>(?:(?!<\/button>)[\s\S])*<(?:button|details|summary)/.test(html),`${card.id}: no nested interactive controls`);
    assert.ok(!html.includes("#ff00ff"),`${card.id}: company color cannot corrupt diagram scope`);
  }
}
assert.equal(drawings.size,21,"all goals have distinct diagrams");
assert.deepEqual(ENGINEERING_DIAGRAMS["shared-stations"].lines.map(l=>l.color),["#2366a5","#c3413d"]);
assert.equal(ENGINEERING_DIAGRAMS["citywide-coverage"].areas?.length,8);
const presence=ENGINEERING_DIAGRAMS["large-presence"], area=presence.areas![0];
assert.equal(presence.lines.flatMap(l=>l.points).filter(([x,y])=>x>area.x&&x<area.x+area.w&&y>area.y&&y<area.y+area.h).length,3);
console.log("Engineering art: 21 diagrams, topology/colors/labels/end markers and 105 card-state renders passed.");
