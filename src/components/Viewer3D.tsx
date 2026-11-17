import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';

export interface MeshData {
  positions: Float32Array; // already in scene coordinates (mm, centred)
  normals?: Float32Array;
  index?: Uint32Array;
  colors?: Uint8Array;
  color?: number;
}

/** Small three.js viewer that renders on demand (orbit to rotate, wheel to zoom). */
export default function Viewer3D(props: { meshes: MeshData[]; label: string; radius?: number }) {
  const box = useRef<HTMLDivElement>(null);
  const ctx = useRef<{ renderer: THREE.WebGLRenderer; scene: THREE.Scene; camera: THREE.PerspectiveCamera; controls: OrbitControls; group: THREE.Group; render: () => void } | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const el = box.current!;
    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    } catch {
      setError('WebGL is not available in this browser.');
      return;
    }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    el.appendChild(renderer.domElement);
    renderer.domElement.setAttribute('role', 'img');
    renderer.domElement.setAttribute('aria-label', props.label);
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(35, 1, 1, 4000);
    const r = props.radius ?? 120;
    camera.position.set(-2.6 * r, 0.5 * r, 1.0 * r);
    scene.add(new THREE.HemisphereLight(0xffffff, 0x334455, 1.2));
    const dl = new THREE.DirectionalLight(0xffffff, 1.6);
    dl.position.set(0, 0, 1);
    camera.add(dl);
    scene.add(camera);
    const group = new THREE.Group();
    scene.add(group);
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enablePan = false;
    controls.minDistance = r * 0.8;
    controls.maxDistance = r * 6;
    const render = () => renderer.render(scene, camera);
    controls.addEventListener('change', render);
    const resize = () => {
      const b = el.getBoundingClientRect();
      renderer.setSize(b.width, b.height, false);
      renderer.domElement.style.width = '100%';
      renderer.domElement.style.height = '100%';
      camera.aspect = b.width / b.height || 1;
      camera.updateProjectionMatrix();
      render();
    };
    const ro = new ResizeObserver(resize);
    ro.observe(el);
    ctx.current = { renderer, scene, camera, controls, group, render };
    resize();
    return () => {
      ro.disconnect();
      controls.dispose();
      group.traverse((o) => {
        if (o instanceof THREE.Mesh) {
          o.geometry.dispose();
          (o.material as THREE.Material).dispose();
        }
      });
      renderer.dispose();
      renderer.domElement.remove();
      ctx.current = null;
    };
    // the viewer is created once; meshes are swapped in the next effect
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const c = ctx.current;
    if (!c) return;
    for (const o of [...c.group.children]) {
      c.group.remove(o);
      if (o instanceof THREE.Mesh) {
        o.geometry.dispose();
        (o.material as THREE.Material).dispose();
      }
    }
    for (const m of props.meshes) {
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(m.positions, 3));
      if (m.index) geo.setIndex(new THREE.BufferAttribute(m.index, 1));
      if (m.colors) geo.setAttribute('color', new THREE.BufferAttribute(m.colors, 3, true));
      if (m.normals) geo.setAttribute('normal', new THREE.BufferAttribute(m.normals, 3));
      else geo.computeVertexNormals();
      const mat = new THREE.MeshPhongMaterial({ color: m.colors ? 0xffffff : (m.color ?? 0xd9b8a6), vertexColors: !!m.colors, shininess: 25, side: THREE.DoubleSide });
      c.group.add(new THREE.Mesh(geo, mat));
    }
    c.render();
  }, [props.meshes]);

  return (
    <div ref={box} className="relative h-[380px] w-full overflow-hidden rounded-md border border-line bg-black sm:h-[460px]">
      {error && <p className="absolute inset-0 grid place-items-center text-sm text-neutral-300">{error}</p>}
    </div>
  );
}
