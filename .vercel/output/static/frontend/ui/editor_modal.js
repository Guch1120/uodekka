// frontend/ui/editor_modal.js
// マリオメーカー風 コースエディタ (Course Maker)
// コースレーンのスプライン頂点追加・移動・削除、ダッシュボード・アイテムボックス・障害物配置、テスト走行
import * as THREE from 'https://unpkg.com/three@0.160.0/build/three.module.js';

import { courseCurve, elevationProfile } from '../courses/course_curve.js';
import { EditorPreview } from './editor_preview.js';
import { AudioManager } from '../audio/audio_manager.js';

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
      dashPanels: [0.35, 0.65],
      jumpRamps: [
        { t: 0.50, type: 'standard' }
      ],
      tireWallSegments: [
        { start: 0.05, end: 0.38, side: 'both' },
        { start: 0.45, end: 0.72, side: 'both' },
        { start: 0.80, end: 0.96, side: 'both' }
      ]
    };

    this.selectedPointIdx = -1;
    this.draggingPointIdx = -1;
    this.currentTool = 'move'; // 'move', 'add_point', 'dash_panel', 'item_box', 'wall'
    this.zoom = 0.8;
    this.panX = 0;
    this.panY = 0;
    this.isPanning = false;
    this.panStartX = 0;
    this.panStartY = 0;

    this.viewMode = 'preview';
    this.history = [];
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
        <nav class="editor-views" aria-label="コースの表示切替">
          <button data-view="preview" class="editor-tool-btn active">3Dプレビュー</button>
          <button data-view="plan" class="editor-tool-btn">上から編集</button>
          <button data-view="height" class="editor-tool-btn">高さを編集</button>
          <button id="editor-undo" class="editor-tool-btn">↶ 元に戻す</button>
          <button id="editor-fit" class="editor-tool-btn">全体を表示</button>
        </nav>
        <div class="editor-toolbar">
          <div class="tool-group">
            <button id="tool-move" class="editor-tool-btn active" title="選択・移動">👆 頂点移動</button>
            <button id="tool-add" class="editor-tool-btn" title="コース上のクリック位置に頂点を追加">➕ 頂点追加</button>
            <button id="tool-del" class="editor-tool-btn" title="選択中の頂点を削除">🗑️ 頂点削除</button>
          </div>
          <div class="tool-group">
            <button id="tool-dash" class="editor-tool-btn" title="ダッシュボード（加速床）の追加">⚡ ダッシュ板配置</button>
            <button id="tool-item" class="editor-tool-btn" title="アイテムボックス地点の追加">🎁 アイテム箱配置</button>
            <button id="tool-wall" class="editor-tool-btn" title="コース上の区間をクリックしてタイヤ壁/切れ目(コースアウト)を切替">🛡️ タイヤ壁/切替</button>
            <button id="tool-jump" class="editor-tool-btn" title="通常ジャンプ台の追加">⤹ ジャンプ台</button>
            <button id="tool-glider" class="editor-tool-btn" title="滑走ジャンプ台（グライダー）の追加">🪂 滑走ジャンプ台</button>
          </div>

        </div>
        <details class="editor-options"><summary>コース設定・保存コース</summary>
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
          <label>保存コース <select id="editor-saved" class="editor-select"><option value="">選択してください</option></select></label>
          <button id="editor-load" class="editor-tool-btn">読み込み</button>
        </details>
        <div class="editor-inspector">
          <label>選択頂点 <select id="editor-point" class="editor-select"></select></label>
          <label>高さ <input id="editor-height" type="number" min="0" max="120" step="1" value="0"> m</label>
          <button id="editor-flatten" class="editor-tool-btn">すべて平らにする</button>

        </div>
        <div id="editor-status" role="status" aria-live="polite"></div>
        <div class="editor-canvas-container">
          <div id="editor-preview" hidden></div>
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

    this.modalEl.querySelectorAll('[data-view]').forEach(button => {
      button.onclick = () => this.setView(button.dataset.view);
    });
    this.modalEl.querySelector('#editor-undo').onclick = () => {
      if (!this.history.length) return;
      const current = JSON.stringify(this.courseData);
      while (this.history.length && JSON.stringify(this.history.at(-1)) === current) this.history.pop();
      if (!this.history.length) { this.render(); return; }
      this.courseData = this.history.pop();
      this.selectedPointIdx = Math.min(this.selectedPointIdx, this.courseData.points.length - 1);
      this.syncInputs(); this.render();
    };
    this.modalEl.querySelector('#editor-fit').onclick = () => this.fitView();
    this.modalEl.querySelector('#editor-point').onchange = e => { this.selectedPointIdx = Number(e.target.value); this.render(); };
    this.modalEl.querySelector('#editor-height').onchange = e => {
      const value = Number(e.target.value);
      if (this.selectedPointIdx < 0 || !Number.isFinite(value)) return;
      this.remember(); this.courseData.points[this.selectedPointIdx].y = Math.max(0, Math.min(120, value)); this.render();
    };
    this.modalEl.querySelector('#editor-flatten').onclick = () => {
      this.remember(); this.courseData.points.forEach(p => p.y = 0); this.render();
    };
    this.modalEl.querySelector('#editor-load').onclick = () => this.loadCourse();
    ['keydown', 'keyup', 'touchstart', 'touchend'].forEach(type => modal.addEventListener(type, e => e.stopPropagation()));
    this.bindHeightEvents();
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
        this.remember(); this.resetDefault();
      }
    };

    btnSave.onclick = () => {
      if (this.saveCourse()) this.setStatus('保存しました。ソロゲームのコース一覧から選べます。');
    };

    btnTest.onclick = () => {
      if (!this.saveCourse()) return;
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
      item: modal.querySelector('#tool-item'),
      wall: modal.querySelector('#tool-wall'),
      jump: modal.querySelector('#tool-jump'),
      glider: modal.querySelector('#tool-glider')
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
    toolBtns.wall.onclick = () => setTool('wall');
    toolBtns.jump.onclick = () => setTool('jump');
    toolBtns.glider.onclick = () => setTool('glider');

    toolBtns.del.onclick = () => {
      if (this.selectedPointIdx >= 0 && this.courseData.points.length > 4) {
        this.remember();
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
      this.remember();
      this.courseData.name = nameInput.value.trim() || 'カスタムコース';
    };

    const widthSelect = modal.querySelector('#editor-track-width');
    widthSelect.onchange = () => {
      this.remember();
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
      if (this.viewMode !== 'plan') return;
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
        this.remember();
        this.insertPointNear(world.x, world.z);
        this.render();
        return;
      }

      if (this.currentTool === 'dash') {
        this.remember();
        const t = this.findNearestSplineT(world.x, world.z);
        this.courseData.dashPanels.push(t);
        this.render();
        return;
      }

      if (this.currentTool === 'item') {
        this.remember();
        const t = this.findNearestSplineT(world.x, world.z);
        this.courseData.itemBoxLocations.push(t);
        this.render();
        return;
      }

      if (this.currentTool === 'wall') {
        this.remember();
        const t = this.findNearestSplineT(world.x, world.z);
        this.toggleTireWallSegment(t);
        this.render();
        return;
      }

      if (this.currentTool === 'jump') {
        this.remember();
        const t = this.findNearestSplineT(world.x, world.z);
        this.courseData.jumpRamps = this.courseData.jumpRamps || [];
        this.courseData.jumpRamps.push({ t, type: 'standard' });
        this.render();
        return;
      }

      if (this.currentTool === 'glider') {
        this.remember();
        const t = this.findNearestSplineT(world.x, world.z);
        this.courseData.jumpRamps = this.courseData.jumpRamps || [];
        this.courseData.jumpRamps.push({ t, type: 'glider' });
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
        this.remember();
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
      if (this.viewMode !== 'plan' || !activePointers.has(e.pointerId)) return;
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
    canvas.addEventListener('lostpointercapture', endPointer);

    canvas.oncontextmenu = (e) => e.preventDefault();

    canvas.onwheel = (e) => {
      if (this.viewMode !== 'plan') return;
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

  remember() {
    const snapshot = JSON.stringify(this.courseData);
    if (JSON.stringify(this.history.at(-1)) !== snapshot) this.history.push(JSON.parse(snapshot));
    if (this.history.length > 50) this.history.shift();
  }

  setStatus(message) { this.modalEl.querySelector('#editor-status').textContent = message; }

  syncInputs() {
    this.modalEl.querySelector('#editor-course-name').value = this.courseData.name;
    this.modalEl.querySelector('#editor-track-width').value = this.courseData.trackWidth;
  }

  refreshSaved() {
    const select = this.modalEl.querySelector('#editor-saved');
    select.replaceChildren(new Option('選択してください', ''));
    try {
      const saved = JSON.parse(localStorage.getItem('kart_custom_courses') || '{}');
      Object.values(saved).filter(c => c.id?.startsWith('custom_')).forEach(c => select.add(new Option(c.name, c.id)));
    } catch { this.setStatus('保存データを読み取れませんでした。'); }
  }

  loadCourse() {
    const id = this.modalEl.querySelector('#editor-saved').value;
    if (!id) { this.setStatus('読み込むコースを選択してください。'); return; }
    try {
      const raw = JSON.parse(localStorage.getItem('kart_custom_courses') || '{}')[id];
      if (!raw || !Array.isArray(raw.points) || raw.points.length < 4 ||
          raw.points.some(p => !Number.isFinite(p.x) || !Number.isFinite(p.z))) throw new Error();
      this.remember();
      this.courseData = { ...raw, points: raw.points.map(p => ({ ...p, y: Number.isFinite(p.y) ? p.y : 0 })),
        itemBoxLocations: raw.itemBoxLocations || [], dashPanels: raw.dashPanels || [], jumpRamps: raw.jumpRamps || [], tireWallSegments: raw.tireWallSegments || [] };
      this.selectedPointIdx = 0; this.syncInputs(); this.fitView(); this.render();
      this.setStatus('保存コースを読み込みました。保存すると同じコースを更新します。');
    } catch { this.setStatus('このコースは読み込めませんでした。'); }
  }

  setView(mode) {
    this.viewMode = mode; this.draggingPointIdx = -1; this.isPanning = false;
    this.modalEl.querySelectorAll('[data-view]').forEach(b => {
      b.classList.toggle('active', b.dataset.view === mode);
      b.setAttribute('aria-pressed', String(b.dataset.view === mode));
    });
    this.modalEl.querySelectorAll('#tool-move, #tool-add, #tool-del, #tool-dash, #tool-item, #tool-wall, #tool-jump, #tool-glider')
      .forEach(b => b.disabled = mode !== 'plan');
    this.modalEl.querySelector('.editor-toolbar').hidden = mode !== 'plan';
    this.canvas.hidden = mode === 'preview';
    const container = this.modalEl.querySelector('#editor-preview');
    container.hidden = mode !== 'preview';
    if (mode === 'preview' && !this.preview) {
      this.preview = new EditorPreview(container);
      this.preview.update(this.courseData, this.selectedPointIdx, true);
    }
    this.modalEl.querySelector('.editor-help-text').textContent = {
      preview: 'ドラッグで回転 / ピンチ・ホイールで拡大縮小。編集は上のボタンで切り替え。',
      plan: '頂点をドラッグで移動 / 2本指でパン・ズーム / マウス右ドラッグで移動',
      height: '点を上下にドラッグして高さを変更。右端のゴールはスタートと同じ頂点です。'
    }[mode];
    this.render();
  }

  fitView() {
    this.resizeCanvas();
    const xs = this.courseData.points.map(p => p.x), zs = this.courseData.points.map(p => p.z);
    this.zoom = Math.max(0.1, Math.min(2.5,
      (this.canvas.width - 100) / (Math.max(...xs) - Math.min(...xs) + 50),
      (this.canvas.height - 100) / (Math.max(...zs) - Math.min(...zs) + 50)));
    this.panX = -(Math.min(...xs) + Math.max(...xs)) / 2 * this.zoom;
    this.panY = -(Math.min(...zs) + Math.max(...zs)) / 2 * this.zoom;
    if (this.preview) this.preview.update(this.courseData, this.selectedPointIdx, true);
    this.render();
  }

  syncInspector() {
    const select = this.modalEl.querySelector('#editor-point');
    if (select.options.length !== this.courseData.points.length + 1) {
      select.replaceChildren(new Option('未選択', '-1'));
      this.courseData.points.forEach((p, i) => select.add(new Option(i === 0 ? '1 · START / GOAL' : String(i + 1), String(i))));
    }
    select.value = String(this.selectedPointIdx);
    const input = this.modalEl.querySelector('#editor-height');
    input.disabled = this.selectedPointIdx < 0;
    input.value = this.courseData.points[this.selectedPointIdx]?.y || 0;
    this.modalEl.querySelector('#editor-undo').disabled = !this.history.length;
  }

  profileLayout() {
    const profile = elevationProfile(this.courseData.points);
    const left = 48, right = this.canvas.width - 30, top = 35, bottom = this.canvas.height - 85;
    // Fixed height scale keeps points under the pointer during a drag.
    return { ...profile, left, right, top, bottom,
      x: d => left + d / Math.max(1, profile.length) * (right - left),
      y: h => bottom - h / 120 * (bottom - top) };
  }

  renderProfile() {
    const ctx = this.ctx, w = this.canvas.width, h = this.canvas.height;
    const plot = this.profileLayout();
    ctx.fillStyle = '#0f172a'; ctx.fillRect(0, 0, w, h);
    ctx.font = '12px sans-serif';
    for (let height = 0; height <= 120; height += 30) {
      const y = plot.y(height);
      ctx.strokeStyle = '#334155'; ctx.beginPath(); ctx.moveTo(plot.left, y); ctx.lineTo(plot.right, y); ctx.stroke();
      ctx.fillStyle = '#a8bfd0'; ctx.fillText(height + 'm', 4, y + 4);
    }
    for (let i = 0; i <= 4; i++) {
      ctx.fillStyle = '#a8bfd0';
      ctx.fillText(Math.round(plot.length * i / 4) + 'm', plot.x(plot.length * i / 4) - 14, plot.bottom + 24);
    }
    ctx.strokeStyle = '#70d6ff'; ctx.lineWidth = 3; ctx.beginPath();
    plot.samples.forEach((p, i) => { const x = plot.x(p.distance), y = plot.y(p.height); if (i) ctx.lineTo(x, y); else ctx.moveTo(x, y); });
    ctx.stroke();
    [...this.courseData.points, this.courseData.points[0]].forEach((p, i) => {
      const selected = i % this.courseData.points.length === this.selectedPointIdx;
      const x = plot.x(plot.distances[i]), y = plot.y(p.y || 0);
      ctx.beginPath(); ctx.arc(x, y, selected ? 9 : 7, 0, Math.PI * 2);
      ctx.fillStyle = selected ? '#ff773e' : '#70d6ff'; ctx.fill();
      ctx.strokeStyle = '#fff'; ctx.lineWidth = 2; ctx.stroke();
      ctx.fillStyle = '#fff';
      ctx.fillText(i === this.courseData.points.length ? 'GOAL' : i === 0 ? 'START' : String(i + 1), x - 12, y - 13);
    });
    ctx.fillStyle = plot.maxGrade > 0.35 ? '#ffbe83' : '#a8bfd0';
    ctx.fillText('距離 ' + Math.round(plot.length) + 'm / 最大勾配 ' + Math.round(plot.maxGrade * 100) + '%' +
      (plot.maxGrade > 0.35 ? ' · 急坂です。テスト走行で確認' : ''), plot.left, 17);
  }

  bindHeightEvents() {
    const canvas = this.canvas;
    let pointer = null, plot = null;
    canvas.addEventListener('pointerdown', e => {
      if (this.viewMode !== 'height') return;
      e.preventDefault();
      if (pointer !== null) return;
      const rect = canvas.getBoundingClientRect(), x = e.clientX - rect.left, y = e.clientY - rect.top;
      plot = this.profileLayout();
      let nearest = -1, distance = e.pointerType === 'touch' ? 32 : 22;
      [...this.courseData.points, this.courseData.points[0]].forEach((p, i) => {
        const d = Math.hypot(x - plot.x(plot.distances[i]), y - plot.y(p.y || 0));
        if (d < distance) { nearest = i % this.courseData.points.length; distance = d; }
      });
      if (nearest < 0) return;
      this.remember(); this.selectedPointIdx = nearest; pointer = e.pointerId;
      canvas.setPointerCapture(pointer); this.render();
    });
    canvas.addEventListener('pointermove', e => {
      if (this.viewMode !== 'height' || pointer !== e.pointerId) return;
      const y = e.clientY - canvas.getBoundingClientRect().top;
      this.courseData.points[this.selectedPointIdx].y = Math.round(Math.max(0, Math.min(120, (plot.bottom - y) / (plot.bottom - plot.top) * 120)));
      this.render();
    });
    const end = e => { if (pointer === e.pointerId) pointer = null; };
    canvas.addEventListener('pointerup', end); canvas.addEventListener('pointercancel', end); canvas.addEventListener('lostpointercapture', end);
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
    this.courseData.jumpRamps = [
      { t: 0.50, type: 'standard' }
    ];
    this.courseData.tireWallSegments = [
      { start: 0.05, end: 0.38, side: 'both' },
      { start: 0.45, end: 0.72, side: 'both' },
      { start: 0.80, end: 0.96, side: 'both' }
    ];
    this.selectedPointIdx = -1;
    this.render();
  }

  /**
   * クリックしたスプライン位置 t にタイヤ壁があるか判定し、壁の追加/削除（切れ目作成）をトグルする
   */
  toggleTireWallSegment(clickT) {
    if (!this.courseData.tireWallSegments) {
      this.courseData.tireWallSegments = [];
    }

    const segments = this.courseData.tireWallSegments;
    let foundIdx = -1;

    for (let i = 0; i < segments.length; i++) {
      const seg = segments[i];
      if (seg.start <= seg.end) {
        if (clickT >= seg.start && clickT <= seg.end) {
          foundIdx = i;
          break;
        }
      } else {
        if (clickT >= seg.start || clickT <= seg.end) {
          foundIdx = i;
          break;
        }
      }
    }

    if (foundIdx >= 0) {
      // 既存の壁区間内をクリックした場合：そのセグメントを解除（切れ目・コースアウト区間を作成）
      segments.splice(foundIdx, 1);
    } else {
      // 切れ目区画をクリックした場合：その周辺（前後 0.08、計約 16% 幅）に新たなタイヤ壁セグメントを新設
      let s = Math.round((clickT - 0.07) * 100) / 100;
      let e = Math.round((clickT + 0.07) * 100) / 100;
      if (s < 0) s += 1.0;
      if (e > 1) e -= 1.0;
      segments.push({ start: s, end: e, side: 'both' });
    }
  }

  findNearestSplineT(x, z) {
    const curve = courseCurve(this.courseData);
    let bestT = 0;
    let minDist = Infinity;

    for (let i = 0; i <= 100; i++) {
      const t = i / 100;
      const pt = curve.getPointAt(t);
      const d = (x - pt.x) ** 2 + (z - pt.z) ** 2;
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

    const a = pts[(bestIdx - 1 + pts.length) % pts.length], b = pts[bestIdx % pts.length];
    pts.splice(bestIdx, 0, { x: Math.round(x), y: ((a.y || 0) + (b.y || 0)) / 2, z: Math.round(z) });
    this.selectedPointIdx = bestIdx;
  }

  saveCourse() {
    try {
      this.courseData.name = this.modalEl.querySelector('#editor-course-name').value.trim() || 'カスタムコース';
      const saved = localStorage.getItem('kart_custom_courses') || '{}';
      const dict = JSON.parse(saved);
      dict[this.courseData.id] = this.courseData;
      localStorage.setItem('kart_custom_courses', JSON.stringify(dict));
      this.refreshSaved();
      return true;
    } catch (e) {
      this.setStatus('保存できませんでした。ブラウザの保存容量・設定を確認してください。');
      return false;
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
    this.refreshSaved();
    AudioManager.playBgm('editor');
    // コンテナの実際の寸法に合わせて描画バッファ解像度をフィット
    requestAnimationFrame(() => {
      this.resizeCanvas();
      this.fitView();
      this.setView(this.viewMode);
    });
  }

  hide() {
    this.modalEl.classList.add('hidden');
    AudioManager.playBgm('menu');
  }

  render() {
    if (!this.ctx || !this.canvas) return;
    this.resizeCanvas();
    this.syncInspector();
    if (this.viewMode === 'preview') {
      if (this.preview) this.preview.update(this.courseData, this.selectedPointIdx);
      return;
    }
    if (this.viewMode === 'height') { this.renderProfile(); return; }
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
    const curve = courseCurve(this.courseData);
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

    // 1.5. タイヤウォール（防護壁）およびコースアウト切れ目の描画
    const wallSegments = this.courseData.tireWallSegments || [
      { start: 0.05, end: 0.38, side: 'both' },
      { start: 0.45, end: 0.72, side: 'both' },
      { start: 0.80, end: 0.96, side: 'both' }
    ];

    const isInsideWall = (t) => {
      for (const seg of wallSegments) {
        if (seg.start <= seg.end) {
          if (t >= seg.start && t <= seg.end) return true;
        } else {
          if (t >= seg.start || t <= seg.end) return true;
        }
      }
      return false;
    };

    // 内側・外側の境界線上を細かくサンプリングしてタイヤ壁（赤白ブロック）を描画
    const wallSteps = 120;
    const upVec = new THREE.Vector3(0, 1, 0);

    [-1, 1].forEach(sideMultiplier => {
      for (let i = 0; i < wallSteps; i++) {
        const t1 = i / wallSteps;
        const t2 = (i + 1) / wallSteps;

        const p1 = curve.getPointAt(t1);
        const tan1 = curve.getTangentAt(t1).normalize();
        const norm1 = new THREE.Vector3().crossVectors(tan1, upVec).normalize();
        const edge1 = p1.clone().addScaledVector(norm1, sideMultiplier * (this.courseData.trackWidth / 2));

        const p2 = curve.getPointAt(t2);
        const tan2 = curve.getTangentAt(t2).normalize();
        const norm2 = new THREE.Vector3().crossVectors(tan2, upVec).normalize();
        const edge2 = p2.clone().addScaledVector(norm2, sideMultiplier * (this.courseData.trackWidth / 2));

        const hasWall = isInsideWall((t1 + t2) / 2);

        ctx.beginPath();
        ctx.moveTo(toScreenX(edge1.x), toScreenY(edge1.z));
        ctx.lineTo(toScreenX(edge2.x), toScreenY(edge2.z));

        if (hasWall) {
          // タイヤウォール区間: 赤白交互の防護壁ボーダー (太さ 5px)
          ctx.lineWidth = 5;
          ctx.strokeStyle = (i % 2 === 0) ? '#ef4444' : '#f8fafc';
          ctx.stroke();
        } else {
          // 切れ目区間（コースアウト注意ゾーン）: 黄色と黒の注意破線
          ctx.lineWidth = 2.5;
          ctx.strokeStyle = 'rgba(234, 179, 8, 0.55)';
          ctx.setLineDash([4, 4]);
          ctx.stroke();
          ctx.setLineDash([]);
        }
      }
    });

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

    // 5. ジャンプ台 & 滑走ジャンプ台アイコン
    (this.courseData.jumpRamps || []).forEach(ramp => {
      const p = curve.getPointAt(ramp.t);
      const px = toScreenX(p.x);
      const py = toScreenY(p.z);
      const isGlider = ramp.type === 'glider';
      ctx.fillStyle = isGlider ? '#0284c7' : '#ea580c';
      ctx.beginPath();
      ctx.rect(px - 10, py - 9, 20, 18);
      ctx.fill();
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 1.5;
      ctx.stroke();
      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 11px sans-serif';
      ctx.fillText(isGlider ? '🪂' : '⤹', px - 6, py + 4);
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
