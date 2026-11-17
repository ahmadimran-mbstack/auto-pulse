// Renders the single low-poly Three.js faceted crystal scene for the Who It's For section.
"use client";

import React, { useRef } from "react";
import * as THREE from "three";
import { Canvas, useFrame } from "@react-three/fiber";

interface CrystalProps {
  pointer: React.MutableRefObject<{ x: number; y: number }>;
  animate: boolean;
}

// Low-poly faceted crystal using MeshPhysicalMaterial with navy and ice lighting.
function CrystalMesh({ pointer, animate }: CrystalProps) {
  const groupRef = useRef<THREE.Group>(null);

  useFrame((_, delta) => {
    const group = groupRef.current;
    if (!group || !animate) return;

    group.rotation.y += delta * 0.28;
    group.rotation.x = THREE.MathUtils.lerp(
      group.rotation.x,
      0.2 + pointer.current.y * 0.18,
      0.06
    );
    group.rotation.z = THREE.MathUtils.lerp(
      group.rotation.z,
      -pointer.current.x * 0.18,
      0.06
    );
  });

  return (
    <group ref={groupRef} rotation={[0.2, 0.4, 0]}>
      <mesh>
        <icosahedronGeometry args={[1.05, 0]} />
        <meshPhysicalMaterial
          color="#1A56B8"
          emissive="#001740"
          emissiveIntensity={0.45}
          roughness={0.22}
          metalness={0.18}
          clearcoat={0.85}
          clearcoatRoughness={0.18}
          flatShading
        />
      </mesh>
      <mesh scale={1.06}>
        <icosahedronGeometry args={[1.05, 0]} />
        <meshBasicMaterial
          color="#BFD2EE"
          wireframe
          transparent
          opacity={0.18}
        />
      </mesh>
    </group>
  );
}

interface FacetedCrystalCanvasProps {
  inView: boolean;
  reducedMotion: boolean;
  pointer: React.MutableRefObject<{ x: number; y: number }>;
}

// Caps pixel ratio at 1.5 and pauses rendering when off-screen or under reduced motion.
export default function FacetedCrystalCanvas({
  inView,
  reducedMotion,
  pointer,
}: FacetedCrystalCanvasProps) {
  const shouldAnimate = inView && !reducedMotion;

  return (
    <Canvas
      dpr={[1, 1.5]}
      frameloop={shouldAnimate ? "always" : "demand"}
      camera={{ position: [0, 0, 3.5], fov: 38 }}
      gl={{ antialias: true, alpha: true, powerPreference: "low-power" }}
      className="h-full w-full"
    >
      <ambientLight intensity={0.7} color="#BFD2EE" />
      <directionalLight position={[3, 4, 4]} intensity={2.2} color="#FFFFFF" />
      <directionalLight position={[-3, -2, -2]} intensity={1.1} color="#1A56B8" />
      <pointLight position={[0, 2.5, 2]} intensity={1.4} color="#BFD2EE" />
      <CrystalMesh pointer={pointer} animate={shouldAnimate} />
    </Canvas>
  );
}

