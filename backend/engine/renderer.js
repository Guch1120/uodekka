// backend/engine/renderer.js
// Three.jsのレンダラー、シーン、ライティング初期化とリサイズ処理
import * as THREE from 'https://unpkg.com/three@0.160.0/build/three.module.js';

export class GameRenderer {
  constructor(canvasContainer) {
    this.container = canvasContainer;

    // シーン
    this.scene = new THREE.Scene();

    const w = this.container.clientWidth || window.innerWidth;
    const h = this.container.clientHeight || window.innerHeight;

    // カメラ (FOV 65)
    this.camera = new THREE.PerspectiveCamera(
      65,
      w / h,
      0.1,
      2000
    );

    // レンダラー
    this.isContextLost = false;
    this.contextLostCount = 0;
    this.contextRestoredCount = 0;
    this.onContextLost = null;
    this.onContextRestored = null;

    const isMobile = typeof navigator !== 'undefined' && /Android|iPhone|iPad|iPod/i.test(navigator.userAgent || '');
    this.graphicQuality = (typeof localStorage !== 'undefined' && localStorage.getItem('kart_graphic_quality')) || (isMobile ? 'normal' : 'high');

    this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    this.renderer.setSize(w, h);
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    this.container.appendChild(this.renderer.domElement);

    // ライティング
    this.ambientLight = new THREE.AmbientLight(0xffffff, 0.7);
    this.scene.add(this.ambientLight);

    this.dirLight = new THREE.DirectionalLight(0xffffff, 1.2);
    this.dirLight.position.set(100, 150, 100);
    this.dirLight.shadow.camera.near = 10;
    this.dirLight.shadow.camera.far = 500;
    const shadowD = 120;
    this.dirLight.shadow.camera.left = -shadowD;
    this.dirLight.shadow.camera.right = shadowD;
    this.dirLight.shadow.camera.top = shadowD;
    this.dirLight.shadow.camera.bottom = -shadowD;
    this.scene.add(this.dirLight);

    // 画質設定の適用
    this.applyQualitySettings(this.graphicQuality);

    // WebGLコンテキスト喪失/復帰イベントの監視
    const dom = this.renderer.domElement;
    dom.addEventListener('webglcontextlost', (event) => {
      event.preventDefault(); // 復帰可能にするためpreventDefaultを呼ぶ
      this.isContextLost = true;
      this.contextLostCount++;
      console.warn('[GameRenderer] WebGL context lost! Total lost count:', this.contextLostCount);
      this.onContextLost?.(event);
    }, false);

    dom.addEventListener('webglcontextrestored', () => {
      this.isContextLost = false;
      this.contextRestoredCount++;
      console.info('[GameRenderer] WebGL context restored! Total restore count:', this.contextRestoredCount);
      this.applyQualitySettings(this.graphicQuality);
      this.onContextRestored?.();
    }, false);

    // リサイズイベント
    window.addEventListener('resize', () => this.onResize());
  }

  setGraphicQuality(quality) {
    this.graphicQuality = quality;
    try {
      localStorage.setItem('kart_graphic_quality', quality);
    } catch (_) {}
    this.applyQualitySettings(quality);
    this.onResize();
  }

  applyQualitySettings(quality) {
    const dpr = typeof window !== 'undefined' ? (window.devicePixelRatio || 1) : 1;
    if (quality === 'low') {
      this.renderer.setPixelRatio(1.0);
      this.renderer.shadowMap.enabled = false;
      this.dirLight.castShadow = false;
    } else if (quality === 'normal') {
      this.renderer.setPixelRatio(Math.min(dpr, 1.5));
      this.renderer.shadowMap.enabled = true;
      this.dirLight.castShadow = true;
      this.dirLight.shadow.mapSize.set(512, 512);
    } else {
      // high
      this.renderer.setPixelRatio(Math.min(dpr, 2.0));
      this.renderer.shadowMap.enabled = true;
      this.dirLight.castShadow = true;
      this.dirLight.shadow.mapSize.set(1024, 1024);
    }
    if (this.dirLight.shadow.map) {
      this.dirLight.shadow.map.dispose();
      this.dirLight.shadow.map = null;
    }
  }

  setSkyAndTheme(skyColor, ambientColor) {
    this.scene.background = new THREE.Color(skyColor);
    this.scene.fog = new THREE.FogExp2(skyColor, 0.0015);
    this.ambientLight.color.setHex(ambientColor);
  }

  onResize() {
    const w = this.container.clientWidth || window.innerWidth;
    const h = this.container.clientHeight || window.innerHeight;
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h);
  }

  render() {
    if (this.isContextLost) return;
    this.renderer.render(this.scene, this.camera);
  }

  getDiagnostics() {
    const gl = this.renderer.getContext();
    let debugInfo = null;
    if (gl) {
      try {
        const ext = gl.getExtension('WEBGL_debug_renderer_info');
        if (ext) {
          debugInfo = {
            vendor: gl.getParameter(ext.UNMASKED_VENDOR_WEBGL),
            renderer: gl.getParameter(ext.UNMASKED_RENDERER_WEBGL)
          };
        }
      } catch (_) {}
    }
    const dom = this.renderer.domElement;
    return {
      isContextLost: this.isContextLost || (gl ? gl.isContextLost() : false),
      contextLostCount: this.contextLostCount,
      contextRestoredCount: this.contextRestoredCount,
      graphicQuality: this.graphicQuality,
      pixelRatio: this.renderer.getPixelRatio(),
      devicePixelRatio: typeof window !== 'undefined' ? window.devicePixelRatio : 1,
      canvasSize: {
        width: dom ? dom.width : 0,
        height: dom ? dom.height : 0,
        clientWidth: dom ? dom.clientWidth : 0,
        clientHeight: dom ? dom.clientHeight : 0
      },
      glVendor: debugInfo?.vendor || (gl ? gl.getParameter(gl.VENDOR) : 'unknown'),
      glRenderer: debugInfo?.renderer || (gl ? gl.getParameter(gl.RENDERER) : 'unknown')
    };
  }
}
