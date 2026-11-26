import React, { Suspense, useEffect, useRef } from 'react';
import { NavLink, Navigate, Route, Routes, useLocation } from 'react-router-dom';
import useAuth from '../Auth/useAuth';
import { ADMIN_SECTIONS } from './adminSections';

import '../MyForge/styles/TabStyles.scss';
import './Admin.scss';

const Admin: React.FC = () => {
    const { hasPermission } = useAuth();
    const sections = ADMIN_SECTIONS.filter((section) => section.visible(hasPermission));

    const navRef = useRef<HTMLElement>(null);
    const { pathname } = useLocation();

    // Below 900px the section list becomes a sideways scroller, and it starts at
    // the far left -- so on a phone you land on a page whose own section is off
    // screen, with nothing to suggest the strip scrolls. Nudge it into view.
    // Done by hand rather than with scrollIntoView, which would also scroll the
    // page vertically to reach the nav.
    useEffect(() => {
        const nav = navRef.current;
        const active = nav?.querySelector<HTMLElement>('.admin-nav__link.is-active');
        if (!nav || !active) return;

        const left = active.offsetLeft;
        const right = left + active.offsetWidth;
        const gutter = 16;
        const smooth = !window.matchMedia('(prefers-reduced-motion: reduce)').matches;
        const behavior: ScrollBehavior = smooth ? 'smooth' : 'auto';

        if (left < nav.scrollLeft) {
            nav.scrollTo({ left: Math.max(0, left - gutter), behavior });
        } else if (right > nav.scrollLeft + nav.clientWidth) {
            nav.scrollTo({ left: right - nav.clientWidth + gutter, behavior });
        }
    }, [pathname]);

    if (sections.length === 0) {
        return (
            <div className="admin-page admin-page--empty">
                <p>You don’t have access to any admin pages.</p>
            </div>
        );
    }

    return (
        <div className="admin-page">
            <nav className="admin-nav" aria-label="Admin sections" ref={navRef}>
                <ul>
                    {sections.map((section) => (
                        <li key={section.path}>
                            <NavLink
                                to={`/admin/${section.path}`}
                                className={({ isActive }) => (isActive ? 'admin-nav__link is-active' : 'admin-nav__link')}
                            >
                                <span className="admin-nav__dot" aria-hidden="true" />
                                {section.label}
                            </NavLink>
                        </li>
                    ))}
                </ul>
            </nav>
            <main className="admin-content">
                <Suspense fallback={<div className="admin-loading">Loading…</div>}>
                    <Routes>
                        <Route index element={<Navigate to={sections[0].path} replace />} />
                        {sections.map((section) => (
                            <Route key={section.path} path={section.path} element={section.element} />
                        ))}
                        <Route path="*" element={<Navigate to={sections[0].path} replace />} />
                    </Routes>
                </Suspense>
            </main>
        </div>
    );
};

export default Admin;
