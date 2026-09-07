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
            ドラッグで頂点移動 / マウスホイールで拡大縮小 / 右ボタンドラッグで画面スクロール
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

    // Canvas マウス/タッチ操作
    const canvas = this.canvas;

    const toWorldPos = (screenX, screenY) => {
      const rect = canvas.getBoundingClientRect();
      const cx = canvas.width / 2 + this.panX;
      const cy = canvas.height / 2 + this.panY;
      const x = (screenX - rect.left - cx) / this.zoom;
      const z = (screenY - rect.top - cy) / this.zoom;
      return { x, z };
    };

    canvas.onmousedown = (e) => {
      if (e.button === 2) {
        // 右ボタンドラッグ: パン
        this.isPanning = true;
        this.panStartX = e.clientX - this.panX;
        this.panStartY = e.clientY - this.panY;
        return;
      }

      const world = toWorldPos(e.clientX, e.clientY);

      if (this.currentTool === 'add') {
        // 最も近い線分を見つけて間に挿入
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
      const clickThreshold = 18 / this.zoom;

      this.courseData.points.forEach((p, idx) => {
        const dist = Math.hypot(p.x - world.x, p.z - world.z);
        if (dist < clickThreshold) {
          clickedIdx = idx;
        }
      });

      this.selectedPointIdx = clickedIdx;
      this.draggingPointIdx = clickedIdx;
      this.render();
    };

    window.addEventListener('mousemove', (e) => {
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

    window.addEventListener('mouseup', () => {
      this.isPanning = false;
      this.draggingPointIdx = -1;
    });

    canvas.oncontextmenu = (e) => e.preventDefault();

    canvas.onwheel = (e) => {
      e.preventDefault();
      const zoomFactor = e.deltaY < 0 ? 1.12 : 0.89;
      this.zoom = Math.max(0.2, Math.min(2.5, this.zoom * zoomFactor));
      this.render();
    };
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

  show() {
    this.modalEl.classList.remove('hidden');
    this.render();
  }

  hide() {
    this.modalEl.classList.add('hidden');
  }

  render() {
    if (!this.ctx || !this.canvas) return;
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

      ctx.beginPath();
      ctx.arc(px, py, isSelected ? 8 : 6, 0, Math.PI * 2);
      ctx.fillStyle = isSelected ? '#ef4444' : '#38bdf8';
      ctx.fill();
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 2;
      ctx.stroke();

      ctx.fillStyle = '#ffffff';
      ctx.font = '10px sans-serif';
      ctx.fillText(idx + 1, px + 8, py - 4);
    });
  }
}
