import { Canvas } from '@react-three/fiber';
import { OrbitControls, GizmoHelper, GizmoViewport, Grid } from '@react-three/drei';
import type { MutableRefObject } from 'react';
import * as THREE from 'three';

interface ViewerProps {
  geometry: THREE.BufferGeometry | null;
  meshRef: MutableRefObject<THREE.Mesh | null>;
}

export function Viewer({ geometry, meshRef }: ViewerProps) {
  return (
    <Canvas camera={{ position: [80, 80, 120], fov: 40 }} shadows>
      <color attach="background" args={['#111']} />
      <ambientLight intensity={0.35} />
      <directionalLight position={[60, 120, 80]} intensity={1.1} castShadow />
      <directionalLight position={[-80, -40, -40]} intensity={0.25} />

      <Grid
        args={[300, 300]}
        cellSize={5}
        cellColor="#2a2a2a"
        sectionSize={25}
        sectionColor="#3e3e3e"
        fadeDistance={250}
        fadeStrength={1}
        infiniteGrid={false}
      />

      {geometry && (
        <mesh ref={meshRef} geometry={geometry} castShadow receiveShadow>
          <meshStandardMaterial color="#8ecae6" metalness={0.1} roughness={0.6} side={THREE.DoubleSide} />
        </mesh>
      )}

      <OrbitControls makeDefault />
      <GizmoHelper alignment="bottom-right" margin={[72, 72]}>
        <GizmoViewport axisColors={['#e63946', '#2a9d8f', '#457b9d']} labelColor="white" />
      </GizmoHelper>
    </Canvas>
  );
}
