import React, { ReactNode, useState } from 'react';
import Table, { DeleteItem, TableHead, ITEMS_PER_PAGE, ColumnDef, formatCell, usePagedList } from '../components/Table';
import { Machine, MachineGroup, MachineType } from 'src/interfaces';

import '../styles/TabStyles.scss';

import { PlusIcon } from '@radix-ui/react-icons';
import { AdminCheck, AdminCheckList, AdminField, AdminFormDialog, errorMessage } from '../../Admin/AdminForm';
import { OmniAPI } from 'src/apis/OmniAPI';
import { UserPermission } from 'src/enums';
import useAuth from '../../Auth/useAuth';

interface aemenuprops {
    isDialogOpen: boolean;
    setIsDialogOpen: (open: boolean) => void;
    machineGroup: MachineGroup | null;
    setMachineGroup: (machine: MachineGroup | null) => void;
    machines: Machine[];
    refresh: () => void;
}

const aemenu = (props: aemenuprops): [ReactNode, (state: boolean, mach: MachineGroup | null) => void] => {
    const { hasPermission } = useAuth();
    const canCreate = hasPermission(UserPermission.CAN_CREATE_MACHINE_GROUPS);
    const canEdit = hasPermission(UserPermission.CAN_EDIT_MACHINE_GROUPS);
    const canSeeTables = hasPermission(UserPermission.CAN_SEE_TABLES);

    const { isDialogOpen, setIsDialogOpen, machineGroup, setMachineGroup, machines, refresh } = props;

    const [name, setName] = useState("");
    const [machineIDS, setMachineIDS] = useState<string[]>([]);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState("");

    const toggleMachine = (id: string) => {
        setMachineIDS(prev => prev.includes(id) ? prev.filter(item => item !== id) : [...prev, id]);
    };

    function setOpenExtra(state: boolean, mach: MachineGroup | null) {
        setError("");
        setMachineGroup(mach);
        if (!state) {
            setIsDialogOpen(false);
            return;
        }
        if (mach != null) {
            setName(mach.name);
            OmniAPI.get("machinegroups", mach.id).then((m) => {
                setMachineIDS(m.machine_ids ?? []);
                setIsDialogOpen(true);
            });
        } else {
            setName("");
            setMachineIDS([]);
            setIsDialogOpen(true);
        }
    }

    const save = async () => {
        if (machineGroup == null ? !canCreate : !canEdit) {
            setError("You do not have the permissions to do this.");
            return;
        }
        if (!name.trim()) {
            setError("Group name must be filled in.");
            return;
        }
        setBusy(true);
        setError("");
        try {
            const body = { name: name.trim(), machine_ids: machineIDS };
            if (machineGroup) await OmniAPI.edit("machinegroups", machineGroup.id, body);
            else await OmniAPI.create("machinegroups", body);
            refresh();
            setOpenExtra(false, null);
        } catch (err) {
            setError(errorMessage(err, "Could not save the machine group."));
        } finally {
            setBusy(false);
        }
    };

    if (!canSeeTables || (!canCreate && !canEdit)) return [null, setOpenExtra];
    return [(
        <AdminFormDialog
            open={isDialogOpen}
            onOpenChange={(open) => setOpenExtra(open, machineGroup)}
            title={machineGroup == null ? "Adding a Machine Group" : "Editing a Machine Group"}
            onSubmit={save}
            busy={busy}
            error={error}
            trigger={canCreate && (
                <button className="addbtn" aria-label="Add a machine group" onClick={() => setOpenExtra(true, null)}><PlusIcon /></button>
            )}
        >
            <AdminField label="Group Name" htmlFor="group-name">
                <input id="group-name" value={name} onChange={e => setName(e.target.value)} maxLength={100} required />
            </AdminField>
            <AdminCheckList empty="No machines yet.">
                {machines.map((machine) => (
                    <AdminCheck
                        key={machine.id}
                        id={`group-machine-${machine.id}`}
                        label={machine.name}
                        checked={machineIDS.includes(machine.id)}
                        onChange={() => toggleMachine(machine.id)}
                    />
                ))}
            </AdminCheckList>
        </AdminFormDialog>
    ), setOpenExtra];
};

const MachineGroups: React.FC = () => {
    const { hasPermission } = useAuth();
    const canDelete = hasPermission(UserPermission.CAN_DELETE_MACHINE_GROUPS);
    const canEdit = hasPermission(UserPermission.CAN_EDIT_MACHINE_GROUPS);

    const [machines, setMachines] = useState<Machine[]>([]);
    const machinesRef = React.useRef<Promise<Machine[]> | null>(null);
    const loadMachines = () => {
        if (!machinesRef.current) {
            machinesRef.current = OmniAPI.getEvery("machines").then((list: Machine[]) => {
                setMachines(list);
                return list;
            });
        }
        return machinesRef.current;
    };

    // Machine names are fetched once and reused for every page and for the form
    const { data, currentPage, hasNext, loading, error, fetchPage, refresh: refreshPage } = usePagedList<MachineGroup>("machinegroups", {
        transform: async (groups: any[]) => {
            const machineList = await loadMachines().catch(() => [] as Machine[]);
            const names: Record<string, string> = {};
            machineList.forEach(m => names[m.id] = m.name);
            return groups.map((g) => ({
                id: g.id,
                name: g.name,
                machines: (g.machine_ids ?? []).map((id: string) => names[id] ?? 'Unknown machine'),
            }));
        },
    });

    const columnDefs: ColumnDef<MachineGroup>[] = [
        { key: 'name', label: 'Name', render: (g) => g.name },
        { key: 'count', label: 'Machines', render: (g) => String(g.machines.length) },
        { key: 'list', label: 'Members', render: (g) => formatCell(g.machines) },
    ];

    const onDelete = (index_local: number, index_real: number) => {
        if (!canDelete) {
            alert("You do not have the permissions to delete machine groups");
            return;
        }
        DeleteItem("machinegroups", data[index_real],  refreshPage);
    };

    let [machineGroup, setMachineGroup]:[MachineGroup | null, (machineGroup: any) => void] = useState(null);
    let [isDialogOpen, setIsDialogOpen] = useState(false);
    let [ae, setOpen] = aemenu({isDialogOpen, setIsDialogOpen, machineGroup, setMachineGroup, machines, refresh: refreshPage});

    return (
        <div className='tab-column-cover align-center'>
            <TableHead
                heading="Machine Groups"
                type="machinegroup"
                aemenu={ae}
            />
            <Table<MachineGroup>
                columnDefs={columnDefs}
                loading={loading}
                error={error}
                hasNext={hasNext}
                data={data}
                onDelete={onDelete}
                onEdit={(e) => setOpen(true, e)}
                canEdit={canEdit}
                canDelete={canDelete}
                currentPage={currentPage}
                onPageChange={fetchPage}
                resourceType="machinegroups"
            />
        </div>
    );
};

export default MachineGroups;