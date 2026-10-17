import { UPDATE_NOTIFICATION } from '../data/updates.js';

// 公開Issue向けの許可リスト。UA全文、URL、ルームID、保存データ、例外本文は採取しない。
export function collectFeedbackContext() {
  const ua = navigator.userAgent || '';
  let browser = 'Other', browserMajor;
  for (const [name, pattern] of [['Edge', /Edg(?:e|A|iOS)?\/(\d+)/], ['Opera', /OPR\/(\d+)/], ['Firefox', /(?:Firefox|FxiOS)\/(\d+)/], ['Chrome', /(?:Chrome|CriOS)\/(\d+)/], ['Safari', /Version\/(\d+).*Safari/]]) {
    const match = ua.match(pattern); if (match) { browser = name; browserMajor = Number(match[1]); break; }
  }
  let os = 'Other', osMajor;
  for (const [name, pattern] of [['Android', /Android\s+(\d+)/], ['iOS', /(?:iPhone OS|CPU OS)\s+(\d+)/], ['Windows', /Windows NT\s+(\d+)/], ['macOS', /Mac OS X\s+(\d+)/]]) {
    const match = ua.match(pattern); if (match) { os = name; osMajor = Number(match[1]); break; }
  }
  if (os === 'Other' && /Linux/.test(ua)) os = 'Linux';
  const game = window.gameInstance;
  const screenName = game?.activeResultModal ? 'result' : game?.isRunning ? (game.isPaused ? 'pause' : 'race') : game?.lobbyModal?.screen || 'startup';
  const allowedScreens = ['startup', 'home', 'solo', 'room', 'vehicle-detail', 'race', 'pause', 'result'];
  const courseId = game?.currentGameConfig?.courseId;
  const finite = value => Number.isFinite(value) ? Math.round(value * 100) / 100 : undefined;
  const helper = document.createElement('div');
  helper.style.cssText = 'position:fixed;visibility:hidden;pointer-events:none;padding:env(safe-area-inset-top) env(safe-area-inset-right) env(safe-area-inset-bottom) env(safe-area-inset-left)';
  document.body.append(helper); const style = getComputedStyle(helper);
  const safeArea = ['Top', 'Right', 'Bottom', 'Left'].map(side => finite(parseFloat(style[`padding${side}`])) || 0); helper.remove();
  return {
    schema: 1, appVersion: UPDATE_NOTIFICATION.version, browser, browserMajor, os, osMajor,
    screen: allowedScreens.includes(screenName) ? screenName : 'startup',
    mode: game?.p2p?.roomId ? 'multiplayer' : 'solo',
    course: /^course[1-7]$/.test(courseId || '') ? courseId : courseId ? 'custom' : 'none',
    control: ['gyro', 'stick'].includes(game?.inputManager?.controlMode) ? game.inputManager.controlMode : 'unknown',
    quality: ['high', 'normal', 'low'].includes(game?.renderer?.graphicQuality) ? game.renderer.graphicQuality : 'unknown',
    viewportWidth: finite(innerWidth), viewportHeight: finite(innerHeight),
    visualWidth: finite(window.visualViewport?.width), visualHeight: finite(window.visualViewport?.height),
    effectiveWidth: finite(window.deviceInfo?.effectiveWidth), effectiveHeight: finite(window.deviceInfo?.effectiveHeight),
    dpr: finite(devicePixelRatio), safeTop: safeArea[0], safeRight: safeArea[1], safeBottom: safeArea[2], safeLeft: safeArea[3],
    cssLandscape: document.body.classList.contains('force-landscape'), reverse: document.body.classList.contains('rotate-reverse'),
    standalone: navigator.standalone === true || matchMedia('(display-mode: standalone)').matches,
    nativeOrientation: ['portrait-primary', 'portrait-secondary', 'landscape-primary', 'landscape-secondary'].includes(screen.orientation?.type) ? screen.orientation.type : 'unknown',
    fullscreen: !!document.fullscreenElement, fullscreenAvailable: typeof document.documentElement.requestFullscreen === 'function' || typeof document.documentElement.webkitRequestFullscreen === 'function',
    orientationLockAvailable: typeof screen.orientation?.lock === 'function',
    autoAccelerate: game?.inputManager?.autoAccelerate === true
  };
}
