export function HelpWorkspace({
  onOpenAccount,
  workflow,
}: {
  onOpenAccount: () => void;
  workflow?: { title: string; steps: string[] };
}) {
  return (
    <div className="help-workspace">
      <section className="help-hero">
        <div>
          <p className="eyebrow">Help</p>
          <h1>How can we help?</h1>
        </div>
        <div className="help-hero-orbit" aria-hidden="true">
          <span />
          <img src="/mirai-symbol-light.png" alt="" />
        </div>
      </section>

      {workflow && (
        <section className="help-faq-card" aria-label="Your workflow">
          <h2>{workflow.title}</h2>
          <ol>
            {workflow.steps.map((step) => (
              <li key={step}>{step}</li>
            ))}
          </ol>
        </section>
      )}

      <section className="help-topic-grid" aria-label="Help topics">
        <article>
          <h2>Sign-in and OTP</h2>
          <p>Check the OTP inbox saved in your account settings.</p>
          <button type="button" onClick={onOpenAccount}>
            Open my account
          </button>
        </article>
        <article>
          <h2>Campus access</h2>
          <p>Your administrator controls campus and role permissions.</p>
        </article>
        <article>
          <h2>Classes and progress</h2>
          <p>Your timetable, lesson plan and class logs determine progress.</p>
        </article>
      </section>

      <section className="help-faq-card">
        <p className="eyebrow">Quick answers</p>
        <details>
          <summary>I did not receive an OTP</summary>
          <p>
            Confirm your OTP email in My account, then request a new code after
            the previous request finishes.
          </p>
        </details>
        <details>
          <summary>My campus or role is incorrect</summary>
          <p>Ask your campus manager or administrator to update your access.</p>
        </details>
        <details>
          <summary>A class or progress value looks wrong</summary>
          <p>
            Check the scheduled class, lesson plan and daily log for that date.
          </p>
        </details>
      </section>
    </div>
  );
}
