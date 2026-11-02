import React, { lazy } from 'react';
import { UserPermission } from 'src/enums';

const Machines = lazy(() => import('../MyForge/tabs/Machines'));
const MachineTypes = lazy(() => import('../MyForge/tabs/MachineTypes'));
const MachineGroups = lazy(() => import('../MyForge/tabs/MachineGroups'));
const Resources = lazy(() => import('../MyForge/tabs/Resources'));
const ResourceSlots = lazy(() => import('../MyForge/tabs/ResourceSlots'));
const Users = lazy(() => import('../MyForge/tabs/Users'));
const Semesters = lazy(() => import('./tabs/SemestersAdmin'));
const ChargeSheets = lazy(() => import('../MyForge/tabs/ChargeSheets'));
const Roles = lazy(() => import('../MyForge/tabs/Roles'));
const UserRoles = lazy(() => import('../MyForge/tabs/UserRoles'));

type Has = (permission: UserPermission) => boolean;

export interface AdminSection {
    path: string;
    label: string;
    element: React.ReactNode;
    visible: (has: Has) => boolean;
}

const withTables = (permission: UserPermission) => (has: Has) =>
    has(UserPermission.CAN_SEE_TABLES) && has(permission);

export const ADMIN_SECTIONS: AdminSection[] = [
    { path: 'machines', label: 'Machines', element: <Machines />, visible: withTables(UserPermission.CAN_SEE_MACHINES) },
    { path: 'machine_types', label: 'Machine Types', element: <MachineTypes />, visible: withTables(UserPermission.CAN_SEE_MACHINE_TYPES) },
    { path: 'machine_groups', label: 'Machine Groups', element: <MachineGroups />, visible: withTables(UserPermission.CAN_SEE_MACHINE_GROUPS) },
    { path: 'resources', label: 'Resources', element: <Resources />, visible: withTables(UserPermission.CAN_SEE_RESOURCES) },
    { path: 'resource_slots', label: 'Resource Slots', element: <ResourceSlots />, visible: withTables(UserPermission.CAN_SEE_RESOURCE_SLOTS) },
    { path: 'users', label: 'Users', element: <Users />, visible: withTables(UserPermission.CAN_SEE_USERS) },
    { path: 'semesters', label: 'Semesters', element: <Semesters />, visible: withTables(UserPermission.CAN_SEE_SEMESTERS) },
    { path: 'charge_sheets', label: 'Charge Sheets', element: <ChargeSheets />, visible: withTables(UserPermission.CAN_GET_CHARGES) },
    { path: 'roles', label: 'Roles', element: <Roles />, visible: (has) => has(UserPermission.CAN_SEE_ROLES) },
    { path: 'user_roles', label: 'User Roles', element: <UserRoles />, visible: (has) => has(UserPermission.CAN_CHANGE_USER_ROLES) },
];

export const canUseAdmin = (has: Has) => ADMIN_SECTIONS.some((section) => section.visible(has));
