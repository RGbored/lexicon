'use strict';

/**
 * Account control in the header (DESIGN.md §9, multi-user).
 *
 * Local/daily use is frictionless: with no session the server treats you as the
 * default account, shown here as "Guest". Signing in or up sets a session cookie;
 * the page reloads so Data.load() picks up that user's progress. Logging out
 * drops back to the default account.
 */
const Auth = (() => {
  let me = { username: 'default', isDefault: true };

  async function init() {
    try {
      me = await fetch('/api/me').then((r) => r.json());
    } catch {
      me = { username: 'default', isDefault: true };
    }
    render();
  }

  function render() {
    const el = document.getElementById('account');
    if (!el) return;
    const label = me.isDefault ? 'Sign in' : `@${me.username}`;
    el.innerHTML = `<button class="account-btn" id="account-btn">${label}</button>`;
    document.getElementById('account-btn').onclick = openMenu;
  }

  function closeMenu() {
    const m = document.getElementById('account-menu');
    if (m) m.remove();
    document.removeEventListener('keydown', onEsc);
  }
  function onEsc(e) { if (e.key === 'Escape') closeMenu(); }

  function openMenu() {
    if (document.getElementById('account-menu')) return closeMenu();
    const menu = document.createElement('div');
    menu.id = 'account-menu';
    menu.className = 'account-menu';
    menu.innerHTML = me.isDefault ? loginForms() : loggedInView();
    document.body.appendChild(menu);
    document.addEventListener('keydown', onEsc);
    if (me.isDefault) wireForms(menu);
    else menu.querySelector('#logout-btn').onclick = logout;
    menu.querySelector('.account-close').onclick = closeMenu;
  }

  function loggedInView() {
    return `
      <div class="account-head">@${me.username}<button class="account-close" aria-label="Close">×</button></div>
      <button class="account-action" id="logout-btn">Log out</button>`;
  }

  function loginForms() {
    return `
      <div class="account-head">Account<button class="account-close" aria-label="Close">×</button></div>
      <div class="account-err" id="account-err" hidden></div>
      <form id="login-form" class="account-form">
        <input name="username" placeholder="Username" autocomplete="username" required />
        <input name="password" type="password" placeholder="Password" autocomplete="current-password" required />
        <button type="submit" class="account-action">Log in</button>
      </form>
      <div class="account-sep">or</div>
      <form id="signup-form" class="account-form">
        <input name="username" placeholder="New username" autocomplete="username" required />
        <input name="password" type="password" placeholder="New password" autocomplete="new-password" required />
        <button type="submit" class="account-action ghost">Create account</button>
      </form>`;
  }

  function wireForms(menu) {
    menu.querySelector('#login-form').onsubmit = (e) => submit(e, '/api/login');
    menu.querySelector('#signup-form').onsubmit = (e) => submit(e, '/api/signup');
  }

  async function submit(e, url) {
    e.preventDefault();
    const fd = new FormData(e.target);
    const res = await post(url, { username: fd.get('username'), password: fd.get('password') });
    if (res.error) return showErr(res.error);
    location.reload(); // re-fetch progress as the now-current user
  }

  async function logout() {
    await post('/api/logout', {});
    location.reload();
  }

  function showErr(msg) {
    const e = document.getElementById('account-err');
    if (e) { e.textContent = msg; e.hidden = false; }
  }

  function post(url, body) {
    return fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }).then((r) => r.json()).catch(() => ({ error: 'Network error.' }));
  }

  return { init };
})();
