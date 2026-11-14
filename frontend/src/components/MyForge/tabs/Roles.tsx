import React, { ReactNode, useState } from 'react';
import { OmniAPI } from 'src/apis/OmniAPI';
import Table, { DeleteItem, ITEMS_PER_PAGE, TableHead, ColumnDef, formatCell, usePagedList } from '../components/Table';
import { Role } from 'src/interfaces';
import { UserPermission } from 'src/enums';
import useAuth from '../../Auth/useAuth';
import { PlusIcon } from '@radix-ui/react-icons';
import { AdminCheck, AdminField, AdminFormDialog, AdminFormHeading, errorMessage } from '../../Admin/AdminForm';
// @ts-ignore temporary: stylesheet module typing not configured in this project path yet // this'll get fixed soon
import '../styles/TabStyles.scss';

interface AEMenuProps {
    isDialogOpen: boolean;
    setIsDialogOpen: (open: boolean) => void;
    role: Role | null;
    setRole: (role: Role | null) => void;
    refresh: () => void;
}

const P = UserPermission;

// Permissions grouped the same way as the role form in the design
const PERMISSION_GROUPS: { label: string; permissions: UserPermission[] }[] = [
    { label: 'Member', permissions: [P.CAN_USE_MACHINES, P.CAN_USE_MACHINES_BETWEEN_SEMESTERS] },
    { label: 'Volunteer', permissions: [P.CAN_CLEAR_MACHINES, P.CAN_FAIL_MACHINES, P.CAN_VIEW_FAILURE_LOGS] },
    { label: 'Admin Page', permissions: [P.CAN_SEE_TABLES, P.CAN_SEE_USERS, P.CAN_EDIT_USER_CORE_INFO, P.CAN_CREATE_ORGS] },
    { label: 'Machines', permissions: [P.CAN_SEE_MACHINES, P.CAN_CREATE_MACHINES, P.CAN_EDIT_MACHINES, P.CAN_DELETE_MACHINES] },
    { label: 'Machine Types', permissions: [P.CAN_SEE_MACHINE_TYPES, P.CAN_CREATE_MACHINE_TYPES, P.CAN_EDIT_MACHINE_TYPES, P.CAN_DELETE_MACHINE_TYPES] },
    { label: 'Machine Groups', permissions: [P.CAN_SEE_MACHINE_GROUPS, P.CAN_CREATE_MACHINE_GROUPS, P.CAN_EDIT_MACHINE_GROUPS, P.CAN_DELETE_MACHINE_GROUPS] },
    { label: 'Resources', permissions: [P.CAN_SEE_RESOURCES, P.CAN_CREATE_RESOURCES, P.CAN_EDIT_RESOURCES, P.CAN_DELETE_RESOURCES] },
    { label: 'Resource Slots', permissions: [P.CAN_SEE_RESOURCE_SLOTS, P.CAN_CREATE_RESOURCE_SLOTS, P.CAN_EDIT_RESOURCE_SLOTS, P.CAN_DELETE_RESOURCE_SLOTS] },
    { label: 'Semesters & Charges', permissions: [P.CAN_SEE_SEMESTERS, P.CAN_CREATE_SEMESTERS, P.CAN_EDIT_SEMESTERS, P.CAN_DELETE_SEMESTERS, P.CAN_CHANGE_SEMESTER, P.CAN_GET_CHARGES] },
    { label: 'Roles', permissions: [P.CAN_SEE_ROLES, P.CAN_CREATE_ROLES, P.CAN_EDIT_ROLES, P.CAN_DELETE_ROLES, P.CAN_CHANGE_USER_ROLES] },
    { label: 'Safety', permissions: [P.ROLE_CHANGE_IMMUNE, P.CAN_CONTROL_LOCKOUT, P.LOCKOUT] },
    { label: 'Superuser', permissions: [P.IS_SUPERUSER] },
];

const PERMISSION_LABELS: Partial<Record<UserPermission, string>> = {
    [P.CAN_USE_MACHINES]: 'Use a Machine',
    [P.CAN_USE_MACHINES_BETWEEN_SEMESTERS]: 'Use a Machine in Summer',
    [P.CAN_CLEAR_MACHINES]: 'Clear Machines',
    [P.CAN_FAIL_MACHINES]: 'Fail Machines',
    [P.CAN_SEE_TABLES]: 'Open the Admin Page',
    [P.CAN_GET_CHARGES]: 'Get Charge Sheets',
    [P.CAN_CHANGE_SEMESTER]: 'Change the Current Semester',
    [P.CAN_CHANGE_USER_ROLES]: 'Change User Roles',
    [P.ROLE_CHANGE_IMMUNE]: 'Immune to Role Changes',
    [P.LOCKOUT]: 'Locked Out',
    [P.IS_SUPERUSER]: 'Superuser',
};

