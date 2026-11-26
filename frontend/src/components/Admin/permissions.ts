import { UserPermission } from 'src/enums';

const P = UserPermission;

// Permissions grouped the same way as the role form in the design
export const PERMISSION_GROUPS: { label: string; permissions: UserPermission[] }[] = [
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
export const permissionLabel = (perm: UserPermission) =>
    PERMISSION_LABELS[perm] ?? perm.replace(/^can/, '').replace(/([A-Z])/g, ' $1').trim();

export const groupedPermissions = (() => {
    const listed = new Set(PERMISSION_GROUPS.flatMap((group) => group.permissions));
    const other = Object.values(UserPermission).filter((perm) => !listed.has(perm));
    return other.length ? [...PERMISSION_GROUPS, { label: 'Other', permissions: other }] : PERMISSION_GROUPS;
})();
