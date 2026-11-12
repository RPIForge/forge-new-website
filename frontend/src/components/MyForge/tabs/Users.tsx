import React, { ReactNode, useState, useEffect } from 'react';
import { OmniAPI } from 'src/apis/OmniAPI';
import Table, { DeleteItem, ITEMS_PER_PAGE, TableHead } from '../components/Table';
import { User } from 'src/interfaces';
import { UserPermission } from 'src/enums';
import useAuth from '../../Auth/useAuth';

import '../styles/TabStyles.scss';
import Majors from '../../../data/sorted_majors.json'
import Genders from '../../../data/genders.json'
import Pronouns from '../../../data/pronouns.json'

import {Cross2Icon, PlusIcon} from "@radix-ui/react-icons";
import * as Dialog from '@radix-ui/react-dialog';

interface aemenuprops {
    isDialogOpen: boolean;
    setIsDialogOpen: (open: boolean) => void;
    user: User | null;
    setUser: (user: User | null) => void;
    refresh: () => void;
}

const AEMenu = (props: aemenuprops): [ReactNode, (state: boolean, user: User | null) => void] => {
    let {isDialogOpen, setIsDialogOpen, user, setUser, refresh} =  props;

    const { hasPermission } = useAuth();
    const canEdit = hasPermission(UserPermission.CAN_EDIT_USERS);
    const canSeeTables = hasPermission(UserPermission.CAN_SEE_USERS);

    const [isRpiStaff, setIsRpiStaff] = useState(false);
    const [RCSID, setRCSID] = useState("");
    const [RIN, setRIN] = useState("");
    const [firstName, setFirstName] = useState("");
    const [lastName, setLastName] = useState("");
    const [major, setMajor] = useState("");
    const [genderIdentity, setGenderIdentity] = useState("");
    const [pronouns, setPronouns] = useState("");
    const [isGraduating, setIsGraduating] = useState(false);

    const setOpenExtra = (state: boolean, user: User | null) => {
        console.log(user);
        setUser(user);
        if (user != null) {
            console.log("user is not null");
            setIsRpiStaff(user.is_rpi_staff?user.is_rpi_staff:false);
            setRCSID(user.RCSID?user.RCSID:"");
            setRIN(user.RIN?user.RIN:"");
            setFirstName(user.first_name?user.first_name:"");
            setLastName(user.last_name?user.last_name:"");
            setMajor(user.major?user.major:"_");
            setGenderIdentity(user.gender_identity?user.gender_identity:"_");
            setPronouns(user.pronouns?user.pronouns:"_");
            setIsGraduating(user.is_graduating?user.is_graduating:false);
        } else {
            console.log("user is null");
            setIsRpiStaff(false);
            setRCSID("");
            setRIN("");
            setFirstName("");
            setLastName("");
            setMajor("_");
            setGenderIdentity("_");
            setPronouns("_");
            setIsGraduating(false);
        }
        if (isDialogOpen != state) setIsDialogOpen(state);
    };

    function edit() {
        if (!canEdit) {
            alert("You do not have the permissions to edit users");
            return;
        }
        if (user == null) {return}
        OmniAPI.edit("users/edit", user.id, {is_rpi_staff: isRpiStaff, RCSID: RCSID, RIN: RIN, first_name: firstName, last_name: lastName, major: major, gender_identity: genderIdentity, pronouns: pronouns, is_graduating: isGraduating})
        .then( () => {
            refresh();
            setOpenExtra(false, null);
        });
    }

    const handleSelectMajor = (id: string) => {
        if (id === "_") {
            return;
        }
        setMajor(id);
    };
    const handleSelectGenderIdentity = (id: string) => {
        if (id === "_") {
            return;
        }
        setGenderIdentity(id);
    }
    const handleSelectPronouns = (id: string) => {
        if (id === "_") {
            return;
        }
        setPronouns(id);
    }

    if (!canSeeTables || !canEdit) return [null, () => {}];
    return [(
        <Dialog.Root open={isDialogOpen} onOpenChange={(e: boolean) => { setOpenExtra(e, user); }}>
            {canEdit && (
                <Dialog.Portal>
                    <div className='AEdiv'>
                        <Dialog.Overlay className="DialogOverlay" />
                        <Dialog.Content className="DialogContent">
                            <Dialog.Close asChild>
                                <button className="IconButton" aria-label="Close">
                                    <Cross2Icon />
                                </button>
                            </Dialog.Close>
                            <Dialog.Title className="DialogTitle">Editing User</Dialog.Title>

                            <fieldset className="Fieldset">
                                <label className="Label" htmlFor="RCSID">RCSID</label>
                                <input className="Input" id="RCSID" value={RCSID} onChange={e => setRCSID(e.target.value)} maxLength={10}/>

                                <label className="Label" htmlFor="RIN">RIN</label>
                                <input className="Input" id="RIN" value={RIN} onChange={e => setRIN(e.target.value)} maxLength={9}/>

                                <label className="Label" htmlFor="first name">First Name</label>
                                <input className="Input" id="first name" value={firstName} onChange={e => setFirstName(e.target.value)} maxLength={100}/>

                                <label className="Label" htmlFor="last name">Last Name</label>
                                <input className="Input" id="last name" value={lastName} onChange={e => setLastName(e.target.value)} maxLength={100}/>

                                <label className="Label" htmlFor="major">Major</label>
                                <select
                                    className='styled-dropdown'
                                    value={major}
                                    onChange={(e) => handleSelectMajor(e.target.value)}
                                    required
                                >
                                    <option className='styled-dropdown-placeholder' value="_" hidden>Select Major</option>
                                    {Majors.Majors.map((major: string) => (
                                        <option className='styled-dropdown-option' key={major} value={major}>{major}</option>
                                    ))}
                                </select>

                                <label className="Label" htmlFor="gender identity">Gender Identity</label>
                                <select
                                    className='styled-dropdown'
                                    value={genderIdentity}
                                    onChange={(e) => handleSelectGenderIdentity(e.target.value)}
                                    required
                                >
                                    <option className='styled-dropdown-placeholder' value="_" hidden>Select Gender Identity</option>
                                    {Genders.Genders.map((gender) => (
                                        <option className='styled-dropdown-option' key={gender.Gender} value={gender.Gender}>{gender['Display Value']}</option>
                                    ))}
                                </select>

                                <label className="Label" htmlFor="pronouns">Pronouns</label> {/* dropdown */}
                                <select
                                    className='styled-dropdown'
                                    value={pronouns}
                                    onChange={(e) => handleSelectPronouns(e.target.value)}
                                    required
                                >
                                    <option className='styled-dropdown-placeholder' value="_" hidden>Select Pronouns</option>
                                    {Pronouns.Pronouns.map((pronouns) => (
                                        <option className='styled-dropdown-option' key={pronouns.Pronouns} value={pronouns.Pronouns}>{pronouns['Display Value']}</option>
                                    ))}
                                </select>

                                <>
                                <div className="checkbox-row">
                                    <div className="checkbox-labels">
                                        <label className="Label" htmlFor="is staff">Is RPI Staff?</label>
                                        <input className="Checkbox" type="checkbox" id="is staff" checked={isRpiStaff} onChange={(e) => setIsRpiStaff(e.target.checked)} />
                                    </div>
                                    <div className="checkbox-labels">
                                        <label className="Label" htmlFor="is graduating">Is Graduating?</label>
                                        <input className="Checkbox" type="checkbox" id="is graduating" checked={isGraduating} onChange={(e) => {setIsGraduating(e.target.checked)}} />
                                    </div>
                                </div>
                                </>
                            </fieldset>
                            
                            <Dialog.Close asChild>
                                <button className="Button SaveBtn" onClick={edit}>Save</button>
                            </Dialog.Close>
                        </Dialog.Content>
                    </div>
                </Dialog.Portal>
            )}
        </Dialog.Root>
    ), setOpenExtra];
}