// "canSeeMachineTypes" -> "See Machine Types"
const permissionLabel = (perm: UserPermission) =>
    PERMISSION_LABELS[perm] ?? perm.replace(/^can/, '').replace(/([A-Z])/g, ' $1').trim();

const groupedPermissions = (() => {
    const listed = new Set(PERMISSION_GROUPS.flatMap((group) => group.permissions));
    const other = Object.values(UserPermission).filter((perm) => !listed.has(perm));
    return other.length ? [...PERMISSION_GROUPS, { label: 'Other', permissions: other }] : PERMISSION_GROUPS;
})();

const aemenu = (props: AEMenuProps): [ReactNode, (state: boolean, role: Role | null) => void] => {
    const { isDialogOpen, setIsDialogOpen, role, setRole, refresh } = props;

    const { hasPermission } = useAuth();
    const canCreate = hasPermission(UserPermission.CAN_CREATE_ROLES);
    const canEdit = hasPermission(UserPermission.CAN_EDIT_ROLES);

    const [name, setName] = useState('');
    const [priority, setPriority] = useState<number | ''>(0);
    const [displayRole, setDisplayRole] = useState(false);
    const [permissions, setPermissions] = useState<UserPermission[]>([]);
    const [inversePermissions, setInversePermissions] = useState<UserPermission[]>([]);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState('');

    const setOpenExtra = (state: boolean, activeRole: Role | null) => {
        setError('');
        setRole(activeRole);
        setName(activeRole?.name ?? '');
        setPriority(activeRole?.priority ?? 0);
        setDisplayRole(activeRole?.display_role ?? false);
        setPermissions((activeRole?.permissions ?? []) as UserPermission[]);
        setInversePermissions((activeRole?.inverse_permissions ?? []) as UserPermission[]);
        if (isDialogOpen !== state) setIsDialogOpen(state);
    };

    // Y grants a permission, N explicitly takes it away; a permission can't be both
    const togglePermission = (perm: UserPermission) => {
        if (permissions.includes(perm)) {
            setPermissions((prev) => prev.filter((p) => p !== perm));
            return;
        }
        setPermissions((prev) => [...prev, perm]);
        setInversePermissions((prev) => prev.filter((p) => p !== perm));
    };

    const toggleInversePermission = (perm: UserPermission) => {
        if (inversePermissions.includes(perm)) {
            setInversePermissions((prev) => prev.filter((p) => p !== perm));
            return;
        }
        setInversePermissions((prev) => [...prev, perm]);
        setPermissions((prev) => prev.filter((p) => p !== perm));
    };

    const save = async () => {
        if (role == null ? !canCreate : !canEdit) {
            setError('You do not have the permissions to do this.');
            return;
        }
        if (!name.trim()) {
            setError('Role name is required.');
            return;
        }
        setBusy(true);
        setError('');
        try {
            const body = {
                name: name.trim(),
                permissions,
                inverse_permissions: inversePermissions,
                display_role: displayRole,
                priority: priority === '' ? 0 : priority,
            };
            if (role) await OmniAPI.edit('roles', role.id, { role_id: role.id, ...body });
            else await OmniAPI.create('roles', body);
            refresh();
            setOpenExtra(false, null);
        } catch (err) {
            setError(errorMessage(err, 'Could not save the role.'));
        } finally {
            setBusy(false);
        }
    };

    if (!canCreate && !canEdit) return [null, () => {}];
    return [(
        <AdminFormDialog
            open={isDialogOpen}
            onOpenChange={(open) => setOpenExtra(open, role)}
            title={role == null ? 'Adding a Role' : 'Editing a Role'}
            onSubmit={save}
            busy={busy}
            error={error}
            trigger={canCreate && (
                <button className="addbtn" aria-label="Add a role" onClick={() => setOpenExtra(true, null)}><PlusIcon /></button>
            )}
        >
            <AdminField label="Name" htmlFor="role-name">
                <input id="role-name" value={name} onChange={(e) => setName(e.target.value)} maxLength={100} required />
            </AdminField>
            <AdminField label="Priority" htmlFor="role-priority">
                <input
                    id="role-priority"
                    type="number"
                    inputMode="numeric"
                    value={priority}
                    onChange={(e) => setPriority(e.target.value === '' ? '' : Number(e.target.value))}
                />
            </AdminField>
            <AdminCheck id="role-display" label="Display Role" checked={displayRole} onChange={setDisplayRole} />

            <AdminFormHeading>Permission Settings</AdminFormHeading>
            <div className="admin-form__perms">
                <div className="admin-form__perm-head" aria-hidden="true">
                    <span />
                    <span>Y</span>
                    <span>N</span>
                </div>
                {groupedPermissions.map((group) => (
                    <div key={group.label} role="group" aria-label={group.label}>
                        <p className="admin-form__perm-group">{group.label}</p>
                        {group.permissions.map((perm) => (
                            <div className="admin-form__perm-row" key={perm}>
                                <span>{permissionLabel(perm)}</span>
                                <input
                                    type="checkbox"
                                    aria-label={`Grant ${permissionLabel(perm)}`}
                                    checked={permissions.includes(perm)}
                                    onChange={() => togglePermission(perm)}
                                />
                                <input
                                    type="checkbox"
                                    className="is-deny"
                                    aria-label={`Deny ${permissionLabel(perm)}`}
                                    checked={inversePermissions.includes(perm)}
                                    onChange={() => toggleInversePermission(perm)}
                                />
                            </div>
                        ))}
                    </div>
                ))}
            </div>
        </AdminFormDialog>
    ), setOpenExtra];
};

