import dotenv from 'dotenv';

dotenv.config();

const DEFAULT_TEST_MNEMONIC = 'test test test test test test test test test test test junk';

export const getEnv = (name: string, defaultValue?: string): string => {
  const value = process.env[name];
  if (value === undefined || value === '') {
    if (defaultValue !== undefined) {
      return defaultValue;
    }
    throw new Error(`Environment variable ${name} is not set`);
  }
  return value;
};

export const getDefaultAccount = (): { mnemonic: string } => {
  return {
    mnemonic: getEnv('MNEMONIC', DEFAULT_TEST_MNEMONIC),
  };
};

export const getAccount = (name: string | string[]): string[] => {
  if (typeof name === 'string') {
    return [getEnv(name)];
  }
  if (Array.isArray(name)) {
    return name.map((item) => getEnv(item));
  }
  throw new Error(`Invalid input for getAccount: ${name}`);
};
