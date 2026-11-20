'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import type { Session } from '@supabase/supabase-js';
import { errorRu, isConfigured, supabase, type StaffRole } from '@/lib/supabase';

interface StaffCtx {
  session: Session;
  role: StaffRole;
}
const Ctx = createContext<StaffCtx | null>(null);
export const useStaff = () => {
  const c = useContext(Ctx);
  if (!c) throw new Error('useStaff вне AdminShell');
  return c;
};

function LoginForm() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  return (
    <form
      className="card narrow"
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        setError(null);
        const { error } = await supabase!.auth.signInWithPassword({ email, password });
        if (error) setError(errorRu(error.message));
        setBusy(false);
      }}
    >
      <h1>Вход в админ-панель</h1>
      <label>
        Email
        <input type="email" required autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} />
      </label>
      <label>
        Пароль
        <input type="password" required autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} />
      </label>
      {error && <p className="error">{error}</p>}
      <button className="btn primary" disabled={busy}>
        {busy ? 'Вход…' : 'Войти'}
      </button>
      <p className="muted">Доступ только для администраторов и редакторов. Роль назначает администратор — см. README.</p>
    </form>
  );
}

export function AdminShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const [session, setSession] = useState<Session | null>(null);
  const [role, setRole] = useState<StaffRole | null>(null);
  const [state, setState] = useState<'loading' | 'ready'>('loading');

  useEffect(() => {
    if (!supabase) return;
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      if (!data.session) setState('ready');
    });
    const { data } = supabase.auth.onAuthStateChange((_e, s) => setSession(s));
    return () => data.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (!supabase || !session) {
      setRole(null);
      return;
    }
    setState('loading');
    supabase
      .from('admin_users')
      .select('role')
      .eq('user_id', session.user.id)
      .maybeSingle()
      .then(({ data }) => {
        setRole((data?.role as StaffRole) ?? null);
        setState('ready');
      });
  }, [session]);

  if (!isConfigured) {
    return (
      <main className="container">
        <div className="card narrow">
          <h1>Supabase не подключён</h1>
          <p>
            Создайте файл <code>apps/admin/.env.local</code> по образцу <code>.env.example</code> и укажите
            <code> NEXT_PUBLIC_SUPABASE_URL</code> и <code>NEXT_PUBLIC_SUPABASE_ANON_KEY</code>. Затем перезапустите
            <code> npm run admin</code>.
          </p>
        </div>
      </main>
    );
  }
  if (state === 'loading') return <main className="container muted">Загрузка…</main>;
  if (!session) {
    return (
      <main className="container">
        <LoginForm />
      </main>
    );
  }
  if (!role) {
    return (
      <main className="container">
        <div className="card narrow">
          <h1>Нет доступа</h1>
          <p>Аккаунт {session.user.email} не является администратором или редактором.</p>
          <button className="btn" onClick={() => supabase!.auth.signOut()}>
            Выйти
          </button>
        </div>
      </main>
    );
  }

  const nav = [
    ['/', 'Обзор'],
    ['/universities', 'Университеты'],
    ['/programs', 'Программы'],
    ['/consultations', 'Заявки'],
  ] as const;

  return (
    <Ctx.Provider value={{ session, role }}>
      <header className="topbar">
        <strong className="brand">
          Uni<span>Italia</span> · админ
        </strong>
        <nav>
          {nav.map(([href, label]) => (
            <Link key={href} href={href} className={(href === '/' ? pathname === '/' : pathname.startsWith(href)) ? 'active' : ''}>
              {label}
            </Link>
          ))}
        </nav>
        <span className="muted small">
          {session.user.email} · {role === 'admin' ? 'администратор' : 'редактор'}
        </span>
        <button className="btn small" onClick={() => supabase!.auth.signOut()}>
          Выйти
        </button>
      </header>
      <main className="container">{children}</main>
    </Ctx.Provider>
  );
}
