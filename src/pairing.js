export function selectPairs(queue, now) {
  const ordered = [...queue].sort((a,b)=>a.joined-b.joined||a.id-b.id);
  const used = new Set(), pairs = [];
  for (const a of ordered) {
    if (used.has(a.id)) continue;
    const tolerance = Math.min(600,100+Math.floor(Math.max(0,now-a.joined)/30000)*50);
    let b, closestGap = Infinity;
    for (const candidate of ordered) {
      if (candidate.id === a.id || used.has(candidate.id)) continue;
      const gap = Math.abs(a.rating - candidate.rating);
      if (gap <= tolerance && gap < closestGap) {
        b = candidate;
        closestGap = gap;
      }
    }
    if (!b) continue;
    used.add(a.id); used.add(b.id); pairs.push({a,b});
  }
  return pairs;
}
