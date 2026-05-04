import React, { useRef, useEffect } from 'react';

interface WaveformCanvasProps {
  data: number[];
  color?: string;
  lineWidth?: number;
  height?: number;
  min?: number;
  max?: number;
  label?: string;
  gridLines?: boolean;
}

const WaveformCanvas: React.FC<WaveformCanvasProps> = ({
  data,
  color = '#00f2ff',
  lineWidth = 1.5,
  height = 100,
  min = -1,
  max = 1,
  label,
  gridLines = true,
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Handle high DPI and resizing
    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    const displayWidth = Math.floor(rect.width);
    const displayHeight = Math.floor(height);
    
    if (canvas.width !== displayWidth * dpr || canvas.height !== displayHeight * dpr) {
      canvas.width = displayWidth * dpr;
      canvas.height = displayHeight * dpr;
      ctx.scale(dpr, dpr);
    }

    const draw = () => {
      ctx.clearRect(0, 0, displayWidth, displayHeight);

      if (gridLines) {
        ctx.strokeStyle = '#1e293b'; // slate-800
        ctx.lineWidth = 0.5;
        // Horizontal grid
        for (let i = 0; i <= 4; i++) {
          const y = (i / 4) * displayHeight;
          ctx.beginPath();
          ctx.moveTo(0, y);
          ctx.lineTo(displayWidth, y);
          ctx.stroke();
        }
        // Vertical grid
        for (let i = 0; i < displayWidth; i += 50) {
          ctx.beginPath();
          ctx.moveTo(i, 0);
          ctx.lineTo(i, displayHeight);
          ctx.stroke();
        }
      }

      if (data.length < 2) return;

      ctx.beginPath();
      ctx.strokeStyle = color;
      ctx.lineWidth = lineWidth;
      ctx.lineJoin = 'round';
      ctx.lineCap = 'round';

      // Advanced mode: scrolling effect
      // We map the array to the width of the canvas
      const step = displayWidth / (data.length - 1);
      
      for (let i = 0; i < data.length; i++) {
        const x = i * step;
        // Normalize value to 0-1
        const normalized = (data[i] - min) / (max - min);
        // Map to canvas Y (inverted Y axis)
        const y = displayHeight - normalized * displayHeight;

        if (i === 0) {
          ctx.moveTo(x, y);
        } else {
          ctx.lineTo(x, y);
        }
      }
      ctx.stroke();

      // Label
      if (label) {
        ctx.fillStyle = 'rgba(255, 255, 255, 0.5)';
        ctx.font = '10px Roboto Mono, monospace';
        ctx.fillText(label, 8, 14);
      }
    };

    draw();
  }, [data, color, lineWidth, height, min, max, label, gridLines]);

  return (
    <div className="relative w-full overflow-hidden" style={{ height }}>
      <canvas
        ref={canvasRef}
        className="w-full block"
        style={{ height }}
      />
    </div>
  );
};

export default WaveformCanvas;