const Users: React.FC = () => {
    const { hasPermission } = useAuth();
    const canSeeUsers = hasPermission(UserPermission.CAN_SEE_USERS);
    const canSeeTables = hasPermission(UserPermission.CAN_SEE_TABLES);
    const canEdit = hasPermission(UserPermission.CAN_EDIT_USERS);

    const [data, setData] = React.useState<User[]>([]);
    //change this to fix gender id
    const columns: (keyof User)[] = data.length > 0 ? (Object.keys(data[0]) as (keyof User)[]).filter((key) => !key.includes('_id') && key !== 'id') : [];
    const [currentPage, setCurrentPage] = useState(1);

    const fetchPage = (page: number) => {
        const offset = (page - 1) * ITEMS_PER_PAGE;
        OmniAPI.getAll('users', { limit: ITEMS_PER_PAGE, offset }).then((res) => {
            setData(Array.isArray(res) ? res : []);
            setCurrentPage(page);
        });
    };

    React.useEffect(() => {
        fetchPage(1);
    }, []);

    const refreshPage = () => fetchPage(currentPage);

    const onDelete = (index_local: number, index_real: number) => {
        DeleteItem('users', data[index_real], refreshPage);
    };

    let [user, setUser]: [User | null, (user: any) => void] = useState(null);
    let [isDialogOpen, setIsDialogOpen] = useState(false);

    const onEdit = (user: User) => {
        if (!canEdit) {
            alert("You do not have the permissions to edit machines");
            return;
        }
        setUser(user);
        setIsDialogOpen(true);
    };

    let [ae, setOpen] = AEMenu({isDialogOpen, setIsDialogOpen, user, setUser, refresh: refreshPage});

    if (!canSeeTables || !canSeeUsers) return null;
    return (
        <div className='tab-column-cover align-center'>
            <TableHead
                heading="Users"
                type="users"
                aemenu={ae}
            />
            <Table<User>
                columns={columns}
                data={data}
                onEdit={(e) => { setOpen(true, e);}}
                canEdit={canEdit}
                currentPage={currentPage}
                onPageChange={fetchPage}
                resourceType="users"
            />
        </div>
    );
};

export default Users;