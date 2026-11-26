import React, { ReactNode, useState } from 'react';
import Table, { DeleteItem, ITEMS_PER_PAGE, ColumnDef, formatCell, usePagedList } from '../components/Table';
import { TableHead } from '../components/Table';

import '../styles/TabStyles.scss';
import { emptyMachine, MachineType, ResourceSlot } from 'src/interfaces';

import { PlusIcon } from "@radix-ui/react-icons";
import { AdminCheck, AdminCheckList, AdminField, AdminFormDialog, AdminFormHeading, errorMessage } from '../../Admin/AdminForm';
import { OmniAPI } from 'src/apis/OmniAPI';
import { UserPermission } from 'src/enums';
import useAuth from '../../Auth/useAuth';

interface aemenuprops {
    isDialogOpen: boolean;
    setIsDialogOpen: (open: boolean) => void;
    machineType: MachineType | null;
    setMachineType: (machine: MachineType | null) => void;
    refresh: () => void;
}

const aemenu = (props: aemenuprops): [ReactNode, (state: boolean, mach: MachineType | null) => void] => {
    const { isDialogOpen, setIsDialogOpen, machineType, setMachineType, refresh } = props;

    const { hasPermission } = useAuth();
    const canCreate = hasPermission(UserPermission.CAN_CREATE_MACHINE_TYPES);
    const canEdit = hasPermission(UserPermission.CAN_EDIT_MACHINE_TYPES);
    const canSeeTables = hasPermission(UserPermission.CAN_SEE_TABLES);

    const [name, setName] = useState("");
    const [cost, setCost] = useState<number | "">(0);
    const [resourceSlots, setResourceSlots] = useState<ResourceSlot[] | null>(null);
    const [resourceSlotIDS, setResourceSlotIDS] = useState<string[]>([]);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState("");

    // Only load the resource slot list once the form is actually opened
    React.useEffect(() => {
        if (!isDialogOpen || resourceSlots !== null) return;
        OmniAPI.getEvery("resourceslots").then(setResourceSlots).catch(() => setResourceSlots([]));
    }, [isDialogOpen]);

    const toggleSlot = (id: string) => {
        setResourceSlotIDS(prev => prev.includes(id) ? prev.filter(item => item !== id) : [...prev, id]);
    };

    const setOpenExtra = (state: boolean, mach: MachineType | null) => {
        setError("");
        setMachineType(mach);
        setName(mach?.name ?? "");
        setResourceSlotIDS(mach?.resource_slot_ids ?? []);
        setCost(mach?.cost_per_hour != null ? Number(mach.cost_per_hour) : 0);
        if (isDialogOpen != state) setIsDialogOpen(state);
    };

    const save = async () => {
        if (machineType == null ? !canCreate : !canEdit) {
            setError("You do not have the permissions to do this.");
            return;
        }
        if (!name.trim() || cost === "") {
            setError("Name and hourly cost must be filled in.");
            return;
        }
        setBusy(true);
        setError("");
        try {
            const body = { name: name.trim(), resource_slot_ids: resourceSlotIDS, cost_per_hour: String(cost) };
            if (machineType) await OmniAPI.edit("machinetypes", machineType.id, body);
            else await OmniAPI.create("machinetypes", body);
            refresh();
            setOpenExtra(false, null);
        } catch (err) {
            setError(errorMessage(err, "Could not save the machine type."));
        } finally {
            setBusy(false);
        }
    };

    if (!canSeeTables || (!canCreate && !canEdit)) return [<></>, () => {}];
    return [(
        <AdminFormDialog
            open={isDialogOpen}
            onOpenChange={(open) => { if (!open) setOpenExtra(false, null); }}
            title={machineType == null ? "Adding a Machine Type" : "Editing a Machine Type"}
            onSubmit={save}
            busy={busy}
            error={error}
            trigger={canCreate && (
                <button className="addbtn" aria-label="Add a machine type" onClick={() => setOpenExtra(true, null)}><PlusIcon /></button>
            )}
        >
            <AdminField label="Machine Type Name" htmlFor="type-name">
                <input id="type-name" value={name} onChange={e => setName(e.target.value)} maxLength={100} required />
            </AdminField>
            <AdminField label="Hourly Usage Cost" htmlFor="type-cost">
                <input
                    id="type-cost"
                    type="number"
                    inputMode="decimal"
                    min={0}
                    step="any"
                    value={cost}
                    onChange={e => setCost(e.target.value === "" ? "" : Math.max(0, Number(e.target.value)))}
                    required
                />
            </AdminField>
            <AdminFormHeading>Resources</AdminFormHeading>
            <AdminCheckList empty={resourceSlots === null ? "Loading…" : "No resource slots yet."}>
                {(resourceSlots ?? []).map((slot) => (
                    <AdminCheck
                        key={slot.id}
                        id={`type-slot-${slot.id}`}
                        label={slot.display_name}
                        checked={resourceSlotIDS.includes(slot.id)}
                        onChange={() => toggleSlot(slot.id)}
                    />
                ))}
            </AdminCheckList>
        </AdminFormDialog>
    ), setOpenExtra];
};

const MachineTypes: React.FC = () => {
    const { hasPermission } = useAuth();
    const canDelete = hasPermission(UserPermission.CAN_DELETE_MACHINE_TYPES);
    const canEdit = hasPermission(UserPermission.CAN_EDIT_MACHINE_TYPES);

    const { data, currentPage, hasNext, loading, error, fetchPage, refresh: refreshPage } = usePagedList<MachineType>("machinetypes");

    const columnDefs: ColumnDef<MachineType>[] = [
        { key: 'name', label: 'Name', render: (t) => t.name },
        { key: 'machines', label: 'Machines', render: (t) => String(t.num_machines ?? 0) },
        { key: 'slots', label: 'Resource Slots', render: (t) => formatCell(t.resource_slot_names) },
        { key: 'cost', label: 'Cost / Hour', render: (t) => `$${Number(t.cost_per_hour).toFixed(2)}` },
    ];

    const onDelete = (index_local: number) => {
        if (!canDelete) {
            alert("You do not have the permissions to delete machine types");
            return;
        }
        DeleteItem("machinetypes", data[index_local], refreshPage);
    };

    const [machineType, setMachineType] = useState<MachineType | null>(null);
    let [isDialogOpen, setIsDialogOpen] = useState(false);
    let [ae, setOpen] = aemenu({isDialogOpen, setIsDialogOpen, machineType, setMachineType, refresh: refreshPage});

    return (
        <div className='tab-column-cover align-center'>
            <TableHead
                heading="Machine Types"
                type="machinetypes"
                aemenu={ae}
            />
            <Table<MachineType>
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
                onPageChange={(p) => fetchPage(p)}
                resourceType={"machinetypes"}
            />
        </div>
    );
};

export default MachineTypes;