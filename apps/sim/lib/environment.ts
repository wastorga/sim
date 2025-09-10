/**
 * Environment utility functions for consistent environment detection across the application
 */
import { env, isTruthy } from './env'

/**
 * Is the application running in production mode
 */
export const isProd = env.NODE_ENV === 'production'

/**
 * Is the application running in development mode
 */
export const isDev = env.NODE_ENV === 'development'

/**
 * Is the application running in test mode
 */
export const isTest = env.NODE_ENV === 'test'

/**
 * Is this the hosted version of the application
 */
export const isHosted = true

/**
 * Is billing enforcement enabled
 */
export const isBillingEnabled = isTruthy(env.BILLING_ENABLED)

/**
 * Get cost multiplier based on environment
 */
export function getCostMultiplier(): number {
  return isProd ? (env.COST_MULTIPLIER ?? 1) : 1
}
