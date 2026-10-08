# 苍穹之眼 · Flight Tracker

基于 **ADS-B 开放数据**（[adsb.lol](https://adsb.lol)，免费无 key）的全球实时航班可视化：
8 个枢纽区的在航飞机以光点呈现在三维地球上，颜色编码高度（低空暖黄 → 巡航青白），
每 6 秒刷新。网络不可达时自动降级为演示数据（界面明确标注）。

"太空科普系列"第九弹——第一个接入**真实实时数据流**的项目。

## 运行

```bash
npm install --registry=https://registry.npmmirror.com
npm run dev     # → http://localhost:5181
npm test        # 数据层回归测试（7 项；离线跑走模拟器断言）
```

## 功能

- **实时航班**：华东/华北/华南/西欧/北美东西/东南亚/中东 8 枢纽区，去重后数百架在航
- **高度色标**：0–40k ft 暖黄→青白渐变，爬升降落一目了然
- **3D 地球**：Three.js + Natural Earth 110m 国界线 + 大气辉光 + 星空
- **视角预设**：华东/华北/欧洲/北美/全球
- **自动降级**：API 超时/不可达 → 12 条模拟航线（真实航班号/机型），HUD 标注"演示数据"

## 数据与限流

- adsb.lol v2 API：`/v2/lat/{lat}/lon/{lon}/dist/{nm}`，CORS 全开，浏览器直连
- 免费档限频约 1 req/s：本项目 8 区并行 × 每 6 秒一轮 ≈ 1.3 req/s，贴边但可用；
  若遇 429 可把 `HUBS` 减到 4 个或拉长轮询间隔（`App.jsx` 里的 `setInterval`）
- 数据延迟约 5–15 秒（全球接收站网络的固有延迟）

## 架构

```
src/
  data/adsb.js            # 拉取/去重/限流/模拟器（纯函数 + Map）
  components/FlightGlobe.jsx  # Three.js 球面渲染（点云按高度着色）
  App.jsx                 # 轮询循环 + HUD
```

## 已知边界

- 光点无尾迹（v2：保留最近 N 帧位置画航迹线）
- 不支持点选航班查看呼号/机型（v2：raycaster 拾取 + 详情卡）
- 高度视觉夸张约 1.8%（否则 4 万英尺在地球尺度上不可见）
