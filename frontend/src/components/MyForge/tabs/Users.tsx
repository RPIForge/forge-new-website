import React, { ReactNode, useState } from 'react';
import Table, { ColumnDef, TableHead, formatCell, usePagedList } from '../components/Table';
import { AdminCheck, AdminField, AdminFormDialog, AdminInfoDialog, AdminInfoRow, errorMessage } from '../../Admin/AdminForm';
import { groupedPermissions, permissionLabel } from '../../Admin/permissions';
import { OmniAPI } from 'src/apis/OmniAPI';
import { User } from 'src/interfaces';
import { UserPermission } from 'src/enums';
import useAuth from '../../Auth/useAuth';

import '../styles/TabStyles.scss';

import Majors from '../../../data/sorted_majors.json';
import Genders from '../../../data/genders.json';
import Pronouns from '../../../data/pronouns.json';


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

interface aemenuprops {
    isDialogOpen: boolean;
    setIsDialogOpen: (open: boolean) => void;
    user: User | null;
    setUser: (user: User | null) => void;
    refresh: () => void;
}

// The edit form behind the pencil on each row. There is no "add" case here:
// users arrive by registering, so this only ever edits an existing one.
const aemenu = (props: aemenuprops): [ReactNode, (state: boolean, user: User | null) => void] => {
    const { isDialogOpen, setIsDialogOpen, user, setUser, refresh } = props;

    const { hasPermission } = useAuth();
    const canEdit = hasPermission(UserPermission.CAN_EDIT_USERS);

    const [isRpiStaff, setIsRpiStaff] = useState(false);
    const [RCSID, setRCSID] = useState("");
    const [RIN, setRIN] = useState("");
    const [firstName, setFirstName] = useState("");
    const [lastName, setLastName] = useState("");
    const [major, setMajor] = useState("_");
    const [genderIdentity, setGenderIdentity] = useState("_");
    const [pronouns, setPronouns] = useState("_");
    const [isGraduating, setIsGraduating] = useState(false);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState("");

    const setOpenExtra = (state: boolean, target: User | null) => {
        setError("");
        setUser(target);
        setIsRpiStaff(target?.is_rpi_staff ?? false);
        setRCSID(target?.RCSID ?? "");
        setRIN(target?.RIN ?? "");
        setFirstName(target?.first_name ?? "");
        setLastName(target?.last_name ?? "");
        setMajor(target?.major || "_");
        setGenderIdentity(target?.gender_identity || "_");
        setPronouns(target?.pronouns || "_");
        setIsGraduating(target?.is_graduating ?? false);
        if (isDialogOpen != state) setIsDialogOpen(state);
    };

    const save = async () => {
        if (!canEdit) {
            setError("You do not have the permissions to do this.");
            return;
        }
        if (user == null) return;
        if (!RCSID.trim() || !RIN.trim() || !firstName.trim() || !lastName.trim()) {
            setError("RCS ID, RIN, first name and last name are all required.");
            return;
        }
        setBusy(true);
        setError("");
        try {
            await OmniAPI.edit("users/edit", user.id, {
                is_rpi_staff: isRpiStaff,
                RCSID: RCSID.trim(),
                RIN: RIN.trim(),
                first_name: firstName.trim(),
                last_name: lastName.trim(),
                // "_" is the placeholder option, i.e. nothing chosen. The backend
                // leaves a field alone when it comes through as null.
                major: major === "_" ? null : major,
                gender_identity: genderIdentity === "_" ? null : genderIdentity,
                pronouns: pronouns === "_" ? null : pronouns,
                is_graduating: isGraduating,
            });
            refresh();
            setOpenExtra(false, null);
        } catch (err) {
            setError(errorMessage(err, "Could not save the user."));
        } finally {
            setBusy(false);
        }
    };

    if (!canEdit) return [null, () => {}];
    return [(
        <AdminFormDialog
            open={isDialogOpen}
            onOpenChange={(open) => setOpenExtra(open, open ? user : null)}
            title={user ? `Editing ${user.first_name} ${user.last_name}` : 'Editing User'}
            onSubmit={save}
            busy={busy}
            error={error}
        >
            <AdminField label="RCS ID" htmlFor="user-rcsid">
                <input id="user-rcsid" value={RCSID} onChange={e => setRCSID(e.target.value)} maxLength={10} required />
            </AdminField>
            <AdminField label="RIN" htmlFor="user-rin">
                <input id="user-rin" value={RIN} onChange={e => setRIN(e.target.value)} maxLength={9} required />
            </AdminField>
            <AdminField label="First Name" htmlFor="user-first-name">
                <input id="user-first-name" value={firstName} onChange={e => setFirstName(e.target.value)} maxLength={100} required />
            </AdminField>
            <AdminField label="Last Name" htmlFor="user-last-name">
                <input id="user-last-name" value={lastName} onChange={e => setLastName(e.target.value)} maxLength={100} required />
            </AdminField>
            <AdminField label="Major" htmlFor="user-major">
                <select id="user-major" value={major} onChange={e => setMajor(e.target.value)}>
                    <option value="_" hidden>Select Major</option>
                    {Majors.Majors.map((m: string) => (
                        <option key={m} value={m}>{m}</option>
                    ))}
                </select>
            </AdminField>
            <AdminField label="Gender Identity" htmlFor="user-gender">
                <select id="user-gender" value={genderIdentity} onChange={e => setGenderIdentity(e.target.value)}>
                    <option value="_" hidden>Select Gender Identity</option>
                    {Genders.Genders.map((gender) => (
                        <option key={gender.Gender} value={gender.Gender}>{gender['Display Value']}</option>
                    ))}
                </select>
            </AdminField>
            <AdminField label="Pronouns" htmlFor="user-pronouns">
                <select id="user-pronouns" value={pronouns} onChange={e => setPronouns(e.target.value)}>
                    <option value="_" hidden>Select Pronouns</option>
                    {Pronouns.Pronouns.map((pronoun) => (
                        <option key={pronoun.Pronouns} value={pronoun.Pronouns}>{pronoun['Display Value']}</option>
                    ))}
                </select>
            </AdminField>
            <AdminCheck
                id="user-is-staff"
                label="Is RPI staff?"
                checked={isRpiStaff}
                onChange={setIsRpiStaff}
            />
            <AdminCheck
                id="user-is-graduating"
                label="Is graduating?"
                checked={isGraduating}
                onChange={setIsGraduating}
            />
        </AdminFormDialog>
    ), setOpenExtra];
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
    const canEdit = hasPermission(UserPermission.CAN_EDIT_USERS);

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

    const [editingUser, setEditingUser] = useState<User | null>(null);
    const [isDialogOpen, setIsDialogOpen] = useState(false);
    const [ae, setOpen] = aemenu({
        isDialogOpen,
        setIsDialogOpen,
        user: editingUser,
        setUser: setEditingUser,
        refresh: refreshPage,
    });

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
                onEdit={(u) => { setOpen(true, u); }}
                canEdit={canEdit}
                onRowClick={setSelectedUser}
                rowLabel={(u) => `View details for ${u.first_name} ${u.last_name}`}
            />
            {ae}
            <UserDetails user={selectedUser} onClose={() => setSelectedUser(null)} />
        </div>
    );
};

export default Users;
