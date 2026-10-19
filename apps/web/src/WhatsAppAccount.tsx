import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiFetch, apiUrl } from './http';
async function api(path: string, method = 'GET', body?: object) {
  return (
    await apiFetch(`${apiUrl}/whatsapp/account${path}`, {
      method,
      ...(body
        ? {
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
          }
        : {}),
    })
  ).json();
}
export function WhatsAppAccount() {
  const client = useQueryClient();
  const [phone, setPhone] = useState('');
  const status = useQuery({
    queryKey: ['whatsapp-account'],
    queryFn: () => api(''),
    refetchInterval: 15000,
  });
  const link = useMutation({
    mutationFn: () => api('/link', 'POST', { phone }),
  });
  const unlink = useMutation({
    mutationFn: () => api('/link', 'DELETE'),
    onSuccess: () => {
      link.reset();
      void client.invalidateQueries({ queryKey: ['whatsapp-account'] });
    },
  });
  return (
    <section className="account-settings whatsapp-account">
      <h2>WhatsApp class logging</h2>
      <p>
        Use your own WhatsApp number to log assigned classes. Describe your
        class naturally. Clear updates are saved automatically; the assistant
        asks when details are missing.
      </p>
      {status.isPending ? (
        <p>Checking connection…</p>
      ) : status.data?.ready ? (
        <>
          {status.data.phone && (
            <p>
              Linked number: +{status.data.phone}{' '}
              <button
                type="button"
                disabled={unlink.isPending}
                onClick={() => unlink.mutate()}
              >
                Unlink WhatsApp
              </button>
            </p>
          )}
          <form
            onSubmit={(e) => {
              e.preventDefault();
              link.mutate();
            }}
          >
            <label>
              Your WhatsApp number (with country code)
              <input
                type="tel"
                required
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="+91…"
              />
            </label>
            <button disabled={link.isPending}>
              {link.isPending ? 'Preparing…' : 'Link my number'}
            </button>
          </form>
          {link.data && (
            <div role="status">
              <p>
                From this number, send the following message to{' '}
                {link.data.businessNumber ||
                  'the campus WhatsApp business number'}{' '}
                within 10 minutes:
              </p>
              <code>{link.data.command}</code>
              <p>
                After linking, describe the class, what you covered and what
                remains. You can continue discussing the next lesson in the same
                conversation.
              </p>
            </div>
          )}
        </>
      ) : (
        <p>
          Not activated yet. Your administrator needs to connect the campus
          WhatsApp Business API account.
        </p>
      )}
      {(status.error || link.error || unlink.error) && (
        <p role="alert">
          {(status.error || link.error || unlink.error)?.message}
        </p>
      )}
    </section>
  );
}
