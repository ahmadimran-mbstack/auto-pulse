// This component renders a WebGL warped noise wave ribbon using Three.js and React Three Fiber with grain and pausing.
"use client";

import React, { useRef, useMemo, useState, useEffect } from "react";
import * as THREE from "three";
import { Canvas, useFrame } from "@react-three/fiber";

// Encoded SVG feTurbulence noise texture for the mobile or non-WebGL CSS fallback
const NOISE_DATA_URI =
  "data:image/svg+xml,%3Csvg viewBox='0 0 240 240' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noiseFilter'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.8' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noiseFilter)'/%3E%3C/svg%3E";

// Vertex shader passing full-screen normalized coordinates
const vertexShader = `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = vec4(position, 1.0);
}
`;

// Fragment shader drawing flowing warped noise wave ribbon with internal film grain
const fragmentShader = `
precision highp float;
uniform float uTime;
uniform vec3 uNavyDeep;
uniform vec3 uNavy;
uniform vec3 uBlue;
uniform vec3 uIce;
uniform vec3 uWhite;
uniform float uReducedMotion;
varying vec2 vUv;

// Pseudorandom hash generator
float hash(vec2 p) {
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}

// 2D Value Noise
float noise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  float a = hash(i);
  float b = hash(i + vec2(1.0, 0.0));
  float c = hash(i + vec2(0.0, 1.0));
  float d = hash(i + vec2(1.0, 1.0));
  return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
}

// Fractional Brownian Motion for natural warping
float fbm(vec2 p) {
  float v = 0.0;
  float a = 0.5;
  mat2 rot = mat2(cos(0.5), sin(0.5), -sin(0.5), cos(0.5));
  for (int i = 0; i < 4; i++) {
    v += a * noise(p);
    p = rot * p * 2.0;
    a *= 0.5;
  }
  return v;
}

void main() {
  vec2 uv = vUv;
  // Very slow motion (time speed about 0.05)
  float t = uReducedMotion > 0.5 ? 1.4 : uTime * 0.05;

  // Gentle sinusoidal wave center across hero
  float waveCenter = 0.52 + 0.14 * sin(uv.x * 3.14159265 + t * 0.8);

  // Multi-octave warped noise domain
  vec2 q = vec2(fbm(uv * 2.2 + vec2(t * 0.4, t * 0.2)), fbm(uv * 2.6 - vec2(t * 0.3, t * 0.15)));
  vec2 r = vec2(fbm(uv * 2.8 + 2.4 * q + vec2(t * 0.2, 0.0)), fbm(uv * 2.8 + 2.4 * q - vec2(0.0, t * 0.15)));
  float n = fbm(uv * 2.0 + 2.8 * r);

  // Band distance calculation
  float dist = abs(uv.y - waveCenter + (n - 0.5) * 0.38);

  // Color blending restricted strictly to allowed tokens
  vec3 col = uNavyDeep;
  col = mix(col, uNavy, smoothstep(0.42, 0.18, dist));
  col = mix(col, uBlue, smoothstep(0.24, 0.09, dist) * (0.75 + 0.25 * n));
  col = mix(col, uIce, smoothstep(0.14, 0.04, dist) * smoothstep(0.28, 0.72, n));
  col = mix(col, uWhite, smoothstep(0.06, 0.0, dist) * smoothstep(0.55, 0.9, n) * 0.9);

  // Film grain added directly inside the shader
  float grain = (hash(uv * 600.0 + fract(t * 10.0)) - 0.5) * 0.055;
  col += grain;

  gl_FragColor = vec4(col, 1.0);
}
`;

