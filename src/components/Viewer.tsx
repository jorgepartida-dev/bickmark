import { Canvas } from '@react-three/fiber';
import { OrbitControls, GizmoHelper, GizmoViewport, Grid } from '@react-three/drei';
import * as THREE from 'three';
import type { SilhouetteMeshSet } from '../lib/svgToSilhouette';

interface ViewerProps {
  meshes: SilhouetteMeshSet | null;
  colors: { outline: string; body: string; details: string[] };
}

export function Viewer({ meshes, colors }: ViewerProps) {
  return (
    <Canvas camera={{ position: [0, -140, 180], fov: 35, up: [0, 0, 1] }} shadows frameloop="demand">
      <color attach="background" args={['#0c0c0c']} />
      <ambientLight intensity={0.45} />
      <directionalLight position={[60, 120, 120]} intensity={1.05} castShadow />
      <directionalLight position={[-80, -60, 40]} intensity={0.3} />

      <Grid
        args={[400, 400]}
        cellSize={5}
        cellColor="#242424"
        sectionSize={25}
        sectionColor="#3a3a3a"
        fadeDistance={300}
        fadeStrength={1}
        infiniteGrid={false}
        rotation={[Math.PI / 2, 0, 0]}
      />

      {meshes && (
        <group>
          <mesh geometry={meshes.outline} castShadow receiveShadow>
            <meshStandardMaterial
              color={colors.outline}
              metalness={0.05}
              roughness={0.7}
              side={THREE.DoubleSide}
            />
          </mesh>
          <mesh geometry={meshes.body} castShadow receiveShadow>
            <meshStandardMaterial
              color={colors.body}
              metalness={0.1}
              roughness={0.6}
              side={THREE.DoubleSide}
            />
          </mesh>
          {meshes.details.map((geom, i) => (
            <mesh key={i} geometry={geom} castShadow receiveShadow>
              <meshStandardMaterial
                color={colors.details[i] ?? '#e5e7eb'}
                metalness={0.08}
                roughness={0.65}
                side={THREE.DoubleSide}
              />
            </mesh>
          ))}
        </group>
      )}

      <OrbitControls makeDefault />
      <GizmoHelper alignment="bottom-right" margin={[72, 72]}>
        <GizmoViewport axisColors={['#e63946', '#2a9d8f', '#457b9d']} labelColor="white" />
      </GizmoHelper>
    </Canvas>
  );
}
