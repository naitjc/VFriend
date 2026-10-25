<script setup>
import { onMounted, onUnmounted, ref, computed } from 'vue';
import { useChatStore } from '../store/chatStore';

const canvasRef = ref(null);
const chatStore = useChatStore();
let animationFrameId;
let isAnimating = false;
const snowflakes = [];
const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');

const numFlakes = Math.min(80, Math.max(30, (navigator.hardwareConcurrency || 4) * 8));

const themeColors = {
  default: 'rgba(232, 235, 255, 0.95)',
  dark:    'rgba(205, 215, 255, 0.88)',
  sakura:  'rgba(255, 232, 244, 0.96)',
  ocean:   'rgba(218, 248, 255, 0.96)',
};

const snowColor = computed(() => themeColors[chatStore.currentTheme] ?? themeColors.default);

class Snowflake {
  constructor(canvas) {
    this.canvas = canvas;
    this.reset(true);
  }

  reset(init = false) {
    this.x = Math.random() * this.canvas.width;
    this.y = init ? Math.random() * this.canvas.height : -20;
    this.size = Math.random() * 14 + 8;
    this.speed = Math.random() * 0.8 + 0.3;
    this.wind = Math.random() * 0.4 - 0.2;
    this.opacity = Math.random() * 0.5 + 0.3;
    this.char = ['❄', '❅', '❆'][Math.floor(Math.random() * 3)];
  }

  update() {
    this.y += this.speed;
    this.x += this.wind;

    if (this.y > this.canvas.height + 20) this.reset();
    if (this.x > this.canvas.width + 20) this.x = -20;
    else if (this.x < -20) this.x = this.canvas.width + 20;
  }

  draw(ctx, color) {
    ctx.globalAlpha = this.opacity;
    ctx.font = `${this.size}px serif`;
    ctx.fillStyle = color;
    ctx.fillText(this.char, this.x, this.y);
    ctx.globalAlpha = 1;
  }
}

const animate = () => {
  const canvas = canvasRef.value;
  if (!canvas || !isAnimating) return;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  ctx.clearRect(0, 0, canvas.width, canvas.height);
  const color = snowColor.value;
  snowflakes.forEach(f => { f.update(); f.draw(ctx, color); });
  animationFrameId = requestAnimationFrame(animate);
};

const startAnimation = () => {
  if (isAnimating || document.visibilityState === 'hidden' || prefersReducedMotion.matches) return;
  isAnimating = true;
  animate();
};

const stopAnimation = () => {
  isAnimating = false;
  cancelAnimationFrame(animationFrameId);
};

const handleVisibilityChange = () => {
  if (document.visibilityState === 'hidden') stopAnimation();
  else startAnimation();
};

const handleResize = () => {
  if (canvasRef.value) {
    canvasRef.value.width = window.innerWidth;
    canvasRef.value.height = window.innerHeight;
  }
};

onMounted(() => {
  if (canvasRef.value) {
    canvasRef.value.width = window.innerWidth;
    canvasRef.value.height = window.innerHeight;
    for (let i = 0; i < numFlakes; i++) snowflakes.push(new Snowflake(canvasRef.value));
    startAnimation();
    window.addEventListener('resize', handleResize);
    document.addEventListener('visibilitychange', handleVisibilityChange);
  }
});

onUnmounted(() => {
  stopAnimation();
  window.removeEventListener('resize', handleResize);
  document.removeEventListener('visibilitychange', handleVisibilityChange);
  snowflakes.length = 0;
});
</script>

<template>
  <canvas ref="canvasRef" class="snow-canvas"></canvas>
</template>

<style scoped>
.snow-canvas {
  position: fixed;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  pointer-events: none;
  z-index: 0;
}
</style>
