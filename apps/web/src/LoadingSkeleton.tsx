export type LoadingSkeletonVariant =
  'app' | 'campus' | 'cards' | 'list' | 'table' | 'panel';

export function LoadingSkeleton({
  variant = 'panel',
  label = 'Loading content',
  count,
}: {
  variant?: LoadingSkeletonVariant;
  label?: string;
  count?: number;
}) {
  if (variant === 'app') {
    return (
      <main className="skeleton-app" role="status" aria-label={label}>
        <span className="sr-only">{label}</span>
        <aside className="skeleton-app-sidebar" aria-hidden="true">
          <span className="skeleton-block skeleton-app-brand" />
          <div className="skeleton-app-nav">
            {Array.from({ length: 5 }, (_, index) => (
              <span className="skeleton-block" key={index} />
            ))}
          </div>
          <span className="skeleton-block skeleton-app-profile" />
        </aside>
        <div className="skeleton-app-main" aria-hidden="true">
          <header>
            <span className="skeleton-block" />
            <span className="skeleton-block" />
          </header>
          <div className="skeleton-app-content">
            <span className="skeleton-block skeleton-heading" />
            <span className="skeleton-block skeleton-copy" />
            <div className="skeleton-app-cards">
              {Array.from({ length: 3 }, (_, index) => (
                <span className="skeleton-block" key={index} />
              ))}
            </div>
          </div>
        </div>
      </main>
    );
  }

  const itemCount = count ?? (variant === 'table' ? 5 : 3);

  return (
    <div
      className={`content-skeleton content-skeleton-${variant}`}
      role="status"
      aria-label={label}
    >
      <span className="sr-only">{label}</span>
      {variant === 'campus' || variant === 'cards' ? (
        <div className="skeleton-card-grid" aria-hidden="true">
          {Array.from({ length: itemCount }, (_, index) => (
            <div className="skeleton-card" key={index}>
              <div className="skeleton-card-topline">
                <span className="skeleton-block skeleton-chip" />
                <span className="skeleton-block skeleton-circle" />
              </div>
              <div>
                <span className="skeleton-block skeleton-title" />
                <span className="skeleton-block skeleton-copy" />
              </div>
              <span className="skeleton-block skeleton-footer" />
            </div>
          ))}
        </div>
      ) : variant === 'list' ? (
        <div className="skeleton-list" aria-hidden="true">
          {Array.from({ length: itemCount }, (_, index) => (
            <div className="skeleton-list-row" key={index}>
              <span className="skeleton-block skeleton-circle" />
              <div>
                <span className="skeleton-block skeleton-title" />
                <span className="skeleton-block skeleton-copy" />
              </div>
              <span className="skeleton-block skeleton-chip" />
            </div>
          ))}
        </div>
      ) : variant === 'table' ? (
        <div className="skeleton-table" aria-hidden="true">
          <div className="skeleton-table-header">
            {Array.from({ length: 4 }, (_, index) => (
              <span className="skeleton-block" key={index} />
            ))}
          </div>
          {Array.from({ length: itemCount }, (_, index) => (
            <div className="skeleton-table-row" key={index}>
              {Array.from({ length: 4 }, (_, cell) => (
                <span className="skeleton-block" key={cell} />
              ))}
            </div>
          ))}
        </div>
      ) : (
        <div className="skeleton-panel" aria-hidden="true">
          <span className="skeleton-block skeleton-heading" />
          <span className="skeleton-block skeleton-copy" />
          <div className="skeleton-panel-metrics">
            {Array.from({ length: itemCount }, (_, index) => (
              <span className="skeleton-block" key={index} />
            ))}
          </div>
          <span className="skeleton-block skeleton-panel-body" />
        </div>
      )}
    </div>
  );
}
