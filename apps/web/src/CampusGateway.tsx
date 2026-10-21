import type { Campus } from './academic';
import type { AuthenticatedUser } from './auth';
import { LoadingSkeleton } from './LoadingSkeleton';

function Arrow() {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M4 12h15m-6-6 6 6-6 6" />
    </svg>
  );
}

// Decorative architectural illustration, not a representation of a campus building.
function CampusArtwork({ variant }: { variant: string }) {
  return (
    <svg
      className="campus-hub-art"
      viewBox="0 0 360 160"
      fill="none"
      aria-hidden="true"
    >
      <circle
        cx={variant === 'teal' ? 87 : 278}
        cy="48"
        r="31"
        className="hub-art-sun"
      />
      <path
        d="M0 137h360M0 149h360M42 160l58-41m211 41-50-41"
        className="hub-art-grid"
      />
      <path
        d="M61 133V66l82-28 91 28v67M143 38v95M61 66l82 29 91-29M143 95v38"
        className="hub-art-building"
      />
      <path
        d="M168 133V80l80-24 54 19v58M248 56v77M168 80l80 25 54-30M248 105v28"
        className="hub-art-wing"
      />
      {[0, 1, 2, 3].map((n) => (
        <path
          key={n}
          d={`M${74 + n * 16} ${76 + n * 5.5}v25m0 7v14M${157 + n * 17} ${89 - n * 5.5}v30`}
          className="hub-art-window"
        />
      ))}
      <path
        d="M183 94v27m16-22v22m16-17v17m49-16v17m15-24v24"
        className="hub-art-window"
      />
      <path
        d="M28 134V111m0 9c-25-7-13-33 0-32 13-1 25 25 0 32Zm299 14v-23m0 9c-25-7-13-33 0-32 13-1 25 25 0 32Z"
        className="hub-art-tree"
      />
    </svg>
  );
}

export function AdminCampusGateway({
  user,
  campuses,
  isLoading,
  error,
  onRetry,
  onSelect,
  onSignOut,
  isSigningOut,
  roleLabel,
}: {
  user: AuthenticatedUser;
  campuses: Campus[];
  isLoading: boolean;
  error: Error | null;
  onRetry: () => void;
  onSelect: (campusId: string) => void;
  onSignOut: () => void;
  isSigningOut: boolean;
  roleLabel: string;
}) {
  const firstName = user.name.trim().split(/\s+/)[0] || user.name;
  const initials = user.name
    .trim()
    .split(/\s+/)
    .map((part) => part[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();

  return (
    <main className="campus-hub">
      <header className="campus-hub-header">
        <div className="campus-hub-brand">
          <span className="campus-hub-logo">
            <img src="/mirai-wordmark.webp" alt="Mirai School of Technology" />
          </span>
        </div>
        <div className="campus-hub-account">
          <span className="campus-hub-avatar" aria-hidden="true">
            {initials}
          </span>
          <span className="campus-hub-user">
            <strong>{user.name}</strong>
            <span>{roleLabel}</span>
          </span>
          <button
            type="button"
            className="campus-hub-signout"
            onClick={onSignOut}
            disabled={isSigningOut}
          >
            {isSigningOut ? 'Signing out…' : 'Sign out'}
          </button>
        </div>
      </header>

      <div className="campus-hub-content">
        <section className="campus-hub-hero" aria-labelledby="campus-hub-title">
          <div>
            <p className="campus-hub-eyebrow">
              <span /> YOUR ACADEMIC WORKSPACE
            </p>
            <h1 id="campus-hub-title">
              Welcome back, <span>{firstName}</span>
            </h1>
            <p className="campus-hub-intro">
              A clear view of every campus.
              <br />
              Choose a workspace to keep learning moving forward.
            </p>
          </div>
          <div className="campus-hub-orbit" aria-hidden="true">
            <span className="hub-orbit-ring" />
            <span className="hub-orbit-ring hub-orbit-ring-inner" />
            <span className="hub-orbit-center">
              <img src="/mirai-symbol-light.png" alt="" />
            </span>
            <span className="hub-orbit-label hub-orbit-label-one">
              Teaching
            </span>
            <span className="hub-orbit-label hub-orbit-label-two">
              Planning
            </span>
            <span className="hub-orbit-label hub-orbit-label-three">
              Progress
            </span>
          </div>
        </section>

        <section
          className="campus-hub-selection"
          aria-labelledby="campus-hub-selection-title"
        >
          <div className="campus-hub-section-heading">
            <div>
              <h2 id="campus-hub-selection-title">Your campuses</h2>
              {!isLoading && !error && (
                <span className="campus-hub-count">
                  {campuses.length} active{' '}
                  {campuses.length === 1 ? 'campus' : 'campuses'}
                </span>
              )}
            </div>
            <p>
              Select a campus to get started <span aria-hidden="true">↘</span>
            </p>
          </div>
          {isLoading ? (
            <LoadingSkeleton
              variant="campus"
              label="Loading campuses"
              count={3}
            />
          ) : error ? (
            <div className="campus-hub-state" role="alert">
              <h3>We couldn’t load your campuses</h3>
              <p>{error.message}</p>
              <button type="button" onClick={onRetry}>
                Try again
              </button>
            </div>
          ) : campuses.length ? (
            <div className="campus-hub-grid">
              {campuses.map((campus) => {
                const variant = campus.code.toUpperCase().includes('RATHINAM')
                  ? 'amber'
                  : campus.code.toUpperCase().includes('JAGGANNATH')
                    ? 'teal'
                    : 'blue';
                return (
                  <button
                    type="button"
                    className={`campus-hub-card campus-hub-${variant}`}
                    key={campus.id}
                    onClick={() => onSelect(campus.id)}
                    aria-label={`Open ${campus.name}`}
                  >
                    <span className="campus-hub-card-visual">
                      <span className="campus-hub-code">{campus.code}</span>
                      <span className="campus-hub-active">
                        <span /> Active
                      </span>
                      <CampusArtwork variant={variant} />
                    </span>
                    <span className="campus-hub-card-copy">
                      <strong>{campus.name}</strong>
                      <span>Plan, teach and track progress.</span>
                      <span className="campus-hub-card-tags">
                        <span>Academics</span>
                        <span>People</span>
                        <span>Insights</span>
                      </span>
                    </span>
                    <span className="campus-hub-card-footer">
                      <span>Open workspace</span>
                      <span className="campus-hub-arrow">
                        <Arrow />
                      </span>
                    </span>
                  </button>
                );
              })}
            </div>
          ) : (
            <div className="campus-hub-state">
              <h3>No active campuses found.</h3>
              <p>Your campuses will appear here when they are available.</p>
            </div>
          )}
        </section>
        <footer className="campus-hub-footer">
          <p>
            <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path d="m12 3 8 3v5c0 5-4 8-8 10-4-2-8-5-8-10V6l8-3Z" />
              <path d="m8 12 3 3 5-6" />
            </svg>{' '}
            Your access and permissions follow you into each workspace.
          </p>
          <span>
            Mirai Tracker <span aria-hidden="true">/</span> Campus management
          </span>
        </footer>
      </div>
    </main>
  );
}
