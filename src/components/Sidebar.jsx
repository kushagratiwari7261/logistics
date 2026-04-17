import { Link, useLocation } from 'react-router-dom'
import sealLogo from '../seal.png'
import './Sidebar.css'
import { 
  LayoutDashboard, 
  Users, 
  Ship, 
  MapPin, 
  FileText, 
  CreditCard, 
  Briefcase, 
  MessageSquare, 
  BarChart3, 
  Settings,
  LogOut,
  ChevronDown,
  ChevronRight,
  UserPlus
} from 'lucide-react'
import { useState } from 'react'

const navItems = [
  {
    to: '/dashboard',
    label: 'Dashboard',
    icon: <LayoutDashboard size={20} />,
  },
  {
    label: 'Business Partner',
    icon: <Users size={20} />,
    children: [
      {
        to: '/vendors',
        label: 'Vendor',
        icon: <UserPlus size={16} />,
      },
      {
        to: '/customers',
        label: 'Customer',
        icon: <Users size={16} />,
      },
    ]
  },
  {
    to: '/new-shipment',
    label: 'Shipments',
    icon: <Ship size={20} />,
  },
  {
    to: '/tracking',
    label: 'Tracking',
    icon: <MapPin size={20} />,
  },
  {
    to: '/invoices',
    label: 'Invoices',
    icon: <FileText size={20} />,
  },
  {
    to: '/payments',
    label: 'Payments',
    icon: <CreditCard size={20} />,
  },
  {
    to: '/job-orders',
    label: 'Job Orders',
    icon: <Briefcase size={20} />,
  },
  {
    to: '/messages',
    label: 'Messages',
    icon: <MessageSquare size={20} />,
  },
  {
    to: '/dsr',
    label: 'DSR',
    icon: <FileText size={20} />,
  },
  {
    to: '/reports',
    label: 'Reports',
    icon: <BarChart3 size={20} />,
  },
  {
    to: '/settings',
    label: 'Settings',
    icon: <Settings size={20} />,
  },
]

const Sidebar = ({ mobileMenuOpen, toggleMobileMenu, onLogout, user }) => {
  const location = useLocation()
  const [expandedItems, setExpandedItems] = useState(['Business Partner'])

  const handleLogoutClick = async () => { await onLogout() }
  const handleLinkClick = () => { if (mobileMenuOpen) toggleMobileMenu() }
  const isActive = (path) => location.pathname === path
  
  const toggleExpand = (label) => {
    setExpandedItems(prev => 
      prev.includes(label) 
        ? prev.filter(item => item !== label)
        : [...prev, label]
    )
  }

  // User avatar initials
  const initials = user?.email
    ? user.email.slice(0, 2).toUpperCase()
    : 'SF'
  const emailDisplay = user?.email ?? 'freight@seal.com'

  const NavItem = ({ item, onClick, isSubItem = false }) => {
    const hasChildren = item.children && item.children.length > 0
    const isExpanded = expandedItems.includes(item.label)
    const active = isActive(item.to) || (hasChildren && item.children.some(child => isActive(child.to)))

    if (hasChildren) {
      return (
        <div className={`nav-item-group ${isExpanded ? 'active-group' : ''}`}>
          <button
            className={`nav-link ${active ? 'active' : ''}`}
            onClick={() => toggleExpand(item.label)}
            type="button"
          >
            <span className="nav-icon">{item.icon}</span>
            <span className="nav-label">{item.label}</span>
            <span className="expand-icon">
              {isExpanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
            </span>
          </button>
          {isExpanded && (
            <div className="sub-menu">
              {item.children.map((child) => (
                <NavItem key={child.to} item={child} onClick={onClick} isSubItem={true} />
              ))}
            </div>
          )}
        </div>
      )
    }

    return (
      <Link
        to={item.to}
        className={`nav-link ${isActive(item.to) ? 'active' : ''} ${isSubItem ? 'sub-nav-link' : ''}`}
        onClick={onClick}
      >
        <span className="nav-icon">{item.icon}</span>
        <span className="nav-label">{item.label}</span>
        {isActive(item.to) && <span className="active-indicator" />}
      </Link>
    )
  }

  const UserFooter = () => (
    <div style={{
      padding: '20px',
      borderTop: '1px solid var(--border-subtle)',
      display: 'flex',
      alignItems: 'center',
      gap: '12px',
      marginTop: 'auto'
    }}>
      <div style={{
        width: 36, height: 36, borderRadius: '50%',
        background: 'var(--brand-gradient)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        color: '#fff', fontSize: 13, fontWeight: 700
      }}>
        {initials}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{emailDisplay}</div>
        <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>Freight Administrator</div>
      </div>
    </div>
  )

  return (
    <>
      <aside className="sidebar">
        <div className="sidebar-header">
          <div className="logo-icon">
            <Ship size={24} />
          </div>
          <div className="logo-text">Seal Freight</div>
        </div>

        <nav className="sidebar-nav">
          <div className="nav-section">
            <h3 className="nav-section-title">Main Fleet</h3>
            {navItems.map((item) => (
              <Link 
                key={item.label}
                to={item.to || '#'} 
                className={`nav-item ${isActive(item.to) ? 'active' : ''}`}
                onClick={handleLinkClick}
              >
                <span style={{ opacity: isActive(item.to) ? 1 : 0.7 }}>{item.icon}</span>
                <span>{item.label}</span>
              </Link>
            ))}
          </div>
        </nav>

        <UserFooter />
        
        <button 
          onClick={handleLogoutClick} 
          className="nav-item"
          style={{ margin: '0 16px 16px', border: 'none', background: 'none', width: 'auto', color: '#ef4444' }}
        >
          <LogOut size={18} />
          <span>Logout</span>
        </button>
      </aside>
    </>
  )
}

export default Sidebar