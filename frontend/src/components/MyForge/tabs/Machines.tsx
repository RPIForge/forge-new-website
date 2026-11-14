import React, { useEffect, useState } from 'react';
import Table, { DeleteItem, TableHead, ITEMS_PER_PAGE, ColumnDef, formatCell, usePagedList } from '../components/Table';
import { Machine, MachineGroup, MachineType } from 'src/interfaces';

import '../styles/TabStyles.scss';
import { PlusIcon } from '@radix-ui/react-icons';
import { AdminCheck, AdminField, AdminFormDialog, errorMessage } from '../../Admin/AdminForm';
import { OmniAPI } from 'src/apis/OmniAPI';
import { UserPermission } from 'src/enums';
import useAuth from '../../Auth/useAuth';

interface aemenuprops {
    isDialogOpen: boolean;
    setIsDialogOpen: (open: boolean) => void;
    machine: Machine | null;
    setMachine: (machine: Machine | null) => void;
    refresh: () => void;
}

const AEMenu: React.FC<aemenuprops> = ({ isDialogOpen, setIsDialogOpen, machine, setMachine, refresh }) => {
    const { hasPermission } = useAuth();
    const canCreate = hasPermission(UserPermission.CAN_CREATE_MACHINES);
    const canEdit = hasPermission(UserPermission.CAN_EDIT_MACHINES);
    const canSeeTables = hasPermission(UserPermission.CAN_SEE_TABLES);

    const [name, setName] = useState("");
    const [groupId, setGroupId] = useState("");
    const [typeId, setTypeId] = useState("");
    const [disabled, setDisabled] = useState(false);
    const [maintenanceMode, setMaintenanceMode] = useState(false);
    const [machineGroups, setMachineGroups] = useState<MachineGroup[] | null>(null);
    const [machineTypes, setMachineTypes] = useState<MachineType[] | null>(null);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState("");

    // Only load the dropdown options once the form is actually opened
    useEffect(() => {
        if (!isDialogOpen) return;
        if (machineGroups === null) OmniAPI.getEvery("machinegroups").then(setMachineGroups).catch(() => setMachineGroups([]));
        if (machineTypes === null) OmniAPI.getEvery("machinetypes").then(setMachineTypes).catch(() => setMachineTypes([]));
    }, [isDialogOpen]);

    useEffect(() => {
        setError("");
        setName(machine?.name ?? "");
        setGroupId(machine?.group_id ?? "");
        setTypeId(machine?.type_id ?? "");
        setDisabled(machine?.disabled ?? false);
        setMaintenanceMode(machine?.maintenance_mode ?? false);
    }, [machine, isDialogOpen]);

    const save = async () => {
        if (!name.trim() || !groupId || !typeId) {
            setError("All fields must be filled in.");
            return;
        }
        setBusy(true);
        setError("");
        try {
            if (machine) {
                await OmniAPI.edit("machines", machine.id, { name: name.trim(), group_id: groupId, type_id: typeId, maintenance_mode: maintenanceMode, disabled });
            } else {
                await OmniAPI.create("machines", { name: name.trim(), group_id: groupId, type_id: typeId });
            }
            refresh();
            setIsDialogOpen(false);
        } catch (err) {
            setError(errorMessage(err, "Could not save the machine."));
        } finally {
            setBusy(false);
        }
    };

    if (!canSeeTables || (!canCreate && !canEdit)) return null;
    return (
        <AdminFormDialog
            open={isDialogOpen}
            onOpenChange={(open) => { if (!open) setMachine(null); setIsDialogOpen(open); }}
            title={machine == null ? "Adding a Machine" : "Editing a Machine"}
            onSubmit={save}
            busy={busy}
            error={error}
            trigger={canCreate && (
                <button className="addbtn" aria-label="Add a machine" onClick={() => { setMachine(null); setIsDialogOpen(true); }}>
                    <PlusIcon />
                </button>
            )}
        >
            <AdminField label="Machine Name" htmlFor="machine-name">
                <input id="machine-name" value={name} onChange={e => setName(e.target.value)} maxLength={100} required />
            </AdminField>
            <AdminField label="Machine Group" htmlFor="machine-group">
                <select id="machine-group" value={groupId} onChange={(e) => setGroupId(e.target.value)} required>
                    <option value="" disabled>{machineGroups === null ? "Loading…" : "Select a group"}</option>
                    {(machineGroups ?? []).map((group) => (
                        <option key={group.id} value={group.id}>{group.name}</option>
                    ))}
                </select>
            </AdminField>
            <AdminField label="Machine Type" htmlFor="machine-type">
                <select id="machine-type" value={typeId} onChange={(e) => setTypeId(e.target.value)} required>
                    <option value="" disabled>{machineTypes === null ? "Loading…" : "Select a type"}</option>
                    {(machineTypes ?? []).map((type) => (
                        <option key={type.id} value={type.id}>{type.name}</option>
                    ))}
                </select>
            </AdminField>
            {machine != null && (
                <>
                    <AdminCheck id="machine-maintenance" label="Maintenance Mode" checked={maintenanceMode} onChange={setMaintenanceMode} />
                    <AdminCheck id="machine-disabled" label="Disabled" checked={disabled} onChange={setDisabled} />
                </>
            )}
        </AdminFormDialog>
    );
};


const Machines: React.FC = () => {
    const { hasPermission } = useAuth();
    const canDelete = hasPermission(UserPermission.CAN_DELETE_MACHINES);
    const canEdit = hasPermission(UserPermission.CAN_EDIT_MACHINES);

    const { data, currentPage, hasNext, loading, error, fetchPage, refresh: refreshPage } = usePagedList<Machine>("machines");

    const columnDefs: ColumnDef<Machine>[] = [
        { key: 'name', label: 'Name', render: (m) => m.name },
        { key: 'group', label: 'Group', render: (m) => formatCell(m.group_name) },
        { key: 'type', label: 'Type', render: (m) => formatCell(m.type_name) },
        {
            key: 'status',
            label: 'Status',
            render: (m) => m.disabled ? 'Disabled' : m.maintenance_mode ? 'Maintenance' : (m as any).active_usage_id ? 'In Use' : 'Available',
        },
    ];

    const onDelete = (index_local: number, index_real: number) => {
        if (!canDelete) {
            alert("You do not have the permissions to delete machines");
            return;
        }
        DeleteItem("machines", data[index_real], refreshPage);
    };

    let [machine, setMachine]:[Machine | null, (machine: any) => void] = useState(null);
    let [isDialogOpen, setIsDialogOpen] = useState(false);

    const onEdit = (mach: Machine) => {
        if (!canEdit) {
            alert("You do not have the permissions to edit machines");
            return;
        }
        setMachine(mach);
        setIsDialogOpen(true);
    };

    return (
        <div className='tab-column-cover align-center'>
            <TableHead
                heading="Machines"
                type="machines"
                aemenu={
                    <AEMenu
                        isDialogOpen={isDialogOpen}
                        setIsDialogOpen={setIsDialogOpen}
                        machine={machine}
                        setMachine={setMachine}
                        refresh={refreshPage}
                    />
                }
            />
            <Table<Machine>
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
                resourceType="machines"
            />
        </div>
    );
};

export default Machines;