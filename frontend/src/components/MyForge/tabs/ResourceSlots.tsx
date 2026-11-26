import React, { ReactNode } from 'react';
import Table, { DeleteItem, TableHead, ITEMS_PER_PAGE, ColumnDef, formatCell, usePagedList } from '../components/Table';
import { OmniAPI } from "src/apis/OmniAPI";
import { Resource, ResourceSlot } from 'src/interfaces';

import '../styles/TabStyles.scss';

import { PlusIcon } from "@radix-ui/react-icons";
import { AdminCheck, AdminCheckList, AdminField, AdminFormDialog, AdminFormHeading, errorMessage } from '../../Admin/AdminForm';
import { useState } from 'react';
import { UserPermission } from 'src/enums';
import useAuth from '../../Auth/useAuth';


interface aemenuprops {
    isDialogOpen: boolean;
    setIsDialogOpen: (open: boolean) => void;
    resourceSlot: ResourceSlot | null;
    setResourceSlot: (resourceSlot: ResourceSlot | null) => void;
    refresh: () => void;
}

const resourceLabel = (r: Resource) => {
    const extra = [r.brand, r.color].filter(Boolean).join(' ');
    return extra ? `${r.name} (${extra})` : r.name;
};

const aemenu = (props: aemenuprops): [ReactNode, (state: boolean, rslot: ResourceSlot | null) => void] => {
    const { isDialogOpen, setIsDialogOpen, resourceSlot, setResourceSlot, refresh } = props;

    const { hasPermission } = useAuth();
    const canCreate = hasPermission(UserPermission.CAN_CREATE_RESOURCE_SLOTS);
    const canEdit = hasPermission(UserPermission.CAN_EDIT_RESOURCE_SLOTS);
    const canSeeTables = hasPermission(UserPermission.CAN_SEE_TABLES);

    const [name, setName] = useState("");
    const [resources, setResources] = useState<Resource[] | null>(null);
    const [resourceIDS, setResourceIDS] = useState<string[]>([]);
    const [useown, setUseown] = useState(false);
    const [canempty, setCanempty] = useState(false);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState("");

    // Only load the resource list once the form is actually opened
    React.useEffect(() => {
        if (!isDialogOpen || resources !== null) return;
        OmniAPI.getEvery("resources").then(setResources).catch(() => setResources([]));
    }, [isDialogOpen]);

    const toggleResource = (id: string) => {
        setResourceIDS(prev => prev.includes(id) ? prev.filter(item => item !== id) : [...prev, id]);
    };

    function setOpenExtra(state: boolean, rslot: ResourceSlot | null) {
        setError("");
        setResourceSlot(rslot);
        if (!state) {
            setIsDialogOpen(false);
            return;
        }
        if (rslot != null) {
            setName(rslot.display_name);
            OmniAPI.get("resourceslots", rslot.id).then((r: ResourceSlot) => {
                setResourceIDS(r.valid_resource_ids ?? []);
                setCanempty(r.allow_empty);
                setUseown(r.allow_own_material);
                setIsDialogOpen(true);
            });
        } else {
            setName("");
            setResourceIDS([]);
            setCanempty(false);
            setUseown(false);
            setIsDialogOpen(true);
        }
    }

    const save = async () => {
        if (resourceSlot == null ? !canCreate : !canEdit) {
            setError("You do not have the permissions to do this.");
            return;
        }
        if (!name.trim()) {
            setError("Slot name must be filled in.");
            return;
        }
        setBusy(true);
        setError("");
        try {
            const body = {
                db_name: name.trim(),
                display_name: name.trim(),
                resource_ids: resourceIDS,
                allow_empty: canempty,
                allow_own_material: useown,
            };
            if (resourceSlot) await OmniAPI.edit("resourceslots", resourceSlot.id, body);
            else await OmniAPI.create("resourceslots", body);
            refresh();
            setOpenExtra(false, null);
        } catch (err) {
            setError(errorMessage(err, "Could not save the resource slot."));
        } finally {
            setBusy(false);
        }
    };

    if (!canSeeTables || (!canCreate && !canEdit)) return [<></>, () => {}];
    return [(
        <AdminFormDialog
            open={isDialogOpen}
            onOpenChange={(open) => setOpenExtra(open, resourceSlot)}
            title={resourceSlot == null ? "Adding a Resource Slot" : "Editing a Resource Slot"}
            onSubmit={save}
            busy={busy}
            error={error}
            trigger={canCreate && (
                <button className="addbtn" aria-label="Add a resource slot" onClick={() => setOpenExtra(true, null)}><PlusIcon /></button>
            )}
        >
            <AdminField label="Slot Name" htmlFor="slot-name">
                <input id="slot-name" value={name} onChange={e => setName(e.target.value)} maxLength={100} required />
            </AdminField>
            <AdminFormHeading>Resources</AdminFormHeading>
            <AdminCheckList empty={resources === null ? "Loading…" : "No resources yet."}>
                {(resources ?? []).map((resource) => (
                    <AdminCheck
                        key={resource.id}
                        id={`slot-resource-${resource.id}`}
                        label={resourceLabel(resource)}
                        checked={resourceIDS.includes(resource.id)}
                        onChange={() => toggleResource(resource.id)}
                    />
                ))}
            </AdminCheckList>
            <AdminFormHeading>Restrictions</AdminFormHeading>
            <AdminCheck id="slot-allow-empty" label="Allow empty" checked={canempty} onChange={setCanempty} />
            <AdminCheck id="slot-allow-own" label="Allow own material" checked={useown} onChange={setUseown} />
        </AdminFormDialog>
    ), setOpenExtra];
}

const ResourceSlots: React.FC = () => {
    const { hasPermission } = useAuth();
    const canDelete = hasPermission(UserPermission.CAN_DELETE_RESOURCE_SLOTS);
    const canEdit = hasPermission(UserPermission.CAN_EDIT_RESOURCE_SLOTS);

    const { data, currentPage, hasNext, loading, error, fetchPage, refresh: refreshPage } = usePagedList<ResourceSlot>("resourceslots");

    const columnDefs: ColumnDef<ResourceSlot>[] = [
        { key: 'name', label: 'Name', render: (r) => r.display_name },
        { key: 'resources', label: 'Resources', render: (r) => formatCell(r.resource_names) },
        {
            key: 'allows',
            label: 'Allows',
            render: (r) => [r.allow_empty && 'Empty', r.allow_own_material && 'Own material'].filter(Boolean).join(', ') || '—',
        },
    ];

    const onDelete = (index_local: number) => {
        if (!canDelete) {
            alert("You do not have the permissions to delete resource slots");
            return;
        }
        DeleteItem("resourceslots", data[index_local], refreshPage);
    };
    
    let [resourceSlot, setResourceSlot]:[ResourceSlot | null, (resourceSlot: any) => void] = useState(null);
    let [isDialogOpen, setIsDialogOpen] = useState(false);
    let [ae, setOpen] = aemenu({isDialogOpen, setIsDialogOpen, resourceSlot, setResourceSlot, refresh: refreshPage});

    return (
        <div className='tab-column-cover align-center'>
            <TableHead
                heading="Resource Slots"
                type='resourceslots'
                aemenu={ae}
            />
            <Table<ResourceSlot>
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
                resourceType="resourceslots"
            />
        </div>
    );
};

export default ResourceSlots;