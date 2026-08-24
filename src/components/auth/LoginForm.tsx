import React, { useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import {
  Building2,
  Lock,
  Mail,
  ShieldCheck,
  UserCheck,
  KeyRound,
  ArrowRight,
  AlertCircle,
  Sparkles,
  Info,
} from 'lucide-react';

export const LoginForm: React.FC = () => {
  const { signIn } = useAuth();
  const [email, setEmail] = useState('admin@empresa.com');
  const [password, setPassword] = useState('admin123');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const res = await signIn(email, password);
    if (res.error) {
      setError(res.error);
    }
    setLoading(false);
  };

  const handleQuickLogin = async (quickEmail: string, quickPass: string) => {
    setEmail(quickEmail);
    setPassword(quickPass);
    setLoading(true);
    setError(null);
    const res = await signIn(quickEmail, quickPass);
    if (res.error) {
      setError(res.error);
    }
    setLoading(false);
  };

  return (
    <div className="min-h-screen bg-slate-950 flex flex-col justify-center items-center p-4 sm:p-6 text-slate-100">
      <div className="w-full max-w-md space-y-6">
        {/* Brand Banner */}
        <div className="text-center space-y-2">
          <div className="inline-flex p-3 rounded-2xl bg-gradient-to-tr from-sky-600 to-indigo-600 shadow-xl shadow-sky-500/20 mb-2">
            <Building2 className="w-8 h-8 text-white" />
          </div>
          <h1 className="text-2xl font-extrabold bg-gradient-to-r from-white via-slate-200 to-slate-400 bg-clip-text text-transparent">
            León Proveedores
          </h1>
          <p className="text-xs text-slate-400">
            Sistema de Cuentas Corrientes, Imputaciones & Auditoría
          </p>
        </div>

        {/* Login Card */}
        <div className="bg-slate-900/90 border border-slate-800 rounded-3xl p-6 sm:p-8 shadow-2xl shadow-black/50 space-y-6">
          <div className="space-y-1">
            <h2 className="text-lg font-bold text-white">Iniciar Sesión</h2>
            <p className="text-xs text-slate-400">Ingrese con su usuario o elija un rol de acceso rápido</p>
          </div>

          {error && (
            <div className="p-3.5 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs flex items-center space-x-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4 text-xs">
            <div>
              <label className="block font-semibold text-slate-300 mb-1.5">
                Correo Electrónico
              </label>
              <div className="relative">
                <Mail className="w-4 h-4 absolute left-3.5 top-3 text-slate-500" />
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="usuario@empresa.com"
                  className="w-full bg-slate-800 border border-slate-700 rounded-xl pl-10 pr-3.5 py-2.5 text-white placeholder-slate-500 focus:ring-2 focus:ring-sky-500/50 focus:outline-none"
                />
              </div>
            </div>

            <div>
              <label className="block font-semibold text-slate-300 mb-1.5">
                Contraseña
              </label>
              <div className="relative">
                <Lock className="w-4 h-4 absolute left-3.5 top-3 text-slate-500" />
                <input
                  type="password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full bg-slate-800 border border-slate-700 rounded-xl pl-10 pr-3.5 py-2.5 text-white placeholder-slate-500 focus:ring-2 focus:ring-sky-500/50 focus:outline-none font-mono"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full flex items-center justify-center space-x-2 bg-gradient-to-r from-sky-600 to-indigo-600 hover:from-sky-500 hover:to-indigo-500 text-white py-3 rounded-xl font-bold shadow-lg shadow-sky-900/30 transition-all disabled:opacity-50 text-sm"
            >
              <span>{loading ? 'Ingresando...' : 'Entrar al Sistema'}</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          </form>

          {/* Quick Access Credentials Section */}
          <div className="pt-5 border-t border-slate-800 space-y-3">
            <div className="flex items-center space-x-1.5 text-xs font-bold text-slate-300">
              <Sparkles className="w-4 h-4 text-amber-400" />
              <span>Acceso Rápido con 1 Click (Cuentas de Prueba)</span>
            </div>

            <div className="grid grid-cols-1 gap-2 text-xs">
              {/* Admin */}
              <button
                type="button"
                onClick={() => handleQuickLogin('admin@empresa.com', 'admin123')}
                className="w-full p-3 rounded-xl bg-slate-800/80 hover:bg-slate-800 border border-amber-500/30 flex items-center justify-between text-left transition-all group"
              >
                <div className="flex items-center space-x-3">
                  <div className="p-2 rounded-lg bg-amber-500/10 text-amber-400 border border-amber-500/20">
                    <ShieldCheck className="w-4 h-4" />
                  </div>
                  <div>
                    <div className="font-bold text-white flex items-center space-x-1.5">
                      <span>Administrador</span>
                      <span className="bg-amber-500/20 text-amber-300 text-[10px] px-1.5 py-0.2 rounded font-mono">
                        ADMIN
                      </span>
                    </div>
                    <div className="text-[11px] text-slate-400 font-mono">
                      admin@empresa.com • Clave: admin123
                    </div>
                  </div>
                </div>
                <span className="text-[11px] text-amber-400 font-semibold group-hover:translate-x-1 transition-transform">
                  Entrar ➔
                </span>
              </button>

              {/* Encargado */}
              <button
                type="button"
                onClick={() => handleQuickLogin('encargado@empresa.com', 'encargado123')}
                className="w-full p-3 rounded-xl bg-slate-800/80 hover:bg-slate-800 border border-emerald-500/30 flex items-center justify-between text-left transition-all group"
              >
                <div className="flex items-center space-x-3">
                  <div className="p-2 rounded-lg bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                    <KeyRound className="w-4 h-4" />
                  </div>
                  <div>
                    <div className="font-bold text-white flex items-center space-x-1.5">
                      <span>Encargada (Laura)</span>
                      <span className="bg-emerald-500/20 text-emerald-300 text-[10px] px-1.5 py-0.2 rounded font-mono">
                        ENCARGADO
                      </span>
                    </div>
                    <div className="text-[11px] text-slate-400 font-mono">
                      encargado@empresa.com • Clave: encargado123
                    </div>
                  </div>
                </div>
                <span className="text-[11px] text-emerald-400 font-semibold group-hover:translate-x-1 transition-transform">
                  Entrar ➔
                </span>
              </button>

              {/* Operador */}
              <button
                type="button"
                onClick={() => handleQuickLogin('operador@empresa.com', 'operador123')}
                className="w-full p-3 rounded-xl bg-slate-800/80 hover:bg-slate-800 border border-sky-500/30 flex items-center justify-between text-left transition-all group"
              >
                <div className="flex items-center space-x-3">
                  <div className="p-2 rounded-lg bg-sky-500/10 text-sky-400 border border-sky-500/20">
                    <UserCheck className="w-4 h-4" />
                  </div>
                  <div>
                    <div className="font-bold text-white flex items-center space-x-1.5">
                      <span>Operador (Juan)</span>
                      <span className="bg-sky-500/20 text-sky-300 text-[10px] px-1.5 py-0.2 rounded font-mono">
                        OPERADOR
                      </span>
                    </div>
                    <div className="text-[11px] text-slate-400 font-mono">
                      operador@empresa.com • Clave: operador123
                    </div>
                  </div>
                </div>
                <span className="text-[11px] text-sky-400 font-semibold group-hover:translate-x-1 transition-transform">
                  Entrar ➔
                </span>
              </button>
            </div>
          </div>
        </div>

        {/* Clarification Alert */}
        <div className="bg-slate-900/60 border border-slate-800/80 rounded-2xl p-4 text-xs text-slate-400 flex items-start space-x-3">
          <Info className="w-5 h-5 text-sky-400 shrink-0 mt-0.5" />
          <div className="space-y-1 text-[11px]">
            <span className="font-bold text-slate-200 block">¿Es necesario un email real?</span>
            <p>
              No, no es necesario usar un email real ni confirmar correos por internet. Las cuentas de prueba ya están creadas y activas directamente en Supabase Auth con contraseñas encriptadas.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};
