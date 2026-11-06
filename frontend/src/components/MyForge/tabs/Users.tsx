import React, { useState, useEffect } from 'react';
import { OmniAPI } from 'src/apis/OmniAPI';
import Table, { DeleteItem, ITEMS_PER_PAGE, TableHead } from '../components/Table';
import { User } from 'src/interfaces';
import { UserPermission } from 'src/enums';
import useAuth from '../../Auth/useAuth';

import '../styles/TabStyles.scss';

interface aemenuprops {
    isDialogOpen: boolean;
    setIsDialogOpen: (open: boolean) => void;
    user: User | null;
    setUser (user: User | null) => void;
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
        setUser(user);
        if (user != null) {
            setIsRpiStaff(user.is_rpi_staff?user.is_rpi_staff:false);
            setRCSID(user.RCSID?user.RCSID:"");
            setRIN(user.RIN?user.RIN:"");
            setFirstName(user.first_name?user.first_name:"");
            setLastName(user.last_name?user.last_name:"");
            setMajor(user.major?user.major:"");
            setGenderIdentity(user.gender_identity?user.gender_identity:"");
            setPronouns(user.pronouns?user.pronouns:"");
            setIsGraduating(user.is_graduating?user.is_graduating:false);
        } else {
            setIsRpiStaff(false);
            setRCSID("");
            setRIN("");
            setFirstName("");
            setLastName("");
            setMajor("");
            setGenderIdentity("");
            setPronouns("");
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
        OmniAPI.edit("users", user.id, {is_rpi_staff: isRpiStaff, RCSID: RCSID, RIN: RIN, first_name: firstName, last_name: lastName, major: major, gender_identity: genderIdentity, pronouns: pronouns, is_graduating: isGraduating})
        .then( () => {
            refresh();
            setOpenExtra(false, null);
        });
    }

    
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

    if (!canSeeTables || !canSeeUsers) return null;
    return (
        <div className='tab-column-cover align-center'>
            <TableHead
                heading="Users"
            />
            <Table<User>
                columns={columns}
                data={data}
                currentPage={currentPage}
                onPageChange={fetchPage}
                resourceType="users"
            />
        </div>
    );
};

export default Users;