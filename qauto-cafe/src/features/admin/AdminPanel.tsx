import { useState, type ComponentType } from 'react'
import type { Data } from '../../app/useData'
import { Dashboard } from './Dashboard'
import { InventoryScreen } from './InventoryScreen'
import { MenuRecipesScreen } from './MenuRecipesScreen'
import { OrdersLogScreen } from './OrdersLogScreen'
import { BillingScreen } from './BillingScreen'
import { FinanceScreen } from './FinanceScreen'
import { DirectoryScreen } from './DirectoryScreen'
import { BackupScreen } from './BackupScreen'
import { RequestsScreen } from './RequestsScreen'
import { useRequests } from './useRequests'
import {
  DashboardIcon, OrdersIcon, BillingIcon, FinanceIcon, InventoryIcon,
  MenuRecipesIcon, DirectoryIcon, BackupIcon, RequestsIcon, ChevronIcon,
} from './sidebarIcons'
import qautoLogo from '../../assets/brand/qauto-logo.svg'
import qautoWordmark from '../../assets/brand/qauto-wordmark.svg'

const SECTIONS = ['Dashboard', 'Orders', 'Billing', 'Finance', 'Inventory', 'Menu & Recipes', 'Directory', 'Backup', 'Requests'] as const
type Section = typeof SECTIONS[number]

const SECTION_ICONS: Record<Section, ComponentType<{ className?: string }>> = {
  'Dashboard': DashboardIcon,
  'Orders': OrdersIcon,
  'Billing': BillingIcon,
  'Finance': FinanceIcon,
  'Inventory': InventoryIcon,
  'Menu & Recipes': MenuRecipesIcon,
  'Directory': DirectoryIcon,
  'Backup': BackupIcon,
  'Requests': RequestsIcon,
}

export function AdminPanel({ data, refresh }: { data: Data; refresh: () => Promise<void> }) {
  const [section, setSection] = useState<Section>('Dashboard')
  // Held here, not in the screen, so the badge and the list stay in step.
  const requests = useRequests()
  const [collapsed, setCollapsed] = useState(false)
  return (
    <div style={{ display: 'grid', gridTemplateColumns: collapsed ? '80px 1fr' : '224px 1fr', height: '100%', transition: 'grid-template-columns .15s ease' }}>
      <nav style={{ background: '#fff', borderRight: '1px solid #e5e5e5', padding: collapsed ? '0 16px 16px' : '0 14px 20px', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', overflow: 'auto' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          <div style={{ display: 'flex', gap: 10, alignItems: 'center', justifyContent: collapsed ? 'center' : 'flex-start', padding: '18px 2px', borderBottom: '1px solid #eee' }}>
            <img src={qautoLogo} alt="" width={collapsed ? 32 : 44} height={collapsed ? 32 : 44} style={{ borderRadius: 4, flexShrink: 0 }} />
            {!collapsed && <img src={qautoWordmark} alt="Q-Auto" style={{ height: 38, width: 'auto' }} />}
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {!collapsed && <p style={{ margin: 0, fontSize: 12, color: '#ccc', textTransform: 'uppercase', fontWeight: 400 }}>Menu</p>}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
              {SECTIONS.map(s => {
                const Icon = SECTION_ICONS[s]
                const active = s === section
                return (
                  <button
                    key={s}
                    onClick={() => setSection(s)}
                    title={collapsed ? s : undefined}
                    className={`admin-nav-item${active ? ' active' : ''}`}
                    style={{
                      display: 'flex', alignItems: 'center', justifyContent: collapsed ? 'center' : 'flex-start', gap: 10, width: '100%',
                      padding: collapsed ? '10px' : '7px 10px', borderRadius: 8, border: 'none', textAlign: 'left',
                      background: active ? '#1A1A1A' : 'transparent',
                      color: active ? '#fff' : '#666',
                      fontFamily: 'Montserrat, sans-serif', fontSize: 13.5, fontWeight: 400,
                    }}
                  >
                    <Icon className="admin-nav-icon" />
                    {!collapsed && <span style={{ flex: 1 }}>{s}</span>}
                    {/* Outstanding requests are easy to miss on another screen,
                        so the count sits on the tab itself. */}
                    {!collapsed && s === 'Requests' && requests.open > 0 && (
                      <span
                        aria-label={`${requests.open} open request${requests.open === 1 ? '' : 's'}`}
                        style={{
                          minWidth: 20, textAlign: 'center', borderRadius: 999, padding: '1px 7px',
                          fontSize: 12, fontWeight: 800,
                          background: active ? '#fff' : '#1A1A1A',
                          color: active ? '#1A1A1A' : '#fff',
                        }}
                      >
                        {requests.open}
                      </span>
                    )}
                  </button>
                )
              })}
            </div>
          </div>
        </div>
        <button
          onClick={() => setCollapsed(c => !c)}
          title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          className="admin-nav-item"
          style={{
            display: 'flex', alignItems: 'center', justifyContent: collapsed ? 'center' : 'flex-start', gap: 10, width: '100%',
            padding: collapsed ? '10px' : '7px 10px', borderRadius: 8, border: '1px solid #e5e5e5', textAlign: 'left',
            background: '#fff', color: '#666', fontFamily: 'Montserrat, sans-serif', fontSize: 13.5, fontWeight: 400,
          }}
        >
          <span style={{ display: 'inline-flex', transform: collapsed ? 'rotate(180deg)' : 'none', transition: 'transform .15s ease' }}>
            <ChevronIcon className="admin-nav-icon" />
          </span>
          {!collapsed && <span style={{ flex: 1 }}>Collapse</span>}
        </button>
      </nav>
      <section className="font-sans text-foreground" style={{ background: '#FFFFFF', padding: 24, overflow: 'auto' }}>
        {section === 'Dashboard' && <Dashboard data={data} />}
        {section === 'Orders' && <OrdersLogScreen data={data} refresh={refresh} />}
        {section === 'Billing' && <BillingScreen data={data} />}
        {section === 'Finance' && <FinanceScreen data={data} />}
        {section === 'Inventory' && <InventoryScreen data={data} refresh={refresh} />}
        {section === 'Menu & Recipes' && <MenuRecipesScreen data={data} refresh={refresh} />}
        {section === 'Directory' && <DirectoryScreen data={data} refresh={refresh} />}
        {section === 'Backup' && <BackupScreen data={data} refresh={refresh} />}
        {section === 'Requests' && <RequestsScreen data={data} state={requests} refresh={refresh} />}
      </section>
    </div>
  )
}
