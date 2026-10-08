import { useEffect, useRef, useState } from 'react'
import FlightGlobe from './components/FlightGlobe.jsx'
import { fetchAllPlanes, HUBS } from './data/adsb.js'

const VIEWS = [['华东', 30.5, 121.5], ['华北', 39.9, 116.5], ['欧洲', 50.5, 4.5], ['北美', 40, -95], ['全球', 20, 105, 420]]

export default function App() {
  const globeRef = useRef(null)
  const planesRef = useRef(new Map())
  const [source, setSource] = useState('…')
  const [count, setCount] = useState(0)
  const [alive, setAlive] = useState(0)

  /* 数据轮询：每 6 秒拉一轮 8 个兴趣区 */
  useEffect(() => {
    let stop = false
    const tick = async () => {
      const { planes, source } = await fetchAllPlanes()
      if (stop) return
      // 保留上一轮位置做简单"航迹感"：旧数据与新数据合并显示（新增点覆盖）
      planesRef.current = planes
      globeRef.current?.setPlanes(planes)
      setSource(source)
      setCount(planes.size)
      let a = 0
      for (const p of planes.values()) if (Date.now() - p.ts < 15000) a++
      setAlive(a)
    }
    tick()
    const id = setInterval(tick, 6000)
    return () => { stop = true; clearInterval(id) }
  }, [])

  return (
    <>
      <FlightGlobe ref={globeRef} />
      <aside id="hud">
        <h1>✈️ 苍穹之眼</h1>
        <div className="hud-grid">
          <span className="k">在线航班</span><span>{count}</span>
          <span className="k">数据源</span>
          <span className={source === 'live' ? 'ok' : 'warn'}>
            {source === 'live' ? 'ADS-B 实时（adsb.lol）' : source === 'demo' ? '演示数据（网络不可达）' : '连接中…'}
          </span>
          <span className="k">覆盖</span><span>{HUBS.length} 个枢纽区</span>
        </div>
        <div id="alt-legend">
          <span>0ft</span><div className="bar" /><span>40k ft</span>
        </div>
        <p className="hud-note">光点颜色 = 高度 · 拖拽旋转 / 滚轮缩放 · 每 6 秒刷新</p>
      </aside>
      <div id="controls">
        {VIEWS.map(([label, lat, lon, dist]) => (
          <button key={label} className="ctl" onClick={() => globeRef.current?.rotateTo(lat, lon, dist ?? 260)}>{label}</button>
        ))}
      </div>
    </>
  )
}
