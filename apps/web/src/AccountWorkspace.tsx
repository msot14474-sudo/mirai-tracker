import { WhatsAppAccount } from './WhatsAppAccount';
import { useMutation } from '@tanstack/react-query';
import { FormEvent, useEffect, useState } from 'react';
import { AuthenticatedUser, updateOwnAccount, UserRole } from './auth';

const roleLabels: Record<UserRole, string> = {
  ADMIN: 'Administrator',
  PROGRAM_MANAGER: 'Program Manager',
  CAMPUS_MANAGER: 'Campus Manager',
  FACULTY: 'Faculty',
  STUDENT: 'Student',
};

export function AccountWorkspace({
  user,
  onUserUpdate,
}: {
  user: AuthenticatedUser;
  onUserUpdate: (user: AuthenticatedUser) => void;
}) {
  const [name, setName] = useState(user.name);
  const [notificationEmail, setNotificationEmail] = useState(
    user.notificationEmail ?? user.email,
  );
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [formError, setFormError] = useState('');
  const initials = user.name
    .split(/\s+/)
    .map((part) => part[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();

  useEffect(() => {
    setName(user.name);
    setNotificationEmail(user.notificationEmail ?? user.email);
  }, [user]);

  const updateMutation = useMutation({
    mutationFn: updateOwnAccount,
    onSuccess: (updated) => {
      onUserUpdate(updated);
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      setFormError('');
    },
  });

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormError('');
    updateMutation.reset();

    const trimmedName = name.trim();
    const trimmedNotificationEmail = notificationEmail.trim().toLowerCase();
    const storedNotificationEmail = user.notificationEmail ?? user.email;
    const nameChanged = trimmedName !== user.name;
    const emailChanged = trimmedNotificationEmail !== storedNotificationEmail;
    const passwordChanged = Boolean(newPassword);

    if (!nameChanged && !emailChanged && !passwordChanged) {
      setFormError('No account changes to save.');
      return;
    }
    if (newPassword && newPassword.length < 12) {
      setFormError('The new password must contain at least 12 characters.');
      return;
    }
    if (newPassword !== confirmPassword) {
      setFormError('The new passwords do not match.');
      return;
    }
    if ((emailChanged || passwordChanged) && !currentPassword) {
      setFormError('Enter your current password to save this change.');
      return;
    }

    updateMutation.mutate({
      ...(nameChanged ? { name: trimmedName } : {}),
      ...(emailChanged
        ? { notificationEmail: trimmedNotificationEmail || null }
        : {}),
      ...(emailChanged || passwordChanged ? { currentPassword } : {}),
      ...(passwordChanged ? { newPassword } : {}),
    });
  }

  return (
    <div className="account-workspace">
      <section className="account-hero">
        <div className="account-hero-avatar" aria-hidden="true">
          {initials}
        </div>
        <div>
          <p className="eyebrow">My account</p>
          <h1>{user.name}</h1>
          <div className="account-role-list" aria-label="Assigned roles">
            {user.roles.map(({ role, campusId }) => (
              <span key={`${role}-${campusId ?? 'global'}`}>
                {roleLabels[role]}
              </span>
            ))}
          </div>
        </div>
      </section>

      <form className="account-settings-card" onSubmit={submit}>
        <header>
          <div>
            <p className="eyebrow">Profile and security</p>
            <h2>Account settings</h2>
          </div>
          <span className="account-security-mark" aria-hidden="true">
            <svg viewBox="0 0 24 24">
              <path d="M12 3 5 6v5c0 4.6 2.9 8.3 7 10 4.1-1.7 7-5.4 7-10V6l-7-3Z" />
              <path d="m9.5 12 1.7 1.7 3.6-4" />
            </svg>
          </span>
        </header>

        <div className="account-field-grid">
          <label>
            <span>Full name</span>
            <input
              value={name}
              onChange={(event) => setName(event.target.value)}
              autoComplete="name"
              required
            />
          </label>
          <label>
            <span>Login email</span>
            <input value={user.email} readOnly aria-readonly="true" />
            <small>Managed by your administrator</small>
          </label>
          <label className="account-field-wide">
            <span>OTP and notification email</span>
            <input
              type="email"
              value={notificationEmail}
              onChange={(event) => setNotificationEmail(event.target.value)}
              autoComplete="email"
              placeholder={user.email}
            />
          </label>
        </div>

        <div className="account-password-section">
          <div>
            <p className="eyebrow">Password</p>
            <h3>Change password</h3>
          </div>
          <div className="account-field-grid">
            <label className="account-field-wide">
              <span>Current password</span>
              <input
                type="password"
                value={currentPassword}
                onChange={(event) => setCurrentPassword(event.target.value)}
                autoComplete="current-password"
              />
              <small>Required when changing your OTP email or password</small>
            </label>
            <label>
              <span>New password</span>
              <input
                type="password"
                value={newPassword}
                onChange={(event) => setNewPassword(event.target.value)}
                autoComplete="new-password"
                minLength={12}
              />
            </label>
            <label>
              <span>Confirm new password</span>
              <input
                type="password"
                value={confirmPassword}
                onChange={(event) => setConfirmPassword(event.target.value)}
                autoComplete="new-password"
                minLength={12}
              />
            </label>
          </div>
        </div>

        {formError ? (
          <p className="form-error" role="alert">
            {formError}
          </p>
        ) : null}
        {updateMutation.error ? (
          <p className="form-error" role="alert">
            {updateMutation.error.message}
          </p>
        ) : null}
        {updateMutation.isSuccess ? (
          <p className="form-success" role="status">
            Account updated.
          </p>
        ) : null}

        <footer>
          <button type="submit" disabled={updateMutation.isPending}>
            {updateMutation.isPending ? 'Saving…' : 'Save changes'}
          </button>
        </footer>
      </form>
      {user.roles.some(r => r.role === 'FACULTY') && <WhatsAppAccount />}
    </div>
  );
}
