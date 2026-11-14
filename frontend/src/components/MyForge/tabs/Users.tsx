import React, { useState, useEffect } from 'react';
import { OmniAPI } from 'src/apis/OmniAPI';
import Table, { ColumnDef, DeleteItem, TableHead, formatCell, usePagedList } from '../components/Table';
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
        { key: 'staff', label: 'RPI Staff', render: (u) => formatCell(Boolean(u.is_rpi_staff)) },
        { key: 'verified', label: 'Email', render: (u) => u.is_email_verified ? 'Verified' : 'Unverified' },
    ];

    const onDelete = (index_local: number, index_real: number) => {
        DeleteItem('users', data[index_real], refreshPage);
    };

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
            />
        </div>
    );
};

export default Users;