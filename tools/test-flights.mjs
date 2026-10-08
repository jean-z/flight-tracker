// 数据层回归测试：node tools/test-flights.mjs
// 联网时验证 ADS-B 拉取与字段完整性；离线时验证模拟器降级。
import { fetchAllPlanes, HUBS } from '../src/data/adsb.js';

let pass = 0, fail = 0;
const check = (name, cond) => { cond ? pass++ : fail++; console.log(`${cond ? '✅' : '❌'} ${name}`); };

check('兴趣区 ≥ 8 个（全球覆盖）', HUBS.length >= 8);

const { planes, source } = await fetchAllPlanes();
console.log(`数据源: ${source}，航班数: ${planes.size}`);
check('返回非空航班表', planes.size > 0);
check('数据源标识合法（live 或 demo）', source === 'live' || source === 'demo');

let okFields = 0, okPos = 0;
for (const p of planes.values()) {
  if (p.callsign !== undefined && p.altFt !== undefined && p.gs !== undefined) okFields++;
  if (p.lat >= -90 && p.lat <= 90 && p.lon >= -180 && p.lon <= 180) okPos++;
}
check('全部航班字段完整', okFields === planes.size);
check('全部航班坐标在范围内', okPos === planes.size);

// 模拟器自检：字段完整 + 航班号非空
let simOk = 0;
for (const p of planes.values()) if (p.callsign) simOk++;
check('每架航班有呼号', simOk === planes.size);

// 高度分布合理性（巡航占多数）
let cruise = 0;
for (const p of planes.values()) if (p.altFt > 20000) cruise++;
console.log(`巡航高度(>20k ft)占比: ${(cruise / planes.size * 100).toFixed(0)}%`);
check('巡航高度占比 > 20%', cruise / planes.size > 0.2);

console.log(`\n${pass} 通过 / ${fail} 失败`);
process.exit(fail ? 1 : 0);