// Inner Mesh component that advances shader uniforms and respects visibility
function WaveRibbonMesh({
  isVisible,
  isReducedMotion,
}: {
  isVisible: boolean;
  isReducedMotion: boolean;
}) {
  const meshRef = useRef<THREE.Mesh>(null);

  // Prepare shader uniforms using exact RGB values from design tokens
  const uniforms = useMemo(
    () => ({
      uTime: { value: 0.0 },
      uReducedMotion: { value: isReducedMotion ? 1.0 : 0.0 },
      uNavyDeep: { value: new THREE.Color("#001740") },
      uNavy: { value: new THREE.Color("#0A2A66") },
      uBlue: { value: new THREE.Color("#1A56B8") },
      uIce: { value: new THREE.Color("#BFD2EE") },
      uWhite: { value: new THREE.Color("#FFFFFF") },
    }),
    [isReducedMotion]
  );

  // Update time uniform when visible and motion is permitted
  useFrame((_, delta) => {
    if (!isVisible || isReducedMotion) return;
    if (meshRef.current) {
      const material = meshRef.current.material as THREE.ShaderMaterial;
      material.uniforms.uTime.value += delta;
    }
  });

  return (
    <mesh ref={meshRef}>
      {/* Full-bleed 2x2 plane in normalized device coordinates */}
      <planeGeometry args={[2, 2]} />
      <shaderMaterial
        vertexShader={vertexShader}
        fragmentShader={fragmentShader}
        uniforms={uniforms}
        depthWrite={false}
        depthTest={false}
      />
    </mesh>
  );
}

// Static CSS fallback for small screens (<768px) or systems without WebGL
function StaticRibbonFallback() {
  return (
    <div className="absolute inset-0 overflow-hidden select-none" aria-hidden="true">
      <div
        className="w-full h-full opacity-70"
        style={{
          backgroundColor: "#001740",
          backgroundImage: `
            radial-gradient(ellipse 75% 45% at 50% 50%, rgba(26, 86, 184, 0.45) 0%, rgba(10, 42, 102, 0.3) 40%, transparent 75%),
            radial-gradient(ellipse 45% 30% at 30% 45%, rgba(191, 210, 238, 0.35) 0%, transparent 60%),
            radial-gradient(ellipse 40% 25% at 70% 55%, rgba(255, 255, 255, 0.18) 0%, transparent 50%)
          `,
        }}
      />
      <div
        className="absolute inset-0"
        style={{
          backgroundImage: `url("${NOISE_DATA_URI}")`,
          backgroundRepeat: "repeat",
          backgroundSize: "180px 180px",
          opacity: 0.12,
          mixBlendMode: "overlay",
        }}
      />
    </div>
  );
}

// Main exported canvas component with IntersectionObserver and responsive fallback
export default function HeroRibbonCanvas() {
  const containerRef = useRef<HTMLDivElement>(null);
  const [isVisible, setIsVisible] = useState(true);
  const [canUseWebGL, setCanUseWebGL] = useState(false);
  const [isReducedMotion, setIsReducedMotion] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;

    // Detect screen width (must be >= 768px)
    const isDesktop = window.innerWidth >= 768;

    // Detect WebGL capability safely
    let webglSupport = false;
    try {
      const canvas = document.createElement("canvas");
      webglSupport = !!(
        window.WebGLRenderingContext &&
        (canvas.getContext("webgl") || canvas.getContext("experimental-webgl"))
      );
    } catch {
      webglSupport = false;
    }

    setCanUseWebGL(isDesktop && webglSupport);

    // Detect user reduced motion preference
    const motionQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
    setIsReducedMotion(motionQuery.matches);
    const handleMotionChange = (e: MediaQueryListEvent) =>
      setIsReducedMotion(e.matches);
    motionQuery.addEventListener("change", handleMotionChange);

    // Observe hero visibility to pause rendering when off screen
    const observer = new IntersectionObserver(
      ([entry]) => {
        setIsVisible(entry.isIntersecting);
      },
      { threshold: 0.05 }
    );

    if (containerRef.current) {
      observer.observe(containerRef.current);
    }

    return () => {
      motionQuery.removeEventListener("change", handleMotionChange);
      observer.disconnect();
    };
  }, []);

  // Return static CSS version if screen < 768px or WebGL is unsupported
  if (!canUseWebGL) {
    return <StaticRibbonFallback />;
  }

  return (
    <div
      ref={containerRef}
      className="absolute inset-0 overflow-hidden pointer-events-none select-none"
      aria-hidden="true"
    >
      <Canvas
        dpr={[1, 1.5]}
        gl={{
          antialias: false,
          powerPreference: "high-performance",
          alpha: true,
        }}
        camera={{ position: [0, 0, 1] }}
        frameloop={isVisible && !isReducedMotion ? "always" : "demand"}
      >
        <WaveRibbonMesh
          isVisible={isVisible}
          isReducedMotion={isReducedMotion}
        />
      </Canvas>
    </div>
  );
}

