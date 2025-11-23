import { config } from 'dotenv';
import { z } from 'zod';
import { logger } from './logger.js';

// Load .env file
config();

const envSchema = z.object({
  // Server
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.coerce.number().default(3003),
  LOG_LEVEL: z.enum(['trace', 'debug', 'info', 'warn', 'error', 'fatal']).default('info'),

  // Story 1.2: Modal Sandboxes
  MODAL_TOKEN_ID: z.string().min(1, 'MODAL_TOKEN_ID is required'),
  MODAL_TOKEN_SECRET: z.string().min(1, 'MODAL_TOKEN_SECRET is required'),

  // Story 1.4: Agent SDK
  ANTHROPIC_API_KEY: z.string().min(1, 'ANTHROPIC_API_KEY is required'),

});

export type Env = z.infer<typeof envSchema>;

let env: Env;

try {
  env = envSchema.parse(process.env);
  logger.info('Environment variables validated successfully');
} catch (error) {
  logger.error({ error }, 'Invalid environment variables');
  process.exit(1);
}

export { env };
