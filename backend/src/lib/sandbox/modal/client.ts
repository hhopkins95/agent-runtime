/**
 * Modal Client Initialization
 *
 * Provides Modal client setup and app context for sandbox creation.
 */

import { ModalClient, type App } from 'modal';
import { logger } from '../../../config/logger.js';

/**
 * Modal context containing client and app references
 */
export interface ModalContext {
  modal: ModalClient;
  app: App;
}

/**
 * Initialize Modal client and app
 * This will be called once on server startup
 *
 * Authentication: Uses MODAL_TOKEN_ID and MODAL_TOKEN_SECRET from environment
 */
export async function initializeModal({ tokenId, tokenSecret, appName }: { tokenId: string, tokenSecret: string, appName: string }): Promise<ModalContext> {
  try {
    logger.info('Initializing Modal client...');

    // Initialize Modal client (automatically uses env vars)
    const modal = new ModalClient({
      tokenId,
      tokenSecret,
    });

    // Get or create app
    const app = await modal.apps.fromName(appName, {
      createIfMissing: true,
    });

    logger.info('Modal client initialized successfully');

    return { modal, app };
  } catch (error) {
    logger.error({ error }, 'Failed to initialize Modal client');
    throw error;
  }
}
