// 数据层：ADS-B 拉取（adsb.lol 免费无 key）+ 限流 + 离线降级模拟器
//
// adsb.lol v2 API：GET /v2/lat/{lat}/lon/{lon}/dist/{nm} → { ac: [...], now }
// 限频：免费档约 1 次/秒（官方建议 ≤1/s）。拉取策略：
//   每 5 秒轮询一个"兴趣点集合"（多城市网格），合并去重。
// 浏览器直连可行（API 带 CORS *）。若网络不可达 → 降级为模拟器
// （按真实航班号/机型表生成的假航班，界面明确标注"演示数据"）。

export const HUBS = [
  { zh: '华东', lat: 30.5, lon: 121.5, dist: 250 },
  { zh: '华北', lat: 39.9, lon: 116.5, dist: 250 },
  { zh: '华南', lat: 23.1, lon: 113.3, dist: 220 },
  { zh: '西欧', lat: 50.5, lon: 4.5, dist: 260 },
  { zh: '北美东', lat: 40.6, lon: -74.0, dist: 250 },
  { zh: '北美西', lat: 34.0, lon: -118.3, dist: 240 },
  { zh: '东南亚', lat: 1.35, lon: 103.9, dist: 220 },
  { zh: '中东', lat: 25.25, lon: 55.36, dist: 230 },
];

const API = (h) => `https://api.adsb.lol/v2/lat/${h.lat}/lon/${h.lon}/dist/${h.dist}`;

/** 拉取一个兴趣点（失败返回空数组） */
async function fetchHub(hub) {
  try {
    const r = await fetch(API(hub), { signal: AbortSignal.timeout(8000) });
    if (!r.ok) return [];
    const j = await r.json();
    return (j.ac ?? []).filter((a) => a.lat != null && a.lon != null);
  } catch {
    return [];
  }
}

/** 拉取全部兴趣点（并行 + 去重），返回 { planes: Map<hex, plane>, source: 'live'|'demo' } */
export async function fetchAllPlanes() {
  const lists = await Promise.all(HUBS.map(fetchHub));
  const planes = new Map();
  let live = 0;
  for (const list of lists) {
    if (list.length) live++;
    for (const a of list) {
      planes.set(a.hex, {
        hex: a.hex,
        callsign: (a.flight ?? '').trim(),
        lat: a.lat,
        lon: a.lon,
        altFt: a.alt_baro === 'ground' ? 0 : (a.alt_baro ?? 0),
        gs: a.gs ?? 0,            // 地速 kt
        track: a.track ?? 0,      // 航向
        type: a.t ?? '',          // 机型
        reg: a.r ?? '',
        ts: Date.now(),
      });
    }
  }
  if (planes.size === 0) return { planes: simulatePlanes(), source: 'demo' };
  return { planes, source: live > 0 ? 'live' : 'demo' };
}

// ── 模拟器（离线降级 / 开发调试）────────────────────────────────────

const FAKE_ROUTES = [
  { cs: 'CSZ9942', t: 'B738', from: [121.8, 29.9], to: [113.3, 23.1] },
  { cs: 'CCA1501', t: 'A333', from: [116.6, 40.1], to: [121.8, 29.9] },
  { cs: 'CES5107', t: 'A359', from: [121.5, 31.2], to: [103.9, 1.3] },
  { cs: 'KLM897', t: 'B789', from: [4.7, 52.3], to: [121.5, 31.2] },
  { cs: 'UAL857', t: 'B77W', from: [-122.4, 37.6], to: [121.5, 31.2] },
  { cs: 'ANA935', t: 'B788', from: [139.8, 35.6], to: [121.8, 29.9] },
  { cs: 'QFA8', t: 'A388', from: [151.2, -33.9], to: [103.9, 1.3] },
  { cs: 'SIA836', t: 'A359', from: [103.9, 1.3], to: [116.6, 40.1] },
  { cs: 'BAW15', t: 'B777', from: [-0.5, 51.5], to: [139.8, 35.6] },
  { cs: 'AAL100', t: 'A321', from: [-74.0, 40.6], to: [-122.4, 37.6] },
  { cs: 'CSN399', t: 'B789', from: [113.3, 23.1], to: [4.7, 52.3] },
  { cs: 'CPA341', t: 'B773', from: [114.2, 22.3], to: [121.5, 31.2] },
];

function simulatePlanes() {
  const t = Date.now() / 1000;
  const map = new Map();
  FAKE_ROUTES.forEach((r, i) => {
    // 每架按自身周期在航线上循环（周期 60~90 分钟）
    const period = 3600 + i * 150;
    const k = ((t % period) / period + i * 0.13) % 1;
    const lat = r.from[1] + (r.to[1] - r.from[1]) * k;
    const lon = r.from[0] + (r.to[0] - r.from[0]) * k;
    map.set('SIM' + i, {
      hex: 'SIM' + i,
      callsign: r.cs,
      lat, lon,
      altFt: Math.max(2000, Math.round(34000 + 9000 * Math.sin(i * 1.7) * Math.cos(i * 0.6))),
      gs: 420 + Math.round(60 * Math.sin(i)),
      track: (Math.atan2(r.to[0] - r.from[0], r.to[1] - r.from[1]) * 180 / Math.PI + 360) % 360,
      type: r.t,
      reg: '',
      ts: Date.now(),
    });
  });
  return map;
}
