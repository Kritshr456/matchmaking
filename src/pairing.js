export function selectPairs(queue, now) {
  const ordered = [...queue].sort((a,b)=>a.joined-b.joined||a.id-b.id);
  const used = new Set(), pairs = [];
  for (const a of ordered) {
    if (used.has(a.id)) continue;
    const tolerance = Math.min(600,100+Math.floor(Math.max(0,now-a.joined)/30000)*50);
    const b = ordered.filter(p=>p.id!==a.id&&!used.has(p.id)&&Math.abs(a.rating-p.rating)<=tolerance)
      .sort((x,y)=>Math.abs(a.rating-x.rating)-Math.abs(a.rating-y.rating)||x.joined-y.joined||x.id-y.id)[0];
    if (!b) continue;
    used.add(a.id); used.add(b.id); pairs.push({a,b});
  }
  return pairs;
}
