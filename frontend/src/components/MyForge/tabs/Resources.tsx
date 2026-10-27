import React, { ReactNode } from 'react';
import { useState } from 'react';
import Table, {DEFAULT_PAGINATION, features, TableHead} from '../components/Table';
import { Resource } from 'src/interfaces/resources';
import { OmniAPI } from 'src/apis/OmniAPI';
import { UserPermission } from 'src/enums';
import useAuth from '../../Auth/useAuth';

import '../styles/TabStyles.scss';


import {Cross2Icon, PlusIcon} from "@radix-ui/react-icons";
import * as Dialog from '@radix-ui/react-dialog';
import { createColumnHelper, PaginationState } from '@tanstack/react-table';
import { useResources, useResourcesCount } from 'src/hooks/useResources';

interface aemenuprops {
    isDialogOpen: boolean;
    setIsDialogOpen: (open: boolean) => void;
    resource: Resource | null;
    setResource: (resource: Resource | null) => void;
}

const aemenu = (props: aemenuprops): [ReactNode, (state: boolean, res: Resource | null) => void] =>  {
    let { isDialogOpen, setIsDialogOpen, resource, setResource} = props;
    
    const { hasPermission } = useAuth();
    const canCreate = hasPermission(UserPermission.CAN_CREATE_RESOURCES);
    const canEdit = hasPermission(UserPermission.CAN_EDIT_RESOURCES);
    const canSeeTables = hasPermission(UserPermission.CAN_SEE_TABLES);

    const [name, setName] = useState("");
    const [units, setUnits] = useState("");
    const [cost, setCost] = useState(0);

    const setOpenExtra = (state: boolean, res: Resource | null) => {
        setResource(res);
        if (res != null) {
            setName(res.name);
            setUnits(res.units?res.units:"");
            setCost(res.cost?res.cost:0);
        } else {
            setName("");
            setUnits("");
            setCost(0);
        }
        if (isDialogOpen != state) setIsDialogOpen(state);
    };

    function create() {
        if (!canCreate) {
            alert("You do not have the permissions to create resources");
            return;
        }
        if (name == "" || units == "") {
            alert("All fields must be populated!");
            return;
        }
        // OmniAPI.create("resources", {name: name, brand: brand, color: color, units: units, cost: cost})
        // .then( () => {
        //     refresh();
        //     setOpenExtra(false, null);
        // });
    };
    
    function edit() {
        if (!canEdit) {
            alert("You do not have the permissions to edit resources");
            return;
        }
        if (resource == null) {return}
        OmniAPI.edit("resources", resource.id, {name: name, units: units, cost: cost})
        .then( () => {
            // refresh();
            setOpenExtra(false, null);
        });
    }

    if (!canSeeTables || (!canCreate && !canEdit)) return [null, () => {}];
    return [(
        <Dialog.Root open={isDialogOpen} onOpenChange={(e: boolean) => { setOpenExtra(e, resource); }}>
            {canCreate && (
                <button className="addbtn" onClick={() => { setOpenExtra(true, null); }}><PlusIcon /></button>
            )}
            {(canCreate || canEdit) && (
                <Dialog.Portal>
                    <div className='AEdiv'>
                        <Dialog.Overlay className="DialogOverlay" />
                        <Dialog.Content className="DialogContent">
                            <Dialog.Close asChild>
                                <button className="IconButton" aria-label="Close">
                                    <Cross2Icon />
                                </button>
                            </Dialog.Close>
                            <Dialog.Title className="DialogTitle">{resource == null ? "Adding" : "Editing"} Resource</Dialog.Title>

                            <fieldset className="Fieldset">
                                <label className="Label" htmlFor="name">Name</label>
                                <input className="Input" id="name" value={name} onChange={e => setName(e.target.value)} maxLength={100}/>

                                <label className="Label" htmlFor="units">Units</label>
                                <input className="Input" id="units" value={units} onChange={e => setUnits(e.target.value)} maxLength={16}/>

                                <label className="Label" htmlFor="cost">Cost</label>
                                <input className="Input" id="cost" type='number' value={cost} min={0} onChange={e => setCost(Math.max(0, Number(e.target.value) || 0))}/>
                            </fieldset>
                            
                            <Dialog.Close asChild>
                                <button className="Button SaveBtn" onClick={resource == null ? create : edit}>Save</button>
                            </Dialog.Close>
                        </Dialog.Content>
                    </div>
                </Dialog.Portal>
            )}
        </Dialog.Root>
    ), setOpenExtra];
}

const columnHelper = createColumnHelper<typeof features, Resource>();
const columns = columnHelper.columns([
    columnHelper.accessor('name', {
        header: 'Name'
    }),
    columnHelper.accessor('units', {
        header: 'Units'
    }),
    columnHelper.accessor('cost', {
        header: 'Cost'
    }),
]);

const Resources: React.FC = () => {
    const { hasPermission } = useAuth();
    const canDelete = hasPermission(UserPermission.CAN_DELETE_RESOURCES);
    const canEdit = hasPermission(UserPermission.CAN_EDIT_RESOURCES);

    const [page, setPage] = useState<PaginationState>(DEFAULT_PAGINATION);
    const {data} = useResources(page);
    const {data: rowCount} = useResourcesCount();

    const onDelete = (id: string) => {
        if (!canDelete) {
            alert("You do not have the permissions to delete resources");
            return;
        }
        // DeleteItem("resources", data[index_real], refreshPage);
    };

    let [resource, setResource]:[Resource | null, (resource: any) => void] = useState(null);
    let [isDialogOpen, setIsDialogOpen] = useState(false);
    let [ae, setOpen] = aemenu({isDialogOpen, setIsDialogOpen, resource, setResource});

    return (
        <div className='tab-column-cover align-center'>
            <TableHead
                heading="Resources"
                type="resources"
                aemenu={ae}
            />
            <Table<Resource>
                columns={columns}
                data={data}
                pagination={page}
                onPaginationChange={setPage}
                rowCount={rowCount}
                onDelete={onDelete}
                onEdit={(e) => { setOpen(true, e);}}
                canEdit={canEdit}
                canDelete={canDelete}
            />
        </div>
    );
};

export default Resources;