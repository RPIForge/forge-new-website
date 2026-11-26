import React, { useEffect, useState } from 'react';
import { PlusIcon } from '@radix-ui/react-icons';
import { AdminField, AdminFormDialog, errorMessage } from '../../Admin/AdminForm';

import { OmniAPI } from 'src/apis/OmniAPI';
import { Role, User } from 'src/interfaces';
import { UserPermission } from 'src/enums';
import useAuth from '../../Auth/useAuth';
import Table, { TableHead } from '../components/Table';

import '../styles/TabStyles.scss';

type RoleUserRow = Pick<User, 'id' | 'first_name' | 'last_name' | 'RCSID'>;

const UserRoles: React.FC = () => {
    const { hasPermission } = useAuth();

    const canSeeRoles = hasPermission(UserPermission.CAN_SEE_ROLES);
    const canSeeUsers = hasPermission(UserPermission.CAN_SEE_USERS);
    const canChangeUserRoles = hasPermission(UserPermission.CAN_CHANGE_USER_ROLES);

    const [allRoles, setAllRoles] = useState<Role[]>([]);
    const [selectedRoleId, setSelectedRoleId] = useState('');
    const [assignedUsers, setAssignedUsers] = useState<RoleUserRow[]>([]);

    const [assignOpen, setAssignOpen] = useState(false);
    const [allUsers, setAllUsers] = useState<RoleUserRow[] | null>(null);
    const [userQuery, setUserQuery] = useState('');
    const [assignRoleId, setAssignRoleId] = useState('');
    const [busy, setBusy] = useState(false);
    const [formError, setFormError] = useState('');

    const [usersLoading, setUsersLoading] = useState(true);
    const [usersError, setUsersError] = useState('');

    const fetchRoles = async () => {
        try {
            // shouldnt need pagination, since there wont be 1000+ roles
            const res = await OmniAPI.getAll('roles', { limit: 1000, offset: 0, order_by: 'priority' });
            const fetchedRoles = Array.isArray(res) ? (res as Role[]) : [];
            setAllRoles(fetchedRoles);
            if (!selectedRoleId && fetchedRoles.length > 0) {
                setSelectedRoleId(fetchedRoles[0].id);
            }
            if (fetchedRoles.length === 0) setUsersLoading(false);
        } catch {
            setAllRoles([]);
            setUsersLoading(false);
        }
    };

    const fetchUsersForSelectedRole = () => {
        if (!selectedRoleId) {
            setAssignedUsers([]);
            return;
        }

        setUsersLoading(true);
        setUsersError('');
        // This endpoint only returns 20 users per request, so load every page
        OmniAPI.getEvery(`users/role/${selectedRoleId}`)
            .then((res) => {
                const users = Array.isArray(res) ? (res as User[]) : [];
                setAssignedUsers(users.map((activeUser) => ({
                    id: activeUser.id,
                    first_name: activeUser.first_name,
                    last_name: activeUser.last_name,
                    RCSID: activeUser.RCSID,
                })));
            })
            .catch(() => {
                setAssignedUsers([]);
                setUsersError('Could not load the users with this role.');
            })
            .finally(() => setUsersLoading(false));
    };

    // Only load the full user list once the assign form is opened
    useEffect(() => {
        if (!assignOpen || allUsers !== null || !canSeeUsers) return;
        OmniAPI.getEvery('users', { order_by: 'RCSID' })
            .then((res) => setAllUsers((Array.isArray(res) ? (res as User[]) : []).map((activeUser) => ({
                id: activeUser.id,
                first_name: activeUser.first_name,
                last_name: activeUser.last_name,
                RCSID: activeUser.RCSID,
            }))))
            .catch(() => setAllUsers([]));
    }, [assignOpen, canSeeUsers]);

    useEffect(() => {
        if (!canSeeRoles) return;
        void fetchRoles();
    }, [canSeeRoles]);

    useEffect(() => {
        if (!canSeeUsers || !canSeeRoles) return;
        fetchUsersForSelectedRole();
    }, [canSeeUsers, canSeeRoles, selectedRoleId]);

    const onDelete = (index_local: number, index_real: number) => {
        if (!canChangeUserRoles) {
            alert('You do not have permissions to change user roles');
            return;
        }

        const activeUser = assignedUsers[index_real];
        if (!activeUser || !selectedRoleId) return;

        OmniAPI.edit('users', 'role', {
            user_id: activeUser.id,
            role_id: selectedRoleId,
            should_have_role: false,
        }).then(() => {
            fetchUsersForSelectedRole();
        }).catch(() => {
            alert('Failed to remove role from user');
        });
    };

    const userLabel = (activeUser: RoleUserRow) => `${activeUser.RCSID} (${activeUser.first_name} ${activeUser.last_name})`;

    const openAssign = () => {
        setFormError('');
        setUserQuery('');
        setAssignRoleId(selectedRoleId);
        setAssignOpen(true);
    };

    const assignRole = async () => {
        if (!canChangeUserRoles) {
            setFormError('You do not have permissions to change user roles.');
            return;
        }
        const query = userQuery.trim().toLowerCase();
        const match = (allUsers ?? []).find((activeUser) =>
            userLabel(activeUser).toLowerCase() === query || activeUser.RCSID.toLowerCase() === query
        );
        if (!match) {
            setFormError('Pick a user from the list.');
            return;
        }
        if (!assignRoleId) {
            setFormError('Pick a role.');
            return;
        }
        setBusy(true);
        setFormError('');
        try {
            await OmniAPI.edit('users', 'role', {
                user_id: match.id,
                role_id: assignRoleId,
                should_have_role: true,
            });
            if (assignRoleId === selectedRoleId) fetchUsersForSelectedRole();
            else setSelectedRoleId(assignRoleId);
            setAssignOpen(false);
        } catch (err) {
            setFormError(errorMessage(err, 'Failed to add the role to that user.'));
        } finally {
            setBusy(false);
        }
    };

    if (!canSeeRoles || !canSeeUsers) return null;

    return (
        <div className='tab-column-cover align-center'>
            <TableHead heading='User Roles' />
            <div className='admin-roles-toolbar'>
                <label htmlFor='role-select'>Role</label>
                <select
                    id='role-select'
                    value={selectedRoleId}
                    onChange={(e) => setSelectedRoleId(e.target.value)}
                >
                    <option value='' disabled>Select a role</option>
                    {allRoles.map((activeRole) => (
                        <option key={activeRole.id} value={activeRole.id}>
                            {activeRole.name}
                        </option>
                    ))}
                </select>
                {canChangeUserRoles && (
                    <button className='admin-btn' type='button' onClick={openAssign}>
                        <PlusIcon /> Assign Role
                    </button>
                )}
            </div>
            <div style={{ width: '100%' }}>
                <Table<RoleUserRow>
                    columnDefs={[
                        { key: 'name', label: 'Name', render: (u) => `${u.first_name} ${u.last_name}` },
                        { key: 'rcsid', label: 'RCS ID', render: (u) => u.RCSID },
                    ]}
                    loading={usersLoading}
                    error={usersError}
                    emptyMessage='No users have this role yet.'
                    data={assignedUsers}
                    onDelete={canChangeUserRoles ? onDelete : undefined}
                    canDelete={canChangeUserRoles}
                />
            </div>

            <AdminFormDialog
                open={assignOpen}
                onOpenChange={setAssignOpen}
                title='Assign / Change User Role'
                onSubmit={assignRole}
                busy={busy}
                error={formError}
            >
                <AdminField label='Select a User' htmlFor='assign-user'>
                    <input
                        id='assign-user'
                        list='assign-user-options'
                        value={userQuery}
                        onChange={(e) => setUserQuery(e.target.value)}
                        placeholder={allUsers === null ? 'Loading users…' : 'Type a name or RCS ID'}
                        autoComplete='off'
                        required
                    />
                    <datalist id='assign-user-options'>
                        {(allUsers ?? []).map((activeUser) => (
                            <option key={activeUser.id} value={userLabel(activeUser)} />
                        ))}
                    </datalist>
                </AdminField>
                <AdminField label='Select a Role' htmlFor='assign-role'>
                    <select id='assign-role' value={assignRoleId} onChange={(e) => setAssignRoleId(e.target.value)} required>
                        <option value='' disabled>Select a role</option>
                        {allRoles.map((activeRole) => (
                            <option key={activeRole.id} value={activeRole.id}>{activeRole.name}</option>
                        ))}
                    </select>
                </AdminField>
            </AdminFormDialog>
        </div>
    );
};

export default UserRoles;
