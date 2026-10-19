"use client";

import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";

interface ShaderAuroraVeilProps {
  intensity?: number;
  className?: string;
}

const vertexShaderSource = `
attribute vec2 a_position;
void main() {
  gl_Position = vec4(a_position, 0.0, 1.0);
}
`;

const fragmentShaderSource = `
precision mediump float;
uniform vec2 u_resolution;
uniform float u_time;
uniform vec2 u_pointer;
uniform float u_intensity;
uniform float u_isLight;

float saturate(float x) { return clamp(x, 0.0, 1.0); }

vec2 rotate2d(vec2 v, float a) {
  float s = sin(a);
  float c = cos(a);
  return vec2(v.x * c - v.y * s, v.x * s + v.y * c);
}

float hash21(vec2 p) {
  p = fract(p * vec2(234.34, 435.345));
  p += dot(p, p + 34.23);
  return fract(p.x * p.y);
}

float noise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  float a = hash21(i);
  float b = hash21(i + vec2(1.0, 0.0));
  float c = hash21(i + vec2(0.0, 1.0));
  float d = hash21(i + vec2(1.0, 1.0));
  return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
}

float fbm(vec2 p) {
  float value = 0.0;
  float amplitude = 0.5;
  for (int i = 0; i < 4; i++) {
    value += amplitude * noise(p);
    p *= 2.0;
    amplitude *= 0.5;
  }
  return value;
}

vec3 shaderColor(vec2 uv, vec2 p, float t, vec2 pointer, float intensity, float isLight) {
  vec2 q = p;
  q.x += sin(q.y * 2.0 + t * 0.18) * 0.22;
  q.y += cos(q.x * 1.7 - t * 0.14) * 0.16;
  float veilA = smoothstep(0.72, 0.04, abs(q.y + sin(q.x * 1.8 + t * 0.24) * 0.32));
  float veilB = smoothstep(0.62, 0.02, abs(q.y * 0.85 - cos(q.x * 2.4 - t * 0.2) * 0.24));
  float grain = fbm(q * 2.5 + t * 0.04);
  vec3 base = mix(vec3(0.03, 0.04, 0.038), vec3(0.86, 0.83, 0.76), isLight);
  vec3 green = vec3(0.28, 0.82, 0.72);
  vec3 ember = vec3(0.95, 0.34, 0.1);
  vec3 color = base + green * veilA * 0.46 + ember * veilB * 0.28;
  color += (grain - 0.5) * 0.036;
  return color * (0.84 + intensity * 0.22);
}

void main() {
  vec2 uv = gl_FragCoord.xy / u_resolution;
  vec2 p = (gl_FragCoord.xy * 2.0 - u_resolution) / min(u_resolution.x, u_resolution.y);
  vec3 color = shaderColor(uv, p, u_time, u_pointer, u_intensity, u_isLight);
  gl_FragColor = vec4(pow(max(color, vec3(0.0)), vec3(0.92)), 1.0);
}
`;

function createShader(gl: WebGLRenderingContext, type: number, source: string): WebGLShader | null {
  const shader = gl.createShader(type);
  if (!shader) return null;
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    console.error("Shader compile error:", gl.getShaderInfoLog(shader));
    gl.deleteShader(shader);
    return null;
  }
  return shader;
}

function createProgram(gl: WebGLRenderingContext, vertexShader: WebGLShader, fragmentShader: WebGLShader): WebGLProgram | null {
  const program = gl.createProgram();
  if (!program) return null;
  gl.attachShader(program, vertexShader);
  gl.attachShader(program, fragmentShader);
  gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    console.error("Program link error:", gl.getProgramInfoLog(program));
    gl.deleteProgram(program);
    return null;
  }
  return program;
}

