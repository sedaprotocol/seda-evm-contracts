import dotenv from 'dotenv';

dotenv.config();

export const getEnv = (name: string, defaultValue = ''): string => {
  return process.env[name] || defaultValue;
};

export const getAccount = (name: string): string[] => [getEnv(name)];

export const getUrl = (urlTemplate: string): string => {
  return urlTemplate.replace(/{(\w+)}/g, (_, envVar) => getEnv(envVar, ''));
};
