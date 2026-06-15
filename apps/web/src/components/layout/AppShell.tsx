import { Link, useLocation } from 'react-router-dom'
import { LayoutDashboard, FolderKanban, PlayCircle, BarChart3, ShieldCheck, Bug, LogOut, FileDown, Upload } from 'lucide-react'
import { useAuthStore } from '@/stores/authStore'

const nav = [
  { to: '/projects', label: 'Projects', icon: FolderKanban },
  { to: '/coverage', label: 'Coverage', icon: ShieldCheck },
  { to: '/bugs', label: 'Bugs', icon: Bug },
  { to: '/test-runs', label: 'Test Runs', icon: PlayCircle },
  { to: '/reports', label: 'Reports', icon: BarChart3 },
  { to: '/export', label: 'Export', icon: FileDown },
  { to: '/import-jobs', label: 'Import Jobs', icon: Upload },
]

export default function AppShell({ children }: { children: React.ReactNode }) {
  const location = useLocation()
  const { user, logout } = useAuthStore()

  return (
    <div className="flex h-screen bg-background">
      <aside className="w-56 border-r flex flex-col">
        <div className="p-4 border-b">
          <div className="flex items-center gap-2">
            <LayoutDashboard className="h-5 w-5 text-primary" />
            <span className="font-semibold text-sm">QA Hub</span>
          </div>
        </div>
        <nav className="flex-1 p-2 space-y-1">
          {nav.map(({ to, label, icon: Icon }) => (
            <Link
              key={to}
              to={to}
              className={`flex items-center gap-2 px-3 py-2 rounded-md text-sm transition-colors ${
                location.pathname.startsWith(to)
                  ? 'bg-primary text-primary-foreground'
                  : 'hover:bg-muted'
              }`}
            >
              <Icon className="h-4 w-4" />
              {label}
            </Link>
          ))}
        </nav>
        <div className="p-4 border-t">
          <div className="text-xs text-muted-foreground mb-2 truncate">{user?.email}</div>
          <button
            onClick={logout}
            className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            <LogOut className="h-4 w-4" />
            Logout
          </button>
        </div>
      </aside>
      <main className="flex-1 overflow-auto p-6">{children}</main>
    </div>
  )
}
