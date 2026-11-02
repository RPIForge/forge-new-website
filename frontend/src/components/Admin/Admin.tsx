import React, { Suspense } from 'react';
import { NavLink, Navigate, Route, Routes } from 'react-router-dom';
import useAuth from '../Auth/useAuth';
import { ADMIN_SECTIONS } from './adminSections';

import '../MyForge/styles/TabStyles.scss';
import './Admin.scss';

const Admin: React.FC = () => {
    const { hasPermission } = useAuth();
    const sections = ADMIN_SECTIONS.filter((section) => section.visible(hasPermission));

    if (sections.length === 0) {
        return (
            <div className="admin-page admin-page--empty">
                <p>You don’t have access to any admin pages.</p>
            </div>
        );
    }

    return (
        <div className="admin-page">
            <nav className="admin-nav" aria-label="Admin sections">
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
