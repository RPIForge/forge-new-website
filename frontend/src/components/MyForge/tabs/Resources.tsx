import React, { ReactNode } from 'react';
import { useState } from 'react';
import Table, { DeleteItem, TableHead, ITEMS_PER_PAGE, ColumnDef, formatCell, usePagedList } from '../components/Table';
import { Resource } from 'src/interfaces';
import { OmniAPI } from 'src/apis/OmniAPI';
import { UserPermission } from 'src/enums';
import useAuth from '../../Auth/useAuth';

import '../styles/TabStyles.scss';


import { PlusIcon } from "@radix-ui/react-icons";
import { AdminField, AdminFormDialog, errorMessage } from '../../Admin/AdminForm';

interface aemenuprops {
    isDialogOpen: boolean;
    setIsDialogOpen: (open: boolean) => void;
    resource: Resource | null;
    setResource: (resource: Resource | null) => void;
    refresh: () => void;
}

const aemenu = (props: aemenuprops): [ReactNode, (state: boolean, res: Resource | null) => void] => {
    const { isDialogOpen, setIsDialogOpen, resource, setResource, refresh } = props;

    const { hasPermission } = useAuth();
    const canCreate = hasPermission(UserPermission.CAN_CREATE_RESOURCES);
    const canEdit = hasPermission(UserPermission.CAN_EDIT_RESOURCES);
    const canSeeTables = hasPermission(UserPermission.CAN_SEE_TABLES);

    const [name, setName] = useState("");
    const [brand, setBrand] = useState("");
    const [color, setColor] = useState("");
    const [units, setUnits] = useState("");
    const [cost, setCost] = useState<number | "">(0);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState("");

    const setOpenExtra = (state: boolean, res: Resource | null) => {
        setError("");
        setResource(res);
        setName(res?.name ?? "");
        setBrand(res?.brand ?? "");
        setColor(res?.color ?? "");
        setUnits(res?.units ?? "");
        setCost(res?.cost != null ? Number(res.cost) : 0);
        if (isDialogOpen != state) setIsDialogOpen(state);
    };

    const save = async () => {
        if (resource == null ? !canCreate : !canEdit) {
            setError("You do not have the permissions to do this.");
            return;
        }
        if (!name.trim() || !brand.trim() || !color.trim() || !units.trim() || cost === "") {
            setError("All fields must be filled in.");
            return;
        }
        setBusy(true);
        setError("");
        try {
            const body = { name: name.trim(), brand: brand.trim(), color: color.trim(), units: units.trim(), cost };
            if (resource) await OmniAPI.edit("resources", resource.id, body);
            else await OmniAPI.create("resources", body);
            refresh();
            setOpenExtra(false, null);
        } catch (err) {
            setError(errorMessage(err, "Could not save the resource."));
        } finally {
            setBusy(false);
        }
    };

    if (!canSeeTables || (!canCreate && !canEdit)) return [null, () => {}];
    return [(
        <AdminFormDialog
            open={isDialogOpen}
            onOpenChange={(open) => setOpenExtra(open, resource)}
            title={resource == null ? "Adding a Resource" : "Editing a Resource"}
            onSubmit={save}
            busy={busy}
            error={error}
            trigger={canCreate && (
                <button className="addbtn" aria-label="Add a resource" onClick={() => setOpenExtra(true, null)}><PlusIcon /></button>
            )}
        >
            <AdminField label="Resource Name" htmlFor="resource-name">
                <input id="resource-name" value={name} onChange={e => setName(e.target.value)} maxLength={100} required />
            </AdminField>
            <AdminField label="Resource Brand" htmlFor="resource-brand">
                <input id="resource-brand" value={brand} onChange={e => setBrand(e.target.value)} maxLength={100} required />
            </AdminField>
            <AdminField label="Resource Color" htmlFor="resource-color">
                <input id="resource-color" value={color} onChange={e => setColor(e.target.value)} maxLength={100} required />
            </AdminField>
            <AdminField label="Resource Units" htmlFor="resource-units">
                <input id="resource-units" value={units} onChange={e => setUnits(e.target.value)} maxLength={16} placeholder="e.g. g" required />
            </AdminField>
            <AdminField label="Resource Cost" htmlFor="resource-cost">
                <input
                    id="resource-cost"
                    type="number"
                    inputMode="decimal"
                    min={0}
                    step="any"
                    value={cost}
                    onChange={e => setCost(e.target.value === "" ? "" : Math.max(0, Number(e.target.value)))}
                    required
                />
            </AdminField>
        </AdminFormDialog>
    ), setOpenExtra];
}


const Resources: React.FC = () => {
    const { hasPermission } = useAuth();
    const canDelete = hasPermission(UserPermission.CAN_DELETE_RESOURCES);
    const canEdit = hasPermission(UserPermission.CAN_EDIT_RESOURCES);

    const { data, currentPage, hasNext, loading, error, fetchPage, refresh: refreshPage } = usePagedList<Resource>("resources");

    const columnDefs: ColumnDef<Resource>[] = [
        { key: 'name', label: 'Name', render: (r) => r.name },
        { key: 'brand', label: 'Brand', render: (r) => formatCell(r.brand) },
        { key: 'color', label: 'Color', render: (r) => formatCell(r.color) },
        { key: 'cost', label: 'Cost', render: (r) => `$${Number(r.cost).toFixed(2)} / ${r.units || 'unit'}` },
    ];

    const onDelete = (index_local: number, index_real: number) => {
        if (!canDelete) {
            alert("You do not have the permissions to delete resources");
            return;
        }
        DeleteItem("resources", data[index_real], refreshPage);
    };

    let [resource, setResource]:[Resource | null, (resource: any) => void] = useState(null);
    let [isDialogOpen, setIsDialogOpen] = useState(false);
    let [ae, setOpen] = aemenu({isDialogOpen, setIsDialogOpen, resource, setResource, refresh: refreshPage});

    return (
        <div className='tab-column-cover align-center'>
            <TableHead
                heading="Resources"
                type="resources"
                aemenu={ae}
            />
            <Table<Resource>
                columnDefs={columnDefs}
                loading={loading}
                error={error}
                hasNext={hasNext}
                data={data}
                onDelete={onDelete}
                onEdit={(e) => { setOpen(true, e);}}
                canEdit={canEdit}
                canDelete={canDelete}
                currentPage={currentPage}
                onPageChange={fetchPage}
                resourceType="resources"
            />
        </div>
    );
};

export default Resources;