export function ShaderAuroraVeil({ intensity = 0.7, className }: ShaderAuroraVeilProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [useFallback, setUseFallback] = useState(false);
  const rafRef = useRef<number | undefined>(undefined);
  const glRef = useRef<WebGLRenderingContext | null>(null);
  const programRef = useRef<WebGLProgram | null>(null);
  const uniformsRef = useRef<{
    resolution: WebGLUniformLocation | null;
    time: WebGLUniformLocation | null;
    pointer: WebGLUniformLocation | null;
    intensity: WebGLUniformLocation | null;
    isLight: WebGLUniformLocation | null;
  } | null>(null);
  const startTimeRef = useRef(Date.now());
  const pointerRef = useRef({ x: 0.5, y: 0.5 });
  const isPausedRef = useRef(false);
  const staticFrameRenderedRef = useRef(false);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    // Check for reduced motion
    const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    // Setup WebGL
    const gl = canvas.getContext("webgl", {
      alpha: false,
      antialias: false,
      depth: false,
      stencil: false,
      preserveDrawingBuffer: false,
      powerPreference: "low-power",
    });

    if (!gl) {
      console.warn("WebGL not supported, using CSS fallback");
      setUseFallback(true);
      return;
    }

    glRef.current = gl;

    // Create shaders and program
    const vertexShader = createShader(gl, gl.VERTEX_SHADER, vertexShaderSource);
    const fragmentShader = createShader(gl, gl.FRAGMENT_SHADER, fragmentShaderSource);

    if (!vertexShader || !fragmentShader) {
      console.warn("Failed to create shaders, using CSS fallback");
      setUseFallback(true);
      return;
    }

    const program = createProgram(gl, vertexShader, fragmentShader);
    if (!program) {
      console.warn("Failed to create program, using CSS fallback");
      setUseFallback(true);
      return;
    }

    programRef.current = program;
    gl.useProgram(program);

    // Setup geometry (full-screen triangle)
    const positionBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);

    const positionLocation = gl.getAttribLocation(program, "a_position");
    gl.enableVertexAttribArray(positionLocation);
    gl.vertexAttribPointer(positionLocation, 2, gl.FLOAT, false, 0, 0);

    // Get uniform locations
    uniformsRef.current = {
      resolution: gl.getUniformLocation(program, "u_resolution"),
      time: gl.getUniformLocation(program, "u_time"),
      pointer: gl.getUniformLocation(program, "u_pointer"),
      intensity: gl.getUniformLocation(program, "u_intensity"),
      isLight: gl.getUniformLocation(program, "u_isLight"),
    };

    // Handle resize
    const resize = () => {
      if (!canvas || !gl) return;

      const dpr = Math.min(window.devicePixelRatio || 1, 1.35);
      const rect = canvas.getBoundingClientRect();
      const width = rect.width;
      const height = rect.height;

      // Limit to ~620k canvas pixels
      const maxPixels = 620000;
      const targetPixels = width * height * dpr * dpr;
      const scale = targetPixels > maxPixels ? Math.sqrt(maxPixels / targetPixels) : 1;
      const actualDpr = dpr * scale;

      canvas.width = Math.floor(width * actualDpr);
      canvas.height = Math.floor(height * actualDpr);

      gl.viewport(0, 0, canvas.width, canvas.height);
    };

    resize();
    window.addEventListener("resize", resize);

    // Handle pointer movement
    const handlePointerMove = (e: PointerEvent) => {
      const rect = canvas.getBoundingClientRect();
      pointerRef.current = {
        x: (e.clientX - rect.left) / rect.width,
        y: 1 - (e.clientY - rect.top) / rect.height,
      };
    };
    window.addEventListener("pointermove", handlePointerMove);

    // Handle visibility
    const observer = new IntersectionObserver(
      ([entry]) => {
        isPausedRef.current = !entry.isIntersecting;
      },
      { threshold: 0 }
    );
    observer.observe(canvas);

    const handleVisibilityChange = () => {
      isPausedRef.current = document.hidden;
    };
    document.addEventListener("visibilitychange", handleVisibilityChange);

    // Handle context loss
    const handleContextLost = (e: Event) => {
      e.preventDefault();
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };

    const handleContextRestored = () => {
      startTimeRef.current = Date.now();
      render();
    };

    canvas.addEventListener("webglcontextlost", handleContextLost);
    canvas.addEventListener("webglcontextrestored", handleContextRestored);

    // Render loop
    const render = () => {
      if (!gl || !programRef.current || !uniformsRef.current || !canvas) return;

      const now = Date.now();
      const elapsed = (now - startTimeRef.current) / 1000;

      // Check theme
      const isLight = document.documentElement.getAttribute("data-theme") === "light" ? 1.0 : 0.0;

      // For reduced motion, render one static frame at t=18
      if (prefersReducedMotion) {
        if (!staticFrameRenderedRef.current) {
          gl.uniform2f(uniformsRef.current.resolution, canvas.width, canvas.height);
          gl.uniform1f(uniformsRef.current.time, 18);
          gl.uniform2f(uniformsRef.current.pointer, pointerRef.current.x, pointerRef.current.y);
          gl.uniform1f(uniformsRef.current.intensity, intensity);
          gl.uniform1f(uniformsRef.current.isLight, isLight);
          gl.drawArrays(gl.TRIANGLES, 0, 3);
          staticFrameRenderedRef.current = true;
        }
        return;
      }

      if (!isPausedRef.current) {
        gl.uniform2f(uniformsRef.current.resolution, canvas.width, canvas.height);
        gl.uniform1f(uniformsRef.current.time, elapsed);
        gl.uniform2f(uniformsRef.current.pointer, pointerRef.current.x, pointerRef.current.y);
        gl.uniform1f(uniformsRef.current.intensity, intensity);
        gl.uniform1f(uniformsRef.current.isLight, isLight);
        gl.drawArrays(gl.TRIANGLES, 0, 3);
      }

      rafRef.current = requestAnimationFrame(render);
    };

    render();

    // Cleanup
    return () => {
      window.removeEventListener("resize", resize);
      window.removeEventListener("pointermove", handlePointerMove);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      canvas.removeEventListener("webglcontextlost", handleContextLost);
      canvas.removeEventListener("webglcontextrestored", handleContextRestored);
      observer.disconnect();
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      if (gl && programRef.current) {
        gl.deleteProgram(programRef.current);
      }
    };
  }, [intensity]);

  if (useFallback) {
    return (
      <div
        aria-hidden="true"
        className={cn("pointer-events-none fixed inset-0 -z-10", className)}
        style={{
          background:
            document.documentElement.getAttribute("data-theme") === "light"
              ? "radial-gradient(circle at 34% 22%, rgba(83,194,169,0.35), transparent 30%), radial-gradient(circle at 76% 72%, rgba(236,92,19,0.18), transparent 34%), linear-gradient(140deg, #f5faf6, #eee7dc 55%, #fffaf0)"
              : "radial-gradient(circle at 30% 24%, rgba(89,216,190,0.5), transparent 31%), radial-gradient(circle at 80% 72%, rgba(236,92,19,0.3), transparent 34%), linear-gradient(140deg, #06110f, #151515 55%, #030303)",
        }}
      />
    );
  }

  return (
    <canvas
      ref={canvasRef}
      aria-hidden="true"
        className={cn("pointer-events-none fixed inset-0 -z-10", className)}
      style={{ width: "100%", height: "100%" }}
    />
  );
}
