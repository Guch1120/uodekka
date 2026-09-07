// frontend/ui/editor_modal.js
// マリオメーカー風 コースエディタ (Course Maker)
// コースレーンのスプライン頂点追加・移動・削除、ダッシュボード・アイテムボックス・障害物配置、テスト走行
import * as THREE from 'https://unpkg.com/three@0.160.0/build/three.module.js';

export class EditorModal {
  constructor(container, onTestPlay) {
    this.container = container;
    this.onTestPlay = onTestPlay;
    this.modalEl = null;
    this.canvas = null;
    this.ctx = null;

    // 編集中のコースデータ
    this.courseData = {
      id: 'custom_' + Date.now(),
      name: 'マイ・カスタムサーキット',
      theme: 'grassland',
      trackWidth: 32,
      totalLaps: 3,
      points: [
        { x: 0, y: 0, z: 0 },
        { x: 120, y: 0, z: 20 },
        { x: 200, y: 0, z: 120 },
        { x: 220, y: 0, z: 220 },
        { x: 140, y: 0, z: 300 },
        { x: 20, y: 0, z: 280 },
        { x: -80, y: 0, z: 240 },
        { x: -120, y: 0, z: 140 },
        { x: -80, y: 0, z: 40 }
      ],
      itemBoxLocations: [0.2, 0.5, 0.8],
      dashPanels: [0.35, 0.65]
    };

    this.selectedPointIdx = -1;
    this.draggingPointIdx = -1;
    this.currentTool = 'move'; // 'move', 'add_point', 'dash_panel', 'item_box'
    this.zoom = 0.8;
    this.panX = 0;
    this.panY = 0;
    this.isPanning = false;
    this.panStartX = 0;
    this.panStartY = 0;

    this.init();
  }

  init() {
    const modal = document.createElement('div');
    modal.id = 'editor-modal';
    modal.className = 'modal-backdrop hidden editor-backdrop';
    modal.innerHTML = `
      <div class="modal-dialog editor-dialog">
        <div class="modal-header editor-header">
          <h2>🛠️ コースメーカー (コース作成エディタ)</h2>
          <div class="editor-header-actions">
            <button id="btn-editor-test" class="primary-btn editor-play-btn">🏁 テスト走行！</button>
            <button id="btn-editor-save" class="action-btn">💾 保存</button>
            <button id="btn-editor-close" class="btn-close">×</button>
          </div>
        </div>
        <div class="editor-toolbar">
          <div class="tool-group">
            <button id="tool-move" class="editor-tool-btn active" title="選択・移動">👆 頂点移動</button>
            <button id="tool-add" class="editor-tool-btn" title="コース上のクリック位置に頂点を追加">➕ 頂点追加</button>
            <button id="tool-del" class="editor-tool-btn" title="選択中の頂点を削除">🗑️ 頂点削除</button>
          </div>
          <div class="tool-group">
            <button id="tool-dash" class="editor-tool-btn" title="ダッシュボード（加速床）の追加">⚡ ダッシュ板配置</button>
            <button id="tool-item" class="editor-tool-btn" title="アイテムボックス地点の追加">🎁 アイテム箱配置</button>
          </div>
          <div class="tool-group info-group">
            <label>コース名: <input type="text" id="editor-course-name" value="マイ・カスタムサーキット" class="editor-text-input"></label>
            <label>道幅: 
              <select id="editor-track-width" class="editor-select">
                <option value="26">狭い (26)</option>
                <option value="32" selected>普通 (32)</option>
                <option value="40">広い (40)</option>
              </select>
            </label>
            <button id="btn-editor-reset" class="btn-secondary" style="padding: 4px 8px; font-size: 12px;">初期化</button>
          </div>
        </div>
        <div class="editor-canvas-container">
          <canvas id="editor-canvas" width="800" height="520"></canvas>
          <div class="editor-help-text">
            頂点をタップ＆ドラッグで移動 / 2本指でパン・ピンチズーム (マウス: 左ドラッグで頂点移動 / ホイールでズーム / 右ドラッグで移動)
          </div>
        </div>
      </div>
    `;

    this.container.appendChild(modal);
    this.modalEl = modal;

    this.canvas = modal.querySelector('#editor-canvas');
    this.ctx = this.canvas.getContext('2d');

    this.bindEvents();
    this.render();
  }

