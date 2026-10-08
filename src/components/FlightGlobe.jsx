import { useEffect, useImperativeHandle, useRef } from 'react'
import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import { feature } from 'topojson-client'
import countriesTopo from 'world-atlas/countries-110m.json'

const D2R = Math.PI / 180;
const R = 100;   // 地球半径（场景单位）
const ALT_SCALE = 0.018;   // 1 英尺 → 场景单位（3 万英尺 ≈ 0.54% 半径外）

function llToVec(lat, lon, altFt = 0) {
  const p = lat * D2R, l = lon * D2R, r = R * (1 + altFt * ALT_SCALE / 100);
  return new THREE.Vector3(r * Math.cos(p) * Math.cos(l), r * Math.sin(p), -r * Math.cos(p) * Math.sin(l));
}

/** 高度 → 颜色（低空暖黄 → 巡航青白） */
function altColor(altFt) {
  const k = Math.min(1, altFt / 40000);
  const c1 = [255, 200, 110], c2 = [130, 220, 255];
  return c1.map((v, i) => v + (c2[i] - v) * k);
}

export default function FlightGlobe({ ref }) {
  const mountRef = useRef(null);
  const s = useRef(null);

  useEffect(() => {
    const mount = mountRef.current;
    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 2));
    renderer.setSize(mount.clientWidth, mount.clientHeight);
    mount.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(50, mount.clientWidth / mount.clientHeight, 0.1, 2000);
    camera.position.set(0, 60, 260);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true; controls.dampingFactor = 0.08;
    controls.minDistance = 115; controls.maxDistance = 600;
    controls.rotateSpeed = 0.5;

    // 地球（深蓝）+ 大气辉光
    const earth = new THREE.Mesh(
      new THREE.SphereGeometry(R, 64, 48),
      new THREE.MeshPhongMaterial({ color: 0x0d2a4a, shininess: 6 }),
    );
    const atmo = new THREE.Mesh(
      new THREE.SphereGeometry(R * 1.04, 48, 36),
      new THREE.MeshBasicMaterial({ color: 0x4fa8ff, transparent: true, opacity: 0.14, side: THREE.BackSide, blending: THREE.AdditiveBlending, depthWrite: false }),
    );
    scene.add(earth, atmo, new THREE.AmbientLight(0x8899bb, 1.2));

    // 国界线（Natural Earth 110m → 线段）
    const fc = feature(countriesTopo, countriesTopo.objects.countries);
    const borderPos = [];
    for (const f of fc.features) {
      const gm = f.geometry;
      const polys = gm.type === 'Polygon' ? [gm.coordinates] : gm.type === 'MultiPolygon' ? gm.coordinates : [];
      for (const poly of polys) for (const ring of poly) {
        for (let i = 1; i < ring.length; i++) {
          const a = llToVec(ring[i - 1][1], ring[i - 1][0], 0), b = llToVec(ring[i][1], ring[i][0], 0);
          borderPos.push(a.x, a.y, a.z, b.x, b.y, b.z);
        }
      }
    }
    const bg = new THREE.BufferGeometry();
    bg.setAttribute('position', new THREE.Float32BufferAttribute(borderPos, 3));
    scene.add(new THREE.LineSegments(bg, new THREE.LineBasicMaterial({ color: 0x3a6a8a, transparent: true, opacity: 0.5 })));

    // 航班层：Points（动态容量 4000）
    const MAX = 4000;
    const posArr = new Float32Array(MAX * 3);
    const colArr = new Float32Array(MAX * 3);
    const pGeo = new THREE.BufferGeometry();
    pGeo.setAttribute('position', new THREE.BufferAttribute(posArr, 3));
    pGeo.setAttribute('color', new THREE.BufferAttribute(colArr, 3));
    const points = new THREE.Points(pGeo, new THREE.PointsMaterial({
      size: 2.6, vertexColors: true, transparent: true, opacity: 0.95, sizeAttenuation: false,
      depthWrite: false, blending: THREE.AdditiveBlending,
    }));
    scene.add(points);

    // 星空
    {
      const n = 900, arr = new Float32Array(n * 3);
      for (let i = 0; i < n; i++) {
        const v = new THREE.Vector3().randomDirection().multiplyScalar(800);
        arr.set([v.x, v.y, v.z], i * 3);
      }
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.BufferAttribute(arr, 3));
      scene.add(new THREE.Points(g, new THREE.PointsMaterial({ color: 0xcfe4ff, size: 1.2, sizeAttenuation: false, transparent: true, opacity: 0.7 })));
    }

    const onResize = () => {
      const w = mount.clientWidth, h = mount.clientHeight;
      camera.aspect = w / h; camera.updateProjectionMatrix();
      renderer.setSize(w, h);
    };
    const ro = new ResizeObserver(onResize);
    ro.observe(mount);

    s.current = { renderer, scene, camera, controls, points, pGeo, posArr, colArr, MAX };

    let raf;
    const tick = () => {
      controls.update();
      renderer.render(scene, camera);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      controls.dispose();
      renderer.dispose();
      mount.removeChild(renderer.domElement);
    };
  }, []);

  useImperativeHandle(ref, () => ({
    /** 更新航班光点（Map<hex, plane>） */
    setPlanes(planes) {
      const st = s.current;
      if (!st) return;
      let i = 0;
      for (const p of planes.values()) {
        if (i >= st.MAX) break;
        const v = llToVec(p.lat, p.lon, p.altFt);
        st.posArr[i * 3] = v.x; st.posArr[i * 3 + 1] = v.y; st.posArr[i * 3 + 2] = v.z;
        const c = altColor(p.altFt);
        st.colArr[i * 3] = c[0] / 255; st.colArr[i * 3 + 1] = c[1] / 255; st.colArr[i * 3 + 2] = c[2] / 255;
        i++;
      }
      st.pGeo.setDrawRange(0, i);
      st.pGeo.attributes.position.needsUpdate = true;
      st.pGeo.attributes.color.needsUpdate = true;
      st.count = i;
    },
    getCount() { return s.current?.count ?? 0 },
    rotateTo(lat, lon, dist = 260) {
      const st = s.current;
      const v = llToVec(lat, lon, 0).normalize().multiplyScalar(dist);
      st.camera.position.copy(v);
      st.controls.target.set(0, 0, 0);
    },
  }));

  return <div id="globe-mount" ref={mountRef} />;
}
