import React, { useState } from 'react';
import Table, { ColumnDef, TableHead, formatCell, usePagedList } from '../components/Table';
import { AdminInfoDialog, AdminInfoRow } from '../../Admin/AdminForm';
import { groupedPermissions, permissionLabel } from '../../Admin/permissions';
import { User } from 'src/interfaces';
import { UserPermission } from 'src/enums';
import useAuth from '../../Auth/useAuth';

import '../styles/TabStyles.scss';


// Matches PronounType in backend/schemas/enums.py
const PRONOUN_LABELS: Record<string, string> = {
    not_shown: 'Not shown',
    they_them: 'They/Them',
    he_him: 'He/Him',
    she_her: 'She/Her',
    he_they: 'He/They',
    she_they: 'She/They',
    all_any: 'Any',
    use_name: 'Use my name',
};

const GENDER_LABELS: Record<string, string> = {
    notdisclosed: 'Not disclosed',
    male: 'Male',
    female: 'Female',
    other: 'Other',
};

// Everything we have on a user, shown when their row is clicked
const UserDetails: React.FC<{ user: User | null; onClose: () => void }> = ({ user, onClose }) => {
    const granted = new Set(user?.permissions ?? []);
    const groups = groupedPermissions
        .map((group) => ({ label: group.label, permissions: group.permissions.filter((perm) => granted.has(perm)) }))
        .filter((group) => group.permissions.length > 0);

    return (
        <AdminInfoDialog
            open={user !== null}
            onOpenChange={(open) => { if (!open) onClose(); }}
            title={user ? `${user.first_name} ${user.last_name}` : 'User'}
        >
            {user && (
                <dl className="admin-form__info">
                    <AdminInfoRow label="RCS ID">{user.RCSID}</AdminInfoRow>
                    <AdminInfoRow label="RPI Email">{`${user.RCSID}@rpi.edu`}</AdminInfoRow>
                    <AdminInfoRow label="RIN">{user.RIN}</AdminInfoRow>
                    <AdminInfoRow label="Major">{formatCell(user.major)}</AdminInfoRow>
                    <AdminInfoRow label="Pronouns">{PRONOUN_LABELS[user.pronouns] ?? formatCell(user.pronouns)}</AdminInfoRow>
                    <AdminInfoRow label="Gender Identity">{GENDER_LABELS[user.gender_identity] ?? formatCell(user.gender_identity)}</AdminInfoRow>
                    <AdminInfoRow label="Role">{formatCell(user.display_role)}</AdminInfoRow>
                    <AdminInfoRow label="Balance">{`$${Number(user.semester_balance ?? 0).toFixed(2)} this semester`}</AdminInfoRow>
                    <AdminInfoRow label="Graduating">{formatCell(Boolean(user.is_graduating))}</AdminInfoRow>
                    <AdminInfoRow label="Answered Graduation">{user.checked_graduating ? 'Yes' : 'Not yet'}</AdminInfoRow>
                    <AdminInfoRow label="RPI Staff">{formatCell(Boolean(user.is_rpi_staff))}</AdminInfoRow>
                    <AdminInfoRow label="Email">{user.is_email_verified ? 'Verified' : 'Unverified'}</AdminInfoRow>
                    <AdminInfoRow label="Permissions">
                        {granted.has(UserPermission.IS_SUPERUSER) ? 'Superuser (every permission)' : groups.length === 0 ? 'None' : groups.map((group) => (
                            <div key={group.label}>
                                <p className="admin-form__info-group">{group.label}</p>
                                <ul className="admin-form__perm-list">
                                    {group.permissions.map((perm) => <li key={perm}>{permissionLabel(perm)}</li>)}
                                </ul>
                            </div>
                        ))}
                    </AdminInfoRow>
                </dl>
            )}
        </AdminInfoDialog>
    );
};

const Users: React.FC = () => {

    const { hasPermission } = useAuth();
    const canSeeUsers = hasPermission(UserPermission.CAN_SEE_USERS);
    const canSeeTables = hasPermission(UserPermission.CAN_SEE_TABLES);

    const { data, currentPage, hasNext, loading, error, fetchPage, refresh: refreshPage } = usePagedList<User>('users', {
        enabled: canSeeTables && canSeeUsers,
    });

    // A few combined columns instead of every field, so the table fits without scrolling
    const columnDefs: ColumnDef<User>[] = [
        {
            key: 'name',
            label: 'Name / Pronouns',
            render: (u) => (
                <span className="cell-stack">
                    <strong>{u.first_name} {u.last_name}</strong>
                    <small>{u.RCSID} · {PRONOUN_LABELS[u.pronouns] ?? formatCell(u.pronouns)}</small>
                </span>
            ),
            text: (u) => `${u.first_name} ${u.last_name} (${u.RCSID}, ${PRONOUN_LABELS[u.pronouns] ?? u.pronouns})`,
        },
        { key: 'rin', label: 'RIN', render: (u) => u.RIN },
        { key: 'major', label: 'Major', render: (u) => formatCell(u.major) },
        { key: 'role', label: 'Role', render: (u) => formatCell(u.display_role) },
        { key: 'balance', label: 'Balance', render: (u) => `$${Number(u.semester_balance ?? 0).toFixed(2)}` },
        { key: 'graduating', label: 'Graduating', render: (u) => formatCell(Boolean(u.is_graduating)) },
        { key: 'verified', label: 'Email', render: (u) => u.is_email_verified ? 'Verified' : 'Unverified' },
    ];

    const [selectedUser, setSelectedUser] = useState<User | null>(null);

    if (!canSeeTables || !canSeeUsers) return null;
    return (
        <div className='tab-column-cover align-center'>
            <TableHead
                heading="Users"
            />
            <Table<User>
                columnDefs={columnDefs}
                compact
                loading={loading}
                error={error}
                hasNext={hasNext}
                data={data}
                currentPage={currentPage}
                onPageChange={fetchPage}
                resourceType="users"
                onRowClick={setSelectedUser}
                rowLabel={(u) => `View details for ${u.first_name} ${u.last_name}`}
            />
            <UserDetails user={selectedUser} onClose={() => setSelectedUser(null)} />
        </div>
    );
};

export default Users;