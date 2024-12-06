import { CONFIG } from './config';

type LogLevel = 'info' | 'success' | 'error' | 'warn';
type SectionType = 'config' | 'deploy' | 'files' | 'test' | 'verify' | 'default' | 'params' | 'meta';

class Logger {
  private prefix?: string;

  constructor(prefix?: string) {
    this.prefix = prefix;
  }

  private log(level: LogLevel, message: string) {
    const icon = CONFIG.LOGGER.ICONS[level];
    const prefix = this.prefix ? `[${this.prefix}] ` : '';
    console.log(`${icon} ${prefix}${message}`);
  }

  section(message: string, type: SectionType = 'default'): void {
    const icon = CONFIG.LOGGER.SECTION_ICONS[type];
    if (type === 'meta') {
      const border = CONFIG.LOGGER.META_BORDER.repeat(40);
      console.log(`\n${border}\n${icon} ${message.toUpperCase()}\n${border}`);
    } else {
      console.log(`\n${icon} ${message.toUpperCase()}\n${'-'.repeat(60)}`);
    }
  }

  info(message: string): void {
    this.log('info', message);
  }

  success(message: string): void {
    this.log('success', message);
  }

  error(message: string): void {
    this.log('error', message);
  }

  warn(message: string): void {
    this.log('warn', message);
  }

  withPrefix(prefix: string): Logger {
    return new Logger(prefix);
  }
}

export const logger = new Logger();