const Roles: React.FC = () => {

    const { hasPermission } = useAuth();
    const canSeeRoles = hasPermission(UserPermission.CAN_SEE_ROLES);
    const canDelete = hasPermission(UserPermission.CAN_DELETE_ROLES);
    const canEdit = hasPermission(UserPermission.CAN_EDIT_ROLES);

    const { data, currentPage, hasNext, loading, error, fetchPage, refresh: refreshPage } = usePagedList<Role>("roles", { params: { order_by: 'priority' } });

    const columnDefs: ColumnDef<Role>[] = [
        { key: 'name', label: 'Name', render: (r) => r.name },
        { key: 'priority', label: 'Priority', render: (r) => String(r.priority) },
        { key: 'display', label: 'Shown', render: (r) => formatCell(r.display_role) },
        {
            key: 'permissions',
            label: 'Permissions',
            render: (r) => {
                const granted = r.permissions?.length ?? 0;
                const denied = r.inverse_permissions?.length ?? 0;
                return r.permissions?.includes(UserPermission.IS_SUPERUSER) ? 'Superuser' : `${granted} granted${denied ? `, ${denied} denied` : ''}`;
            },
            text: (r) => [...(r.permissions ?? []).map((p) => permissionLabel(p as UserPermission)), ...(r.inverse_permissions ?? []).map((p) => `No ${permissionLabel(p as UserPermission)}`)].join(', '),
        },
    ];

    const onDelete = (index_local: number, index_real: number) => {
        if (!canDelete) {
            alert('You do not have the permissions to delete roles');
            return;
        }
        DeleteItem('roles', data[index_real], refreshPage);
    };

    const [role, setRole] = useState<Role | null>(null);
    const [isDialogOpen, setIsDialogOpen] = useState(false);
    const [ae, setOpen] = aemenu({ isDialogOpen, setIsDialogOpen, role, setRole, refresh: refreshPage });

    const onEdit = (activeRole: Role) => {
        if (!canEdit) {
            alert('You do not have the permissions to edit roles');
            return;
        }
        setOpen(true, activeRole);
    };

    if (!canSeeRoles) return null;
    return (
        <div className='tab-column-cover align-center'>
            <TableHead heading="Roles" type="roles" aemenu={ae} />
            <Table<Role>
                columnDefs={columnDefs}
                loading={loading}
                error={error}
                hasNext={hasNext}
                data={data}
                onDelete={onDelete}
                onEdit={onEdit}
                canEdit={canEdit}
                canDelete={canDelete}
                currentPage={currentPage}
                onPageChange={fetchPage}
                resourceType="roles"
            />
        </div>
    );
};

export default Roles;
