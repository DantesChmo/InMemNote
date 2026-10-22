export interface StorageBannerProps {
  /** `full` — Library strip with reason; `compact` — one-line Draft strip. */
  variant?: 'full' | 'compact';
}

/** Persistent warning that user data is not being written to disk. */
export function StorageBanner(_props: StorageBannerProps): JSX.Element | null {
  return null;
}
