import js from '@eslint/js';

export default [
  js.configs.recommended,
  {
    files: ['js/**/*.js'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      globals: {
        // Browser globals
        window: 'readonly',
        document: 'readonly',
        console: 'readonly',
        alert: 'readonly',
        confirm: 'readonly',
        prompt: 'readonly',
        fetch: 'readonly',
        URL: 'readonly',
        Blob: 'readonly',
        File: 'readonly',
        FileReader: 'readonly',
        FormData: 'readonly',
        URLSearchParams: 'readonly',
        localStorage: 'readonly',
        sessionStorage: 'readonly',
        setTimeout: 'readonly',
        setInterval: 'readonly',
        clearTimeout: 'readonly',
        clearInterval: 'readonly',
        requestAnimationFrame: 'readonly',
        cancelAnimationFrame: 'readonly',
        MutationObserver: 'readonly',
        IntersectionObserver: 'readonly',
        ResizeObserver: 'readonly',
        CustomEvent: 'readonly',
        Event: 'readonly',
        HTMLElement: 'readonly',
        HTMLInputElement: 'readonly',
        HTMLSelectElement: 'readonly',
        DragEvent: 'readonly',
        DataTransfer: 'readonly',
        Navigator: 'readonly',
        navigator: 'readonly',
        location: 'readonly',
        history: 'readonly',
        performance: 'readonly',
        AbortController: 'readonly',
        ClipboardItem: 'readonly',
        Image: 'readonly',
        atob: 'readonly',
        btoa: 'readonly',
        structuredClone: 'readonly',
        // Third-party globals loaded via script tags
        XLSX: 'readonly',
        JSZip: 'readonly',
      },
    },
    rules: {
      // import漏れ・未定義変数の検出（fix率15%の根本原因）
      'no-undef': 'error',
      // 未使用変数の検出（リファクタリング時の残骸防止）
      'no-unused-vars': ['warn', {
        argsIgnorePattern: '^_',
        varsIgnorePattern: '^_',
        caughtErrorsIgnorePattern: '^_',
      }],
      // 重複宣言防止（失敗パターン #9）
      'no-redeclare': 'error',
      // null参照防止
      'no-constant-condition': 'warn',
      // その他の基本ルール
      'no-debugger': 'warn',
      'no-empty': ['warn', { allowEmptyCatch: true }],
      'no-irregular-whitespace': 'error',
      'no-unreachable': 'error',
      'no-unsafe-finally': 'error',
      'use-isnan': 'error',
      'valid-typeof': 'error',
      // ESLint v10新ルール: エラー再throwの制約は厳しすぎるため無効化
      'preserve-caught-error': 'off',
    },
  },
  // config.js はモジュールではなく通常のスクリプト
  {
    files: ['js/config.js'],
    languageOptions: {
      sourceType: 'script',
    },
  },
  // script.js はモジュールではなく通常のスクリプト
  // masterData, showLoading, hideLoading はHTML内のインラインスクリプトで定義
  // getTemplateImageUrl, hasTemplateImage は template-images.js で定義
  {
    files: ['js/script.js'],
    languageOptions: {
      sourceType: 'script',
      globals: {
        masterData: 'writable',
        showLoading: 'readonly',
        hideLoading: 'readonly',
        getTemplateImageUrl: 'readonly',
        hasTemplateImage: 'readonly',
      },
    },
  },
  // csv-generator.js はモジュールではなく通常のスクリプト
  // showToast は script.js で定義
  {
    files: ['js/csv-generator.js'],
    languageOptions: {
      sourceType: 'script',
      globals: {
        showToast: 'readonly',
      },
    },
  },
  // template-images.js はモジュールではなく通常のスクリプト
  {
    files: ['js/template-images.js'],
    languageOptions: {
      sourceType: 'script',
    },
  },
];