  bindEvents() {
    const modal = this.modalEl;
    const btnClose = modal.querySelector('#btn-editor-close');
    const btnSave = modal.querySelector('#btn-editor-save');
    const btnTest = modal.querySelector('#btn-editor-test');
    const btnReset = modal.querySelector('#btn-editor-reset');

    btnClose.onclick = () => this.hide();

    btnReset.onclick = () => {
      if (confirm('コース編集を初期形状に戻しますか？')) {
        this.resetDefault();
      }
    };

    btnSave.onclick = () => {
      this.saveCourse();
      alert('コースを保存しました！「ひとりで遊ぶ」や「ホスト」のコース一覧から選択できます。');
    };

    btnTest.onclick = () => {
      this.saveCourse();
      this.hide();
      if (this.onTestPlay) {
        this.onTestPlay(this.courseData.id);
      }
    };

    // ツール切り替え
    const toolBtns = {
      move: modal.querySelector('#tool-move'),
      add: modal.querySelector('#tool-add'),
      del: modal.querySelector('#tool-del'),
      dash: modal.querySelector('#tool-dash'),
      item: modal.querySelector('#tool-item')
    };

    const setTool = (toolName) => {
      this.currentTool = toolName;
      Object.keys(toolBtns).forEach(k => {
        if (toolBtns[k]) toolBtns[k].classList.remove('active');
      });
      if (toolBtns[toolName]) toolBtns[toolName].classList.add('active');
    };

    toolBtns.move.onclick = () => setTool('move');
    toolBtns.add.onclick = () => setTool('add');
    toolBtns.dash.onclick = () => setTool('dash');
    toolBtns.item.onclick = () => setTool('item');

    toolBtns.del.onclick = () => {
      if (this.selectedPointIdx >= 0 && this.courseData.points.length > 4) {
        this.courseData.points.splice(this.selectedPointIdx, 1);
        this.selectedPointIdx = -1;
        this.render();
      } else {
        alert('コースを形成するには最低4点以上の頂点が必要です。');
      }
    };

    // 設定入力連動
    const nameInput = modal.querySelector('#editor-course-name');
    nameInput.onchange = () => {
      this.courseData.name = nameInput.value.trim() || 'カスタムコース';
    };

    const widthSelect = modal.querySelector('#editor-track-width');
    widthSelect.onchange = () => {
      this.courseData.trackWidth = parseInt(widthSelect.value, 10);
      this.render();
    };

    // Canvas マウス/タッチ操作 (Pointer Events で統一対応)
    const canvas = this.canvas;

    const toWorldPos = (screenX, screenY) => {
      const rect = canvas.getBoundingClientRect();
      const cx = canvas.width / 2 + this.panX;
      const cy = canvas.height / 2 + this.panY;
      const x = (screenX - rect.left - cx) / this.zoom;
      const z = (screenY - rect.top - cy) / this.zoom;
      return { x, z };
    };

    // アクティブなポインタ追跡 (ピンチズーム・2本指パン対応)
    const activePointers = new Map();
    let initialPinchDistance = null;
    let initialPinchZoom = 1;
    let pinchMidX = 0;
    let pinchMidY = 0;

    canvas.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      try {
        canvas.setPointerCapture(e.pointerId);
      } catch (err) {}

      activePointers.set(e.pointerId, { x: e.clientX, y: e.clientY });

      // 2本指以上の場合: ピンチズーム/2本指パンスクロール開始
      if (activePointers.size === 2) {
        const pts = Array.from(activePointers.values());
        initialPinchDistance = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
        initialPinchZoom = this.zoom;
        pinchMidX = (pts[0].x + pts[1].x) / 2;
        pinchMidY = (pts[0].y + pts[1].y) / 2;
        this.draggingPointIdx = -1;
        this.isPanning = false;
        return;
      }

      if (activePointers.size > 2) return;

      // 1本指またはマウスクリック
      if (e.button === 2) {
        // 右ボタンドラッグ: パン
        this.isPanning = true;
        this.panStartX = e.clientX - this.panX;
        this.panStartY = e.clientY - this.panY;
        return;
      }

      const world = toWorldPos(e.clientX, e.clientY);

      if (this.currentTool === 'add') {
        this.insertPointNear(world.x, world.z);
        this.render();
        return;
      }

      if (this.currentTool === 'dash') {
        const t = this.findNearestSplineT(world.x, world.z);
        this.courseData.dashPanels.push(t);
        this.render();
        return;
      }

      if (this.currentTool === 'item') {
        const t = this.findNearestSplineT(world.x, world.z);
        this.courseData.itemBoxLocations.push(t);
        this.render();
        return;
      }

      // 'move' ツール: 頂点選択とドラッグ開始
      let clickedIdx = -1;
      // スマホの指でも確実に掴めるよう、タッチ時は当たり判定を拡大 (32px相当)
      const touchRadius = (e.pointerType === 'touch') ? 32 : 20;
      const clickThreshold = touchRadius / this.zoom;

      let nearestDist = Infinity;
      this.courseData.points.forEach((p, idx) => {
        const dist = Math.hypot(p.x - world.x, p.z - world.z);
        if (dist < clickThreshold && dist < nearestDist) {
          nearestDist = dist;
          clickedIdx = idx;
        }
      });

      if (clickedIdx >= 0) {
        this.selectedPointIdx = clickedIdx;
        this.draggingPointIdx = clickedIdx;
      } else {
        // 頂点以外を1本指でドラッグした場合は画面のスクロール(パン)
        this.selectedPointIdx = -1;
        this.isPanning = true;
        this.panStartX = e.clientX - this.panX;
        this.panStartY = e.clientY - this.panY;
      }
      this.render();
    });

    canvas.addEventListener('pointermove', (e) => {
      if (!activePointers.has(e.pointerId)) return;
      e.preventDefault();

      activePointers.set(e.pointerId, { x: e.clientX, y: e.clientY });

      // 2本指ジェスチャー (ピンチズーム & パン)
      if (activePointers.size === 2 && initialPinchDistance) {
        const pts = Array.from(activePointers.values());
        const dist = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
        const ratio = dist / initialPinchDistance;
        this.zoom = Math.max(0.2, Math.min(2.5, initialPinchZoom * ratio));

        const curMidX = (pts[0].x + pts[1].x) / 2;
        const curMidY = (pts[0].y + pts[1].y) / 2;
        this.panX += (curMidX - pinchMidX);
        this.panY += (curMidY - pinchMidY);
        pinchMidX = curMidX;
        pinchMidY = curMidY;

        this.render();
        return;
      }

      if (this.isPanning) {
        this.panX = e.clientX - this.panStartX;
        this.panY = e.clientY - this.panStartY;
        this.render();
        return;
      }

      if (this.draggingPointIdx >= 0) {
        const world = toWorldPos(e.clientX, e.clientY);
        this.courseData.points[this.draggingPointIdx].x = Math.round(world.x);
        this.courseData.points[this.draggingPointIdx].z = Math.round(world.z);
        this.render();
      }
    });

    const endPointer = (e) => {
      if (activePointers.has(e.pointerId)) {
        activePointers.delete(e.pointerId);
      }
      try {
        canvas.releasePointerCapture(e.pointerId);
      } catch (err) {}

      if (activePointers.size < 2) {
        initialPinchDistance = null;
      }
      if (activePointers.size === 0) {
        this.isPanning = false;
        this.draggingPointIdx = -1;
      }
    };

    canvas.addEventListener('pointerup', endPointer);
    canvas.addEventListener('pointercancel', endPointer);

    canvas.oncontextmenu = (e) => e.preventDefault();

    canvas.onwheel = (e) => {
      e.preventDefault();
      const zoomFactor = e.deltaY < 0 ? 1.12 : 0.89;
      this.zoom = Math.max(0.2, Math.min(2.5, this.zoom * zoomFactor));
      this.render();
    };

    window.addEventListener('resize', () => {
      if (!this.modalEl.classList.contains('hidden')) {
        this.resizeCanvas();
        this.render();
      }
    });
  }

  resetDefault() {
    this.courseData.points = [
      { x: 0, y: 0, z: 0 },
      { x: 120, y: 0, z: 20 },
      { x: 200, y: 0, z: 120 },
      { x: 220, y: 0, z: 220 },
      { x: 140, y: 0, z: 300 },
      { x: 20, y: 0, z: 280 },
      { x: -80, y: 0, z: 240 },
      { x: -120, y: 0, z: 140 },
      { x: -80, y: 0, z: 40 }
    ];
    this.courseData.itemBoxLocations = [0.2, 0.5, 0.8];
    this.courseData.dashPanels = [0.35, 0.65];
    this.selectedPointIdx = -1;
    this.render();
  }

  findNearestSplineT(x, z) {
    const pts = this.courseData.points.map(p => new THREE.Vector3(p.x, 0, p.z));
    const curve = new THREE.CatmullRomCurve3(pts, true, 'centripetal');
    let bestT = 0;
    let minDist = Infinity;
    const testPos = new THREE.Vector3(x, 0, z);

    for (let i = 0; i <= 100; i++) {
      const t = i / 100;
      const pt = curve.getPointAt(t);
      const d = testPos.distanceToSquared(pt);
      if (d < minDist) {
        minDist = d;
        bestT = t;
      }
    }
    return Math.round(bestT * 100) / 100;
  }

  insertPointNear(x, z) {
    const pts = this.courseData.points;
    let bestIdx = 0;
    let minDist = Infinity;

    for (let i = 0; i < pts.length; i++) {
      const p1 = pts[i];
      const p2 = pts[(i + 1) % pts.length];
      const midX = (p1.x + p2.x) / 2;
      const midZ = (p1.z + p2.z) / 2;
      const dist = Math.hypot(midX - x, midZ - z);
      if (dist < minDist) {
        minDist = dist;
        bestIdx = i + 1;
      }
    }

    pts.splice(bestIdx, 0, { x: Math.round(x), y: 0, z: Math.round(z) });
    this.selectedPointIdx = bestIdx;
  }

  saveCourse() {
    try {
      const saved = localStorage.getItem('kart_custom_courses') || '{}';
      const dict = JSON.parse(saved);
      dict[this.courseData.id] = this.courseData;
      localStorage.setItem('kart_custom_courses', JSON.stringify(dict));
    } catch (e) {
      console.warn('Failed to save course', e);
    }
  }

  resizeCanvas() {
    if (!this.canvas) return;
    const rect = this.canvas.parentElement.getBoundingClientRect();
    if (rect.width > 0 && rect.height > 0) {
      if (this.canvas.width !== Math.round(rect.width) || this.canvas.height !== Math.round(rect.height)) {
        this.canvas.width = Math.round(rect.width);
        this.canvas.height = Math.round(rect.height);
      }
    }
  }

  show() {
    this.modalEl.classList.remove('hidden');
    // コンテナの実際の寸法に合わせて描画バッファ解像度をフィット
    requestAnimationFrame(() => {
      this.resizeCanvas();
      this.render();
    });
  }

  hide() {
    this.modalEl.classList.add('hidden');
  }

  render() {
    if (!this.ctx || !this.canvas) return;
    this.resizeCanvas();
    const ctx = this.ctx;
    const w = this.canvas.width;
    const h = this.canvas.height;
    const cx = w / 2 + this.panX;
    const cy = h / 2 + this.panY;

    // 背景グリッド
    ctx.fillStyle = '#0f172a';
    ctx.fillRect(0, 0, w, h);

    ctx.strokeStyle = 'rgba(255, 255, 255, 0.05)';
    ctx.lineWidth = 1;
    const gridSize = 40 * this.zoom;
    const offsetX = cx % gridSize;
    const offsetY = cy % gridSize;

    for (let x = offsetX; x < w; x += gridSize) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, h);
      ctx.stroke();
    }
    for (let y = offsetY; y < h; y += gridSize) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(w, y);
      ctx.stroke();
    }

    if (this.courseData.points.length < 3) return;

    const toScreenX = (wx) => cx + wx * this.zoom;
    const toScreenY = (wz) => cy + wz * this.zoom;

    // Three.js スプラインでなめらかな曲線を取得
    const threePts = this.courseData.points.map(p => new THREE.Vector3(p.x, 0, p.z));
    const curve = new THREE.CatmullRomCurve3(threePts, true, 'centripetal');
    const splinePoints = curve.getPoints(160);

    // 1. 道路の太線描画
    ctx.lineWidth = this.courseData.trackWidth * this.zoom;
    ctx.strokeStyle = '#334155';
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.beginPath();
    splinePoints.forEach((p, i) => {
      const sx = toScreenX(p.x);
      const sy = toScreenY(p.z);
      if (i === 0) ctx.moveTo(sx, sy);
      else ctx.lineTo(sx, sy);
    });
    ctx.closePath();
    ctx.stroke();

    // 道路センターライン
    ctx.lineWidth = 2;
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.35)';
    ctx.setLineDash([8, 8]);
    ctx.stroke();
    ctx.setLineDash([]);

    // 2. スタートライン
    const startPt = curve.getPointAt(0);
    const startTan = curve.getTangentAt(0);
    const normal = new THREE.Vector3(-startTan.z, 0, startTan.x).normalize();
    const sx0 = toScreenX(startPt.x - normal.x * (this.courseData.trackWidth / 2));
    const sy0 = toScreenY(startPt.z - normal.z * (this.courseData.trackWidth / 2));
    const sx1 = toScreenX(startPt.x + normal.x * (this.courseData.trackWidth / 2));
    const sy1 = toScreenY(startPt.z + normal.z * (this.courseData.trackWidth / 2));

    ctx.strokeStyle = '#22c55e';
    ctx.lineWidth = 6;
    ctx.beginPath();
    ctx.moveTo(sx0, sy0);
    ctx.lineTo(sx1, sy1);
    ctx.stroke();

    // スタート看板テキスト
    ctx.fillStyle = '#22c55e';
    ctx.font = 'bold 12px sans-serif';
    ctx.fillText('🏁 START', toScreenX(startPt.x) - 24, toScreenY(startPt.z) - 10);

    // 3. ダッシュボードアイコン
    this.courseData.dashPanels.forEach(t => {
      const p = curve.getPointAt(t);
      const px = toScreenX(p.x);
      const py = toScreenY(p.z);
      ctx.fillStyle = '#f59e0b';
      ctx.beginPath();
      ctx.arc(px, py, 9, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 10px sans-serif';
      ctx.fillText('⚡', px - 5, py + 4);
    });

    // 4. アイテムボックスアイコン
    this.courseData.itemBoxLocations.forEach(t => {
      const p = curve.getPointAt(t);
      const px = toScreenX(p.x);
      const py = toScreenY(p.z);
      ctx.fillStyle = '#38bdf8';
      ctx.beginPath();
      ctx.rect(px - 8, py - 8, 16, 16);
      ctx.fill();
      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 10px sans-serif';
      ctx.fillText('？', px - 4, py + 4);
    });

    // 5. 頂点ハンドル
    this.courseData.points.forEach((p, idx) => {
      const px = toScreenX(p.x);
      const py = toScreenY(p.z);
      const isSelected = idx === this.selectedPointIdx;
      // 選択中頂点は大きめのリングと目立つ赤、通常時は操作しやすい10px
      const radius = isSelected ? 12 : 9;
      ctx.beginPath();
      ctx.arc(px, py, radius, 0, Math.PI * 2);
      ctx.fillStyle = isSelected ? '#ef4444' : '#38bdf8';
      ctx.fill();
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 2.5;
      ctx.stroke();

      if (isSelected) {
        ctx.beginPath();
        ctx.arc(px, py, radius + 5, 0, Math.PI * 2);
        ctx.strokeStyle = 'rgba(239, 68, 68, 0.5)';
        ctx.lineWidth = 2;
        ctx.stroke();
      }

      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 11px sans-serif';
      ctx.fillText(idx + 1, px + 10, py - 4);
    });
  }
}
