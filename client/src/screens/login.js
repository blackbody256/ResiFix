// OWNER: Ann — PB-001, PB-002. Phone -> OTP -> JWT.
import { api } from '../api.js';
import { session } from '../session.js';
import { escapeHtml } from '../router.js';

export async function loginScreen(el, { navigate }) {
  if (session.isLoggedIn()) return navigate('/');

  let phone = '';

  const showPhoneStep = (error = '') => {
    el.innerHTML = `
      <section class="card narrow">
        <h1>Sign in</h1>
        <p class="muted">We will send a 6-digit code to your phone.</p>
        <form id="phone-form" novalidate>
          <label for="phone">Phone number</label>
          <input id="phone" name="phone" type="tel" inputmode="tel" autocomplete="tel"
                 placeholder="0700 000 010" value="${escapeHtml(phone)}" required />
          <p class="error" role="alert">${escapeHtml(error)}</p>
          <button type="submit">Send code</button>
        </form>
      </section>`;
    el.querySelector('#phone').focus();
    el.querySelector('#phone-form').onsubmit = async (e) => {
      e.preventDefault();
      phone = e.target.phone.value.trim();
      setBusy(e.target, true);
      try {
        const res = await api.post('/auth/request-otp', { phone });
        phone = res.phone;
        showCodeStep();
      } catch (err) {
        showPhoneStep(err.message);
      }
    };
  };

  const showCodeStep = (error = '') => {
    el.innerHTML = `
      <section class="card narrow">
        <h1>Enter code</h1>
        <p class="muted">Sent to ${escapeHtml(phone)}.
          <button type="button" class="link" id="change">Change number</button></p>
        <form id="code-form" novalidate>
          <label for="code">6-digit code</label>
          <input id="code" name="code" inputmode="numeric" autocomplete="one-time-code"
                 pattern="\\d{6}" maxlength="6" required />
          <p class="error" role="alert">${escapeHtml(error)}</p>
          <button type="submit">Verify</button>
        </form>
      </section>`;
    el.querySelector('#code').focus();
    el.querySelector('#change').onclick = () => showPhoneStep();
    el.querySelector('#code-form').onsubmit = async (e) => {
      e.preventDefault();
      setBusy(e.target, true);
      try {
        session.save(
          await api.post('/auth/verify-otp', { phone, code: e.target.code.value.trim() }),
        );
        navigate('/');
      } catch (err) {
        showCodeStep(err.message);
      }
    };
  };

  showPhoneStep();
}

function setBusy(form, busy) {
  const button = form.querySelector('button[type=submit]');
  button.disabled = busy;
  button.textContent = busy ? 'Please wait…' : button.textContent;
}
