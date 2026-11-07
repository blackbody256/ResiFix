// OWNER: Ann: PB-001, PB-002. Phone -> OTP -> JWT.
import { useState, type FormEvent } from 'react';
import { Navigate, useLocation, useNavigate } from 'react-router';
import { useAuth } from '../auth/useAuth';
import { Button, Card, ErrorText, Input } from '../components/ui';
import { api } from '../lib/api';
import type { SessionUser } from '../lib/session';

export function Login() {
  const { user, signIn } = useAuth();
  const navigate = useNavigate();
  const from = (useLocation().state as { from?: string } | null)?.from ?? '/';
  const [step, setStep] = useState<'phone' | 'code'>('phone');
  const [phone, setPhone] = useState('');
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  if (user) return <Navigate to="/" replace />;

  async function run(action: () => Promise<void>) {
    setBusy(true);
    setError('');
    try {
      await action();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const requestCode = (e: FormEvent) => {
    e.preventDefault();
    void run(async () => {
      const res = await api.post<{ phone: string }>('/auth/request-otp', { phone: phone.trim() });
      setPhone(res.phone);
      setStep('code');
    });
  };

  const verifyCode = (e: FormEvent) => {
    e.preventDefault();
    void run(async () => {
      signIn(
        await api.post<{ token: string; user: SessionUser }>('/auth/verify-otp', {
          phone,
          code: code.trim(),
        }),
      );
      navigate(from, { replace: true });
    });
  };

  return (
    <main className="px-4">
      <Card className="mx-auto mt-12 max-w-sm">
        {step === 'phone' ? (
          <form onSubmit={requestCode} noValidate className="space-y-3">
            <h1 className="text-xl font-semibold">Sign in</h1>
            <p className="text-sm text-slate-500">We will send a 6-digit code to your phone.</p>
            <label htmlFor="phone" className="block text-sm font-semibold">
              Phone number
            </label>
            <Input
              id="phone"
              type="tel"
              inputMode="tel"
              autoComplete="tel"
              placeholder="0700 000 010"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              autoFocus
              required
            />
            <ErrorText>{error}</ErrorText>
            <Button type="submit" disabled={busy}>
              {busy ? 'Sending…' : 'Send code'}
            </Button>
          </form>
        ) : (
          <form onSubmit={verifyCode} noValidate className="space-y-3">
            <h1 className="text-xl font-semibold">Enter code</h1>
            <p className="text-sm text-slate-500">
              Sent to {phone}.{' '}
              <button
                type="button"
                className="text-brand-700 underline"
                onClick={() => {
                  setStep('phone');
                  setCode('');
                  setError('');
                }}
              >
                Change number
              </button>
            </p>
            <label htmlFor="code" className="block text-sm font-semibold">
              6-digit code
            </label>
            <Input
              id="code"
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={6}
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
              autoFocus
              required
            />
            <ErrorText>{error}</ErrorText>
            <Button type="submit" disabled={busy || code.length !== 6}>
              {busy ? 'Verifying…' : 'Verify'}
            </Button>
          </form>
        )}
      </Card>
    </main>
  );
}
