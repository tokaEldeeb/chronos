export type BackoffStrategy = 'exponential' | 'fixed';

export function getBackoffStrategy(): BackoffStrategy {
  const v = (process.env.BACKOFF_STRATEGY || 'exponential').toLowerCase();
  return (v === 'fixed' ? 'fixed' : 'exponential');
}

export function getBackoffSeconds(): number {
  const n = Number(process.env.BACKOFF_SECONDS || 5);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : 5;
}


