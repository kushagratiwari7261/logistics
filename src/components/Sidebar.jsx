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
  UserPlus,
  ClipboardCheck,
  Fingerprint,
  ShieldCheck,
  Search
} from 'lucide-react'
import { useState } from 'react'

const menuSections = [
  {
    title: 'MAIN',
    items: [
      {
        to: '/dashboard',
        label: 'Dashboard',
        icon: <LayoutDashboard size={20} />,
      },
    ],
  },
  {
    title: 'PARTNERS',
    items: [
      {
        label: 'Business Partner',
        icon: <Users size={20} />,
        children: [
          {
            to: '/customers',
            label: 'Customer',
            icon: <Users size={16} />,
          },
          {
            to: '/vendors',
            label: 'Vendor',
            icon: <UserPlus size={16} />,
          },
        ],
      },
    ],
  },
  {
    title: 'OPERATIONS',
    items: [
      {
        to: '/dsr',
        label: 'DSR',
        icon: <FileText size={20} />,
      },
      {
        to: '/invoices',
        label: 'Invoices',
        icon: <FileText size={20} />,
      },
      {
        to: '/job-allocation',
        label: 'Job Allocation',
        icon: <ClipboardCheck size={20} />,
      },
      {
        to: '/job-enquiry',
        label: 'Job Enquiry',
        icon: <Search size={20} />,
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
        to: '/reports',
        label: 'Reports',
        icon: <BarChart3 size={20} />,
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
    ],
  },
  {
    title: 'FINANCE',
    items: [
      {
        to: '/payments',
        label: 'Payments',
        icon: <CreditCard size={20} />,
      },
    ],
  },
  {
    title: 'SETTINGS',
    items: [
      {
        to: '/settings',
        label: 'Settings',
        icon: <Settings size={20} />,
      },
    ],
  },
  {
    title: 'ATTENDANCE',
    items: [
      {
        to: '/attendance',
        label: 'Mark Attendance',
        icon: <Fingerprint size={20} />,
      },
      {
        label: 'Admin & Analytics',
        icon: <ShieldCheck size={20} />,
        children: [
          {
            to: '/admin',
            label: 'Admin Console',
            icon: <ShieldCheck size={16} />,
          },
          {
            to: '/admin/stats',
            label: 'Attendance Stats',
            icon: <BarChart3 size={16} />,
          },
        ],
      },
    ],
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
          <div className="sidebar-navigation">
            {menuSections.map((section) => (
              <div key={section.title} className="sidebar-section">
                <div className="sidebar-section-label">{section.title}</div>
                <nav className="section-nav">
                  {section.items.map((item) => (
                    <NavItem key={item.label} item={item} onClick={handleLinkClick} />
                  ))}
                </nav>
              </div>
            ))}
          </div>
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

        <div className="sidebar-navigation">
          {menuSections.map((section) => (
            <div key={section.title} className="sidebar-section">
              <div className="sidebar-section-label">{section.title}</div>
              <nav className="section-nav">
                {section.items.map((item) => (
                  <NavItem key={item.label} item={item} onClick={handleLinkClick} />
                ))}
              </nav>
            </div>
          ))}
        </div>

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