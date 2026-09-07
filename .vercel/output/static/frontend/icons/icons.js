// frontend/icons/icons.js
// アイテムやUI用のアイコン描画・SVGデータ定義モジュール

export const Icons = {
  svgs: {
    mushroom: `<svg viewBox="0 0 100 100" width="100%" height="100%">
      <path d="M10 55 C10 20 90 20 90 55 C90 65 80 65 75 65 C65 65 65 85 55 85 C45 85 45 65 25 65 C15 65 10 65 10 55 Z" fill="#e74c3c"/>
      <ellipse cx="50" cy="35" rx="15" ry="12" fill="#ffffff"/>
      <ellipse cx="22" cy="48" rx="8" ry="12" fill="#ffffff"/>
      <ellipse cx="78" cy="48" rx="8" ry="12" fill="#ffffff"/>
      <path d="M35 65 C35 90 65 90 65 65" fill="#f5cd79" stroke="#333" stroke-width="3"/>
      <ellipse cx="43" cy="72" rx="2" ry="5" fill="#333"/>
      <ellipse cx="57" cy="72" rx="2" ry="5" fill="#333"/>
    </svg>`,

    triple_mushroom: `<svg viewBox="0 0 100 100" width="100%" height="100%">
      <g transform="translate(0, 8) scale(0.65)">
        <path d="M10 55 C10 20 90 20 90 55 C90 65 80 65 75 65 C65 65 65 85 55 85 C45 85 45 65 25 65 C15 65 10 65 10 55 Z" fill="#e67e22"/>
        <ellipse cx="50" cy="35" rx="15" ry="12" fill="#ffffff"/>
      </g>
      <g transform="translate(35, 8) scale(0.65)">
        <path d="M10 55 C10 20 90 20 90 55 C90 65 80 65 75 65 C65 65 65 85 55 85 C45 85 45 65 25 65 C15 65 10 65 10 55 Z" fill="#e67e22"/>
        <ellipse cx="50" cy="35" rx="15" ry="12" fill="#ffffff"/>
      </g>
      <g transform="translate(18, -2) scale(0.65)">
        <path d="M10 55 C10 20 90 20 90 55 C90 65 80 65 75 65 C65 65 65 85 55 85 C45 85 45 65 25 65 C15 65 10 65 10 55 Z" fill="#e74c3c"/>
        <ellipse cx="50" cy="35" rx="15" ry="12" fill="#ffffff"/>
        <ellipse cx="22" cy="48" rx="8" ry="12" fill="#ffffff"/>
        <ellipse cx="78" cy="48" rx="8" ry="12" fill="#ffffff"/>
      </g>
      <text x="50" y="96" font-size="28" font-weight="900" fill="#fff" text-anchor="middle">×3</text>
    </svg>`,

    green_shell: `<svg viewBox="0 0 100 100" width="100%" height="100%">
      <ellipse cx="50" cy="50" rx="42" ry="36" fill="#2ecc71" stroke="#27ae60" stroke-width="4"/>
      <ellipse cx="50" cy="50" rx="26" ry="22" fill="#27ae60"/>
      <path d="M15 50 Q50 30 85 50" stroke="#fff" stroke-width="3" fill="none"/>
      <path d="M25 65 Q50 50 75 65" stroke="#fff" stroke-width="3" fill="none"/>
      <path d="M8 58 Q50 75 92 58" fill="#ecf0f1" stroke="#bdc3c7" stroke-width="3"/>
    </svg>`,

    red_shell: `<svg viewBox="0 0 100 100" width="100%" height="100%">
      <ellipse cx="50" cy="50" rx="42" ry="36" fill="#e74c3c" stroke="#c0392b" stroke-width="4"/>
      <ellipse cx="50" cy="50" rx="26" ry="22" fill="#c0392b"/>
      <path d="M15 50 Q50 30 85 50" stroke="#fff" stroke-width="3" fill="none"/>
      <path d="M25 65 Q50 50 75 65" stroke="#fff" stroke-width="3" fill="none"/>
      <path d="M8 58 Q50 75 92 58" fill="#ecf0f1" stroke="#bdc3c7" stroke-width="3"/>
    </svg>`,

    blue_shell: `<svg viewBox="0 0 100 100" width="100%" height="100%">
      <ellipse cx="50" cy="50" rx="42" ry="36" fill="#2980b9" stroke="#1c5980" stroke-width="4"/>
      <ellipse cx="50" cy="50" rx="26" ry="22" fill="#3498db"/>
      <!-- トゲ -->
      <polygon points="50,6 45,22 55,22" fill="#ffffff"/>
      <polygon points="20,24 28,36 36,30" fill="#ffffff"/>
      <polygon points="80,24 64,30 72,36" fill="#ffffff"/>
      <path d="M8 58 Q50 75 92 58" fill="#ecf0f1" stroke="#bdc3c7" stroke-width="3"/>
      <!-- 羽 -->
      <path d="M12 40 C-8 30 -5 10 16 22 Z" fill="#ffffff" stroke="#bdc3c7" stroke-width="2"/>
      <path d="M88 40 C108 30 105 10 84 22 Z" fill="#ffffff" stroke="#bdc3c7" stroke-width="2"/>
    </svg>`,

    banana: `<svg viewBox="0 0 100 100" width="100%" height="100%">
      <path d="M20 75 C25 20 70 20 85 35 C70 45 45 45 35 75 C30 82 20 82 20 75 Z" fill="#f1c40f" stroke="#d4ac0d" stroke-width="3"/>
      <path d="M85 35 L92 32 L88 38 Z" fill="#784212"/>
      <path d="M20 75 L16 82 L22 84 Z" fill="#27ae60"/>
      <ellipse cx="50" cy="35" rx="3" ry="8" fill="#333" transform="rotate(-30 50 35)"/>
    </svg>`,

    triple_banana: `<svg viewBox="0 0 100 100" width="100%" height="100%">
      <g transform="translate(-10, 10) scale(0.65)">
        <path d="M20 75 C25 20 70 20 85 35 C70 45 45 45 35 75 C30 82 20 82 20 75 Z" fill="#f1c40f" stroke="#d4ac0d" stroke-width="3"/>
      </g>
      <g transform="translate(40, 10) scale(0.65)">
        <path d="M20 75 C25 20 70 20 85 35 C70 45 45 45 35 75 C30 82 20 82 20 75 Z" fill="#f1c40f" stroke="#d4ac0d" stroke-width="3"/>
      </g>
      <g transform="translate(15, -6) scale(0.65)">
        <path d="M20 75 C25 20 70 20 85 35 C70 45 45 45 35 75 C30 82 20 82 20 75 Z" fill="#f1c40f" stroke="#d4ac0d" stroke-width="3"/>
        <path d="M85 35 L92 32 L88 38 Z" fill="#784212"/>
        <path d="M20 75 L16 82 L22 84 Z" fill="#27ae60"/>
      </g>
      <text x="50" y="96" font-size="28" font-weight="900" fill="#fff" text-anchor="middle">×3</text>
    </svg>`,

    bobomb: `<svg viewBox="0 0 100 100" width="100%" height="100%">
      <circle cx="50" cy="55" r="36" fill="#1e293b" stroke="#0f172a" stroke-width="4"/>
      <!-- 目 -->
      <ellipse cx="40" cy="50" rx="3.5" ry="9" fill="#ffffff"/>
      <ellipse cx="60" cy="50" rx="3.5" ry="9" fill="#ffffff"/>
      <!-- 導火線 -->
      <rect x="44" y="14" width="12" height="8" rx="2" fill="#718096"/>
      <path d="M50 14 Q52 4 60 6" stroke="#d97706" stroke-width="4" fill="none"/>
      <circle cx="62" cy="6" r="4" fill="#ef4444"/>
      <!-- ネジ巻き -->
      <polygon points="50,91 42,98 58,98" fill="#f59e0b"/>
    </svg>`,

    star: `<svg viewBox="0 0 100 100" width="100%" height="100%">
      <polygon points="50,5 64,36 98,36 70,57 81,91 50,70 19,91 30,57 2,36 36,36" fill="#f1c40f" stroke="#f39c12" stroke-width="4"/>
      <ellipse cx="40" cy="45" rx="3" ry="8" fill="#2c3e50"/>
      <ellipse cx="60" cy="45" rx="3" ry="8" fill="#2c3e50"/>
    </svg>`,

    lightning: `<svg viewBox="0 0 100 100" width="100%" height="100%">
      <polygon points="58,4 22,54 50,54 42,96 78,44 50,44" fill="#f59e0b" stroke="#d97706" stroke-width="3"/>
    </svg>`,

    steering_wheel: `<svg viewBox="0 0 100 100" width="100%" height="100%">
      <circle cx="50" cy="50" r="42" fill="none" stroke="#ecf0f1" stroke-width="10"/>
      <circle cx="50" cy="50" r="16" fill="#e74c3c"/>
      <line x1="8" y1="50" x2="34" y2="50" stroke="#ecf0f1" stroke-width="8"/>
      <line x1="66" y1="50" x2="92" y2="50" stroke="#ecf0f1" stroke-width="8"/>
      <line x1="50" y1="66" x2="50" y2="92" stroke="#ecf0f1" stroke-width="8"/>
    </svg>`,

    gyro: `<svg viewBox="0 0 100 100" width="100%" height="100%">
      <rect x="25" y="15" width="50" height="70" rx="8" fill="#34495e" stroke="#ecf0f1" stroke-width="4"/>
      <line x1="30" y1="20" x2="70" y2="20" stroke="#7f8c8d" stroke-width="2"/>
      <circle cx="50" cy="78" r="4" fill="#ecf0f1"/>
      <path d="M10 50 A 42 42 0 0 1 90 50" fill="none" stroke="#e67e22" stroke-width="4" stroke-dasharray="6,6"/>
      <polygon points="90,45 96,55 86,55" fill="#e67e22"/>
    </svg>`,

    gear: `<svg viewBox="0 0 100 100" width="100%" height="100%">
      <circle cx="50" cy="50" r="20" fill="none" stroke="#ecf0f1" stroke-width="12"/>
      <path d="M50 10 L50 25 M50 75 L50 90 M10 50 L25 50 M75 50 L90 50 M22 22 L33 33 M67 67 L78 78 M78 22 L67 33 M33 67 L22 78" stroke="#ecf0f1" stroke-width="10" stroke-linecap="round"/>
    </svg>`,

    pause: `<svg viewBox="0 0 100 100" width="100%" height="100%">
      <rect x="24" y="20" width="18" height="60" rx="6" fill="#ecf0f1"/>
      <rect x="58" y="20" width="18" height="60" rx="6" fill="#ecf0f1"/>
    </svg>`,

    rotate: `<svg viewBox="0 0 100 100" width="100%" height="100%">
      <path d="M50 15 A35 35 0 1 1 20 35" fill="none" stroke="#ecf0f1" stroke-width="8" stroke-linecap="round"/>
      <polygon points="10,20 20,40 38,28" fill="#ecf0f1"/>
      <rect x="42" y="38" width="16" height="24" rx="3" fill="none" stroke="#f59e0b" stroke-width="4"/>
    </svg>`
  },

  getSvg(name) {
    return this.svgs[name] || '';
  }
};
