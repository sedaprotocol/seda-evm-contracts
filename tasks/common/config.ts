export const CONFIG = {
  DEPLOYMENTS: {
    FOLDER: 'deployments',
    FILES: {
      ADDRESSES: 'addresses.json',
      ARTIFACTS: 'artifacts',
    },
  },
  LOGGER: {
    ICONS: {
      info: '•',
      success: '✓',
      error: '✗',
      warn: '⚠️',
    },
    SECTION_ICONS: {
      config: '🔧',
      deploy: '🚀',
      files: '📝',
      test: '🧪',
      verify: '🔍',
      params: '📜',
      default: '🔹',
      meta: '🌟',
    },
    META_BORDER: '━',
  },
} as const;
