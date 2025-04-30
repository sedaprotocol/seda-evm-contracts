const DEPLOYMENT_CONFIG = {
  FOLDER: 'deployments',
  FILES: {
    ADDRESSES: 'addresses.json',
    ARTIFACTS: 'artifacts',
  },
} as const;

const LOGGER_CONFIG = {
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
    upgrade: '🔄',
  },
  META_BORDER: '━',
} as const;

export const CONFIG = {
  DEPLOYMENTS: DEPLOYMENT_CONFIG,
  LOGGER: LOGGER_CONFIG,
} as const;
