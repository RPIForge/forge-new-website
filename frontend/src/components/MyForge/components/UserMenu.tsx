import React from 'react';
import useAuth from '../../Auth/useAuth';
import { Link } from 'react-router-dom';
import * as Avatar from './Avatar';
import { UserPermission } from "../../../enums";
import { DoubleArrowLeftIcon } from '@radix-ui/react-icons';
import { canUseAdmin } from '../../Admin/adminSections';

import '../styles/UserMenu.scss';

interface UserMenuProps {
    isOpen: boolean;
    onClose: () => void;
}

const UserMenu: React.FC<UserMenuProps> = ({ isOpen, onClose }) => {

    const { user, hasPermission } = useAuth();

    return (
    <div className={`sidebar ${isOpen ? 'open' : 'collapsed'}`} aria-hidden={!isOpen}>
            <button type='button' className='sidebar-close' onClick={onClose} aria-label='Collapse menu'>
                <DoubleArrowLeftIcon />
            </button>
            <div className='user-summary'>
                <Avatar.default 
                    user = {user}
                    isNav = {false}
                />
                <h2>{user.first_name} {user.last_name}</h2>
                <h3>{user.display_role}</h3>
            </div>
            <div className="divider" />
            <nav className='options-container'>
                <ul className='user-options member'>
                    <li><Link to='/myforge/summary' className='btn'>Summary</Link></li>
                    { (hasPermission(UserPermission.CAN_USE_MACHINES) || hasPermission(UserPermission.CAN_USE_MACHINES_BETWEEN_SEMESTERS)) && (
                        <li><Link to='/myforge/create' className='btn'>Use a Machine</Link></li>
                    )}
                    <li><Link to='/myforge/usages' className='btn'>Usages</Link></li>
                </ul>
                { hasPermission(UserPermission.CAN_FAIL_MACHINES) && (
                    <hr className='divider' />
                )}
                { hasPermission(UserPermission.CAN_FAIL_MACHINES) && (
                    <ul className='user-options volunteer'>
                        <li><Link to='/myforge/fail' className='btn'>Failure Form</Link></li>
                    </ul>
                )}
                { canUseAdmin(hasPermission) && (
                    <>
                        <hr className='divider' />
                        <ul className='user-options manager'>
                            <li><Link to='/admin' className='btn'>Admin</Link></li>
                        </ul>
                    </>
                )}
            </nav>
        </div>
    );
};

export default UserMenu;