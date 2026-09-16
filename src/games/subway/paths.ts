import type {Point, PlayerLine, RouteNode} from './config';

export const pathLength=(points:Point[])=>points.slice(1).reduce((n,p,i)=>n+Math.hypot(p.x-points[i].x,p.y-points[i].y),0);
export const incomingPath=(a:Point,b:RouteNode):Point[]=>[a,...(b.via??[]),b];
export const pathLegs=(points:Point[]):[Point,Point][]=>points.slice(1).map((p,i)=>[points[i],p]);
/** Physical track includes partial work; only route[] entries are scoring pegs. */
export function lineLegs(line:Pick<PlayerLine,'route'|'work'>):[Point,Point][] {
  const legs=line.route.slice(1).flatMap((p,i)=>pathLegs(incomingPath(line.route[i],p)));
  if(line.work?.length&&line.route.length) legs.push(...pathLegs([line.route.at(-1)!,...line.work]));
  return legs;
}
export const constructionTip=(line:PlayerLine)=>line.work?.at(-1)??line.route.at(-1);
