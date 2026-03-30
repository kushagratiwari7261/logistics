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
  LogOut
} from 'lucide-react'

const navItems = [
  {
    to: '/dashboard',
    label: 'Dashboard',
    icon: <LayoutDashboard size={20} />,
  },
  {
    to: '/customers',
    label: 'Customers',
    icon: <Users size={20} />,
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

  const handleLogoutClick = async () => { await onLogout() }
  const handleLinkClick = () => { if (mobileMenuOpen) toggleMobileMenu() }
  const isActive = (path) => location.pathname === path

  // User avatar initials
  const initials = user?.email
    ? user.email.slice(0, 2).toUpperCase()
    : 'SF'
  const emailDisplay = user?.email ?? 'freight@seal.com'

  const NavItem = ({ item, onClick }) => (
    <Link
      to={item.to}
      className={`nav-link ${isActive(item.to) ? 'active' : ''}`}
      onClick={onClick}
    >
      <span className="nav-icon">{item.icon}</span>
      <span className="nav-label">{item.label}</span>
      {isActive(item.to) && <span className="active-indicator" />}
    </Link>
  )

  const UserFooter = () => (
    <div className="sidebar-footer">
      <div className="sidebar-user-badge">
        <div className="sidebar-user-avatar">{initials}</div>
        <div className="sidebar-user-info">
          <div className="sidebar-user-name">{emailDisplay}</div>
          <div className="sidebar-user-role">Freight Admin</div>
        </div>
      </div>
      <div className="sidebar-status-dot">System Online</div>
    </div>
  )

  return (
    <>
      {/* Mobile Header */}
      <div className="mobile-header">
        <button
          className={`hamburger-btn ${mobileMenuOpen ? 'active' : ''}`}
          onClick={toggleMobileMenu}
          aria-label="Menu"
        >
          <span className="hamburger-line" />
          <span className="hamburger-line" />
          <span className="hamburger-line" />
        </button>
        <div className="mobile-logo">
          <img src={sealLogo} alt="Seal Freight" className="logo-text-image" />
        </div>
      </div>

      {/* Mobile Overlay */}
      <div
        className={`mobile-menu-overlay ${mobileMenuOpen ? 'active' : ''}`}
        onClick={toggleMobileMenu}
      >
        <div className="mobile-menu-content" onClick={(e) => e.stopPropagation()}>
          <div className="sidebar-logo-section">
            <img src={sealLogo} alt="Seal Freight" className="logo-text-image" />
            <div className="sidebar-brand-tag">Logistics Platform</div>
          </div>
          <div className="sidebar-section-label">Main Menu</div>
          <nav className="mobile-nav-menu">
            {navItems.map((item) => (
              <NavItem key={item.to} item={item} onClick={handleLinkClick} />
            ))}
          </nav>
          <div className="sidebar-divider" />
          <button onClick={handleLogoutClick} className="nav-link logout-btn" type="button">
            <span className="nav-icon">
              <svg viewBox="0 0 24 24" fill="currentColor">
                <path d="M17 7l-1.41 1.41L18.17 11H8v2h10.17l-2.58 2.59L17 17l5-5zM4 5h8V3H4c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h8v-2H4V5z" />
              </svg>
            </span>
            <span className="nav-label">Logout</span>
          </button>
        </div>
      </div>

      {/* Desktop Sidebar */}
      <aside className="sidebar">
        <div className="sidebar-logo-section">
          <div className="logo-glow">
            <img src={sealLogo} alt="Seal Freight" className="logo-text-image" />
          </div>
          <div className="sidebar-brand-tag">Logistics Platform</div>
        </div>

        <div className="sidebar-section-label">Main Menu</div>

        <nav className="nav-menu">
          {navItems.map((item) => (
            <NavItem key={item.to} item={item} onClick={handleLinkClick} />
          ))}
        </nav>

        <div className="sidebar-divider" />

        <button onClick={handleLogoutClick} className="nav-link logout-btn" type="button">
          <span className="nav-icon">
            <svg viewBox="0 0 24 24" fill="currentColor">
              <path d="M17 7l-1.41 1.41L18.17 11H8v2h10.17l-2.58 2.59L17 17l5-5zM4 5h8V3H4c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h8v-2H4V5z" />
            </svg>
          </span>
          <span className="nav-label">Logout</span>
        </button>

        <UserFooter />
      </aside>
    </>
  )
}

export default Sidebar