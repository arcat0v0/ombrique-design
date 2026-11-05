import { useLayoutEffect, useRef, useState, type HTMLAttributes } from "react";
import { absoluteAt, dataNameAttr, joinClass } from "./internal";
import {
  createShaderProgram,
  disposeShaderProgram,
  drawShaderFrame,
  loadShaderSource,
  shaderBackingSize,
} from "./shader-renderer";

export interface ShaderProps extends HTMLAttributes<HTMLDivElement> {
  name?: string;
  x: number;
  y: number;
  width: number;
  height: number;
  src: string;
  time?: number;
  radius?: number;
}

export const SHADER_SYNC_EVENT = "ombrique:shader-sync";

let shaderSequence = 0;

function notifyShaderSync(): void {
  if (typeof document === "undefined") return;
  document.dispatchEvent(new CustomEvent(SHADER_SYNC_EVENT));
}

export function Shader({
  x,
  y,
  width,
  height,
  src,
  time = 0,
  radius,
  name,
  className,
  style,
  ...rest
}: ShaderProps) {
  const anchorRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const idRef = useRef<string>("");
  if (idRef.current === "") {
    shaderSequence += 1;
    idRef.current = `shader-${shaderSequence}`;
  }
  const shaderId = idRef.current;
  const [error, setError] = useState<string | null>(null);
  const [dpr, setDpr] = useState(globalThis.devicePixelRatio || 1);

  useLayoutEffect(() => {
    const anchor = anchorRef.current;
    if (!anchor) return;
    const canvas = document.createElement("canvas");
    canvas.setAttribute("drawable", "");
    canvas.dataset.shaderId = shaderId;
    canvas.dataset.shaderStatus = "loading";
    canvas.style.position = "absolute";
    canvas.style.left = "0";
    canvas.style.top = "0";
    canvas.style.display = "block";
    canvas.style.pointerEvents = "none";
    const host = anchor.closest('canvas[content="drawable"]');
    (host ?? anchor).appendChild(canvas);
    canvasRef.current = canvas;
    notifyShaderSync();
    return () => {
      canvasRef.current = null;
      canvas.remove();
      notifyShaderSync();
    };
  }, [shaderId]);

  useLayoutEffect(() => {
    if (typeof window.matchMedia !== "function") return;
    const media = window.matchMedia(`(resolution: ${dpr}dppx)`);
    const onChange = () => setDpr(globalThis.devicePixelRatio || 1);
    media.addEventListener("change", onChange);
    return () => media.removeEventListener("change", onChange);
  }, [dpr]);

  useLayoutEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    let cancelled = false;
    let program: WebGLProgram | null = null;
    const gl = canvas.getContext("webgl2", {
      alpha: true,
      antialias: false,
      preserveDrawingBuffer: true,
      premultipliedAlpha: true,
    });
    const fail = (message: string): void => {
      if (cancelled) return;
      canvas.dataset.shaderStatus = "error";
      canvas.style.display = "none";
      setError(message);
      notifyShaderSync();
      console.error(`[shader] ${message}`);
    };
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;
    canvas.style.borderRadius = radius === undefined ? "" : `${radius}px`;
    if (!gl) {
      fail("WebGL2 context unavailable");
      return;
    }
    const limit = gl.getParameter(gl.MAX_TEXTURE_SIZE);
    const maxDimension =
      typeof limit === "number" && Number.isFinite(limit) && limit > 0
        ? limit
        : 8192;
    const size = shaderBackingSize(width, height, dpr, maxDimension);
    canvas.width = size.width;
    canvas.height = size.height;
    canvas.dataset.shaderStatus = "loading";
    notifyShaderSync();
    void loadShaderSource(src)
      .then((source) => {
        if (cancelled) return;
        const result = createShaderProgram(gl, source);
        if (!result.program) {
          fail(result.error ?? "shader program link failed");
          return;
        }
        program = result.program;
        drawShaderFrame(gl, program, size, time);
        canvas.dataset.shaderStatus = "ready";
        canvas.style.display = "block";
        setError(null);
        notifyShaderSync();
        requestAnimationFrame(() => {
          if (!cancelled) notifyShaderSync();
        });
      })
      .catch((reason: unknown) => {
        fail(reason instanceof Error ? reason.message : String(reason));
      });
    return () => {
      cancelled = true;
      disposeShaderProgram(gl, program);
      program = null;
    };
  }, [src, time, width, height, radius, dpr]);

  return (
    <div
      {...rest}
      ref={anchorRef}
      {...dataNameAttr(name, rest)}
      className={joinClass(className)}
      data-ombrique-shader=""
      data-shader-id={shaderId}
      data-shader-x={x}
      data-shader-y={y}
      data-shader-width={width}
      data-shader-height={height}
      data-shader-radius={radius ?? 0}
      style={{
        ...absoluteAt(x, y),
        width,
        height,
        borderRadius: radius,
        overflow: "hidden",
        pointerEvents: "none",
        ...style,
      }}
    >
      {error === null ? null : (
        <div
          style={{
            position: "absolute",
            inset: 0,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            boxSizing: "border-box",
            padding: 8,
            background: "rgba(120, 16, 48, 0.88)",
            color: "#ffe4ec",
            fontFamily: "monospace",
            fontSize: 11,
            lineHeight: 1.4,
            whiteSpace: "pre-wrap",
            overflow: "hidden",
            textAlign: "center",
          }}
        >
          {error}
        </div>
      )}
    </div>
  );
}